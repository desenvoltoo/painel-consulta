from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from uuid import uuid4

import redis.asyncio as redis
from passlib.context import CryptContext

REDIS_URL = os.getenv("REDIS_URL", "redis://consulta-redis:6379/0")
USERS_INDEX = "painel-consulta:users"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def user_key(email: str) -> str:
    return f"painel-consulta:user:{email.lower()}"


async def ensure_user(client, name: str, role: str, email_env: str, password_env: str) -> None:
    email = os.getenv(email_env, "").strip().lower()
    password = os.getenv(password_env, "")
    if not email or not password:
        print(f"[usuarios] Ignorado {name}: {email_env} ou {password_env} não configurado.")
        return

    key = user_key(email)
    exists = await client.exists(key)
    if not exists:
        await client.hset(
            key,
            mapping={
                "id": str(uuid4()),
                "name": name,
                "email": email,
                "role": role,
                "password_hash": pwd_context.hash(password),
                "active": "1",
                "must_change_password": "1",
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        print(f"[usuarios] Criado: {name} <{email}>")
    else:
        current = await client.hgetall(key)
        repairs: dict[str, str] = {}
        if not current.get("id"):
            repairs["id"] = str(uuid4())
        if not current.get("name"):
            repairs["name"] = name
        if not current.get("email"):
            repairs["email"] = email
        if not current.get("role"):
            repairs["role"] = role
        if not current.get("active"):
            repairs["active"] = "1"
        if not current.get("created_at"):
            repairs["created_at"] = datetime.now(timezone.utc).isoformat()
        if repairs:
            await client.hset(key, mapping=repairs)
        print(f"[usuarios] Localizado e indexado: {name} <{email}>")

    await client.sadd(USERS_INDEX, email)


async def repair_orphan_users(client) -> int:
    repaired = 0
    async for key in client.scan_iter(match="painel-consulta:user:*"):
        email = key.removeprefix("painel-consulta:user:").strip().lower()
        if email:
            await client.sadd(USERS_INDEX, email)
            repaired += 1
    return repaired


async def main() -> None:
    client = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        await client.ping()
        definitions = [
            ("Matheus", "ADMIN", "MATHEUS_EMAIL", "MATHEUS_PASSWORD"),
            ("Nilza", "OPERADOR", "NILZA_EMAIL", "NILZA_PASSWORD"),
            ("Robô", "OPERADOR", "ROBO_EMAIL", "ROBO_PASSWORD"),
        ]
        for definition in definitions:
            await ensure_user(client, *definition)
        repaired = await repair_orphan_users(client)
        total = await client.scard(USERS_INDEX)
        print(f"[usuarios] Índice reparado. Chaves encontradas: {repaired}. Total indexado: {total}.")
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
