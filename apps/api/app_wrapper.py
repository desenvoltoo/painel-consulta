from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone

import redis.asyncio as redis
from fastapi import Depends, HTTPException

from main import (
    PROCESSING_QUEUE_NAME,
    QUEUE_NAME,
    REDIS_URL,
    WORKER_HEARTBEAT_KEY,
    admin_user,
    app,
    current_user,
    query_key,
)

FILE_DOWNLOAD_SECRET = os.getenv("FILE_DOWNLOAD_SECRET", "")
FILE_PUBLIC_BASE_URL = os.getenv("FILE_PUBLIC_BASE_URL", "").rstrip("/")
FILE_LINK_TTL_SECONDS = int(os.getenv("FILE_LINK_TTL_SECONDS", "900"))
DEAD_LETTER_QUEUE_NAME = os.getenv("QUERY_DEAD_LETTER_QUEUE_NAME", "painel-consulta:dead-letter")


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def create_download_token(relative_path: str, filename: str) -> str:
    if len(FILE_DOWNLOAD_SECRET) < 32:
        raise HTTPException(status_code=503, detail="FILE_DOWNLOAD_SECRET não configurado corretamente")
    if not FILE_PUBLIC_BASE_URL:
        raise HTTPException(status_code=503, detail="FILE_PUBLIC_BASE_URL não configurado")
    expires_at = int(time.time()) + FILE_LINK_TTL_SECONDS
    payload = json.dumps({"p": relative_path, "n": filename, "exp": expires_at}, separators=(",", ":"), ensure_ascii=False).encode()
    encoded = b64url_encode(payload)
    signature = hmac.new(FILE_DOWNLOAD_SECRET.encode(), encoded.encode(), hashlib.sha256).digest()
    return f"{encoded}.{b64url_encode(signature)}"


async def load_authorized_query(query_id: str, user: dict) -> dict:
    client = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        data = await client.hgetall(query_key(query_id))
    finally:
        await client.aclose()
    if not data:
        raise HTTPException(status_code=404, detail="Consulta não encontrada")
    owner = data.get("requested_by_email", "").lower()
    if user.get("role") != "ADMIN" and owner != user.get("email", "").lower():
        raise HTTPException(status_code=403, detail="Acesso negado")
    return data


@app.get("/api/queries/{query_id}/attachments")
async def list_query_attachments(query_id: str, user: dict = Depends(current_user)) -> list[dict]:
    data = await load_authorized_query(query_id, user)
    try:
        attachments = json.loads(data.get("attachments", "[]") or "[]")
    except json.JSONDecodeError:
        attachments = []
    result: list[dict] = []
    for item in attachments:
        clean = {
            "id": item.get("id"),
            "name": item.get("name", "arquivo"),
            "size": int(item.get("size", 0) or 0),
            "extension": item.get("extension", ""),
            "stored": bool(item.get("stored", False)),
        }
        if clean["stored"] and item.get("relative_path"):
            token = create_download_token(str(item["relative_path"]), str(clean["name"]))
            clean["download_url"] = f"{FILE_PUBLIC_BASE_URL}/files/{token}"
            clean["expires_in"] = FILE_LINK_TTL_SECONDS
        result.append(clean)
    return result


@app.post("/api/queries/{query_id}/attachments/{attachment_id}/refresh-link")
async def refresh_attachment_link(query_id: str, attachment_id: str, user: dict = Depends(current_user)) -> dict:
    data = await load_authorized_query(query_id, user)
    try:
        attachments = json.loads(data.get("attachments", "[]") or "[]")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Metadados de arquivo inválidos") from exc
    attachment = next((item for item in attachments if str(item.get("id")) == attachment_id), None)
    if not attachment:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    if not attachment.get("stored") or not attachment.get("relative_path"):
        raise HTTPException(status_code=409, detail="Arquivo não está disponível para download")
    token = create_download_token(str(attachment["relative_path"]), str(attachment.get("name", "arquivo")))
    return {
        "id": attachment_id,
        "name": attachment.get("name", "arquivo"),
        "download_url": f"{FILE_PUBLIC_BASE_URL}/files/{token}",
        "expires_in": FILE_LINK_TTL_SECONDS,
    }


@app.get("/api/admin/operations")
async def admin_operations(_: dict = Depends(admin_user)) -> dict:
    client = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        heartbeat_raw = await client.get(WORKER_HEARTBEAT_KEY)
        heartbeat = json.loads(heartbeat_raw) if heartbeat_raw else None
        dead_raw = await client.lrange(DEAD_LETTER_QUEUE_NAME, 0, 19)
        dead_items: list[dict] = []
        for position, raw in enumerate(dead_raw):
            try:
                job = json.loads(raw)
            except json.JSONDecodeError:
                job = {"raw": raw, "invalid": True}
            dead_items.append({
                "position": position,
                "id": job.get("id"),
                "command": job.get("command"),
                "requested_by": job.get("requested_by_name") or job.get("requested_by"),
                "batch_id": job.get("batch_id"),
                "attempts": job.get("attempts") or job.get("attempt"),
                "error": job.get("final_error") or job.get("last_error"),
                "failed_at": job.get("failed_at"),
                "invalid": bool(job.get("invalid")),
            })
        return {
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "worker": "online" if heartbeat else "offline",
            "worker_details": heartbeat,
            "queue_waiting": await client.llen(QUEUE_NAME),
            "queue_processing": await client.llen(PROCESSING_QUEUE_NAME),
            "dead_letter_total": await client.llen(DEAD_LETTER_QUEUE_NAME),
            "dead_letter_items": dead_items,
        }
    finally:
        await client.aclose()


@app.post("/api/admin/dead-letter/{position}/retry")
async def retry_dead_letter(position: int, _: dict = Depends(admin_user)) -> dict:
    if position < 0:
        raise HTTPException(status_code=400, detail="Posição inválida")
    client = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        raw = await client.lindex(DEAD_LETTER_QUEUE_NAME, position)
        if raw is None:
            raise HTTPException(status_code=404, detail="Item não encontrado na fila de falhas")
        try:
            job = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=409, detail="Item inválido não pode ser reenviado") from exc
        job["attempt"] = 0
        job.pop("final_error", None)
        job.pop("failed_at", None)
        job["manual_retry_at"] = datetime.now(timezone.utc).isoformat()
        if job.get("id"):
            await client.hset(query_key(str(job["id"])), mapping={"status": "QUEUED", "error": "", "attempts": 0})
        pipe = client.pipeline()
        pipe.lset(DEAD_LETTER_QUEUE_NAME, position, "__REMOVER__")
        pipe.lrem(DEAD_LETTER_QUEUE_NAME, 1, "__REMOVER__")
        pipe.lpush(QUEUE_NAME, json.dumps(job, ensure_ascii=False))
        await pipe.execute()
        return {"status": "requeued", "id": job.get("id"), "command": job.get("command")}
    finally:
        await client.aclose()


@app.delete("/api/admin/dead-letter")
async def clear_dead_letter(_: dict = Depends(admin_user)) -> dict:
    client = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        removed = await client.delete(DEAD_LETTER_QUEUE_NAME)
        return {"status": "cleared", "removed": bool(removed)}
    finally:
        await client.aclose()
