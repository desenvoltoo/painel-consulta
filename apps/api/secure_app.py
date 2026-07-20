from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from uuid import uuid4

import redis.asyncio as redis
from fastapi import Depends, Request
from jose import JWTError, jwt

from app_wrapper import app
from main import JWT_SECRET, REDIS_URL, admin_user

AUDIT_INDEX = "painel-consulta:audit"
AUDIT_TTL_SECONDS = int(os.getenv("AUDIT_TTL_SECONDS", "7776000"))
AUDIT_MAX_RECORDS = int(os.getenv("AUDIT_MAX_RECORDS", "10000"))
AUDITED_PREFIXES = ("/api/auth/", "/api/admin/", "/api/batches/")
AUDITED_METHODS = {"POST", "PATCH", "PUT", "DELETE"}


def audit_key(event_id: str) -> str:
    return f"painel-consulta:audit:{event_id}"


def request_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")


def actor_from_request(request: Request) -> tuple[str, str]:
    authorization = request.headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        return "anonymous", ""
    try:
        payload = jwt.decode(authorization.split(" ", 1)[1], JWT_SECRET, algorithms=["HS256"])
        return str(payload.get("name") or payload.get("sub") or "unknown"), str(payload.get("sub") or "")
    except JWTError:
        return "invalid-token", ""


@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    should_audit = request.method in AUDITED_METHODS and request.url.path.startswith(AUDITED_PREFIXES)
    started_at = datetime.now(timezone.utc)
    response = await call_next(request)
    if not should_audit:
        return response

    actor, actor_email = actor_from_request(request)
    event_id = str(uuid4())
    finished_at = datetime.now(timezone.utc)
    ip = request_ip(request)
    record = {
        "id": event_id,
        "actor": actor,
        "actor_email": actor_email,
        "method": request.method,
        "path": request.url.path,
        "status_code": response.status_code,
        "ip_hash": hashlib.sha256(ip.encode()).hexdigest(),
        "created_at": started_at.isoformat(),
        "elapsed_ms": round((finished_at - started_at).total_seconds() * 1000),
    }
    client = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        pipe = client.pipeline(transaction=False)
        pipe.hset(audit_key(event_id), mapping={key: str(value) for key, value in record.items()})
        pipe.expire(audit_key(event_id), AUDIT_TTL_SECONDS)
        pipe.zadd(AUDIT_INDEX, {event_id: started_at.timestamp()})
        pipe.zremrangebyrank(AUDIT_INDEX, 0, -(AUDIT_MAX_RECORDS + 1))
        await pipe.execute()
    finally:
        await client.aclose()
    return response


@app.get("/api/admin/audit")
async def list_audit(limit: int = 100, _: dict = Depends(admin_user)) -> list[dict]:
    limit = max(1, min(limit, 500))
    client = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        ids = await client.zrevrange(AUDIT_INDEX, 0, limit - 1)
        result: list[dict] = []
        for event_id in ids:
            item = await client.hgetall(audit_key(event_id))
            if not item:
                continue
            item["status_code"] = int(item.get("status_code", 0))
            item["elapsed_ms"] = int(item.get("elapsed_ms", 0))
            result.append(item)
        return result
    finally:
        await client.aclose()


@app.get("/api/admin/audit/export")
async def export_audit(_: dict = Depends(admin_user)) -> dict:
    client = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        total = await client.zcard(AUDIT_INDEX)
        latest_ids = await client.zrevrange(AUDIT_INDEX, 0, min(total, 1000) - 1) if total else []
        records = []
        for event_id in latest_ids:
            item = await client.hgetall(audit_key(event_id))
            if item:
                records.append(item)
        return {"generated_at": datetime.now(timezone.utc).isoformat(), "total": total, "records": records}
    finally:
        await client.aclose()
