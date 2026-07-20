from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone
from uuid import uuid4

import redis.asyncio as redis
from fastapi import Depends, Request
from jose import JWTError, jwt

from app_wrapper import app
from main import JWT_SECRET, REDIS_URL, admin_user

logger = logging.getLogger("painel-consulta.audit")

AUDIT_INDEX = "painel-consulta:audit"
AUDIT_TTL_SECONDS = int(os.getenv("AUDIT_TTL_SECONDS", "7776000"))
AUDIT_MAX_RECORDS = int(os.getenv("AUDIT_MAX_RECORDS", "10000"))
AUDITED_PREFIXES = ("/api/auth/", "/api/admin/", "/api/batches/")
AUDITED_EXACT_PATHS = {"/api/queries", "/api/queries/batch"}
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


async def save_audit_record(record: dict, started_at: datetime) -> None:
    client = redis.from_url(REDIS_URL, decode_responses=True)
    event_id = str(record["id"])
    try:
        pipe = client.pipeline(transaction=False)
        pipe.hset(audit_key(event_id), mapping={key: str(value) for key, value in record.items()})
        pipe.expire(audit_key(event_id), AUDIT_TTL_SECONDS)
        pipe.zadd(AUDIT_INDEX, {event_id: started_at.timestamp()})
        pipe.zremrangebyrank(AUDIT_INDEX, 0, -(AUDIT_MAX_RECORDS + 1))
        await pipe.execute()
    finally:
        await client.aclose()


@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    path = request.url.path
    should_audit = request.method in AUDITED_METHODS and (
        path.startswith(AUDITED_PREFIXES) or path in AUDITED_EXACT_PATHS
    )
    if not should_audit:
        return await call_next(request)

    started_at = datetime.now(timezone.utc)
    status_code = 500
    raised: Exception | None = None
    response = None

    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    except Exception as exc:
        raised = exc
        raise
    finally:
        actor, actor_email = actor_from_request(request)
        finished_at = datetime.now(timezone.utc)
        ip = request_ip(request)
        record = {
            "id": str(uuid4()),
            "actor": actor,
            "actor_email": actor_email,
            "method": request.method,
            "path": path,
            "status_code": status_code,
            "ip_hash": hashlib.sha256(ip.encode()).hexdigest(),
            "created_at": started_at.isoformat(),
            "elapsed_ms": round((finished_at - started_at).total_seconds() * 1000),
            "outcome": "exception" if raised else "response",
        }
        try:
            await save_audit_record(record, started_at)
        except Exception:
            logger.exception("Falha ao registrar auditoria para %s %s", request.method, path)


@app.get("/api/admin/audit")
async def list_audit(limit: int = 100, _: dict = Depends(admin_user)) -> list[dict]:
    limit = max(1, min(limit, 500))
    client = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        ids = await client.zrevrange(AUDIT_INDEX, 0, limit - 1)
        if not ids:
            return []
        pipe = client.pipeline(transaction=False)
        for event_id in ids:
            pipe.hgetall(audit_key(event_id))
        raw_items = await pipe.execute()
        result: list[dict] = []
        for item in raw_items:
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
        if not latest_ids:
            return {"generated_at": datetime.now(timezone.utc).isoformat(), "total": total, "records": []}
        pipe = client.pipeline(transaction=False)
        for event_id in latest_ids:
            pipe.hgetall(audit_key(event_id))
        records = [item for item in await pipe.execute() if item]
        return {"generated_at": datetime.now(timezone.utc).isoformat(), "total": total, "records": records}
    finally:
        await client.aclose()
