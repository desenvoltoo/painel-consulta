from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

import redis.asyncio as redis
from fastapi import Depends, HTTPException

from main import REDIS_URL, app, current_user, query_key

FILE_DOWNLOAD_SECRET = os.getenv("FILE_DOWNLOAD_SECRET", "")
FILE_PUBLIC_BASE_URL = os.getenv("FILE_PUBLIC_BASE_URL", "").rstrip("/")
FILE_LINK_TTL_SECONDS = int(os.getenv("FILE_LINK_TTL_SECONDS", "900"))


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
