from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from uuid import uuid4

import redis.asyncio as redis
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

app = FastAPI(title="Painel de Consulta API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("APP_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REDIS_URL = os.getenv("REDIS_URL", "redis://consulta-redis:6379/0")
QUERY_TIMEOUT_SECONDS = int(os.getenv("QUERY_TIMEOUT_SECONDS", "120"))
QUEUE_NAME = os.getenv("QUERY_QUEUE_NAME", "painel-consulta:queries")


class QueryRequest(BaseModel):
    command: str = Field(min_length=2, max_length=500)

    @field_validator("command")
    @classmethod
    def validate_command(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned.startswith("/"):
            raise ValueError("O comando deve começar com /")
        if "\n" in cleaned or "\r" in cleaned:
            raise ValueError("Envie somente um comando por consulta")
        return cleaned


class QueryResponse(BaseModel):
    id: str
    command: str
    status: str
    content: str
    created_at: datetime
    elapsed_ms: int


@app.get("/api/health")
async def health() -> dict[str, str]:
    client = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        await client.ping()
        return {"status": "ok", "service": "painel-consulta-api", "redis": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Redis indisponível: {exc}") from exc
    finally:
        await client.aclose()


@app.post("/api/queries", response_model=QueryResponse)
async def create_query(payload: QueryRequest) -> QueryResponse:
    started = time.perf_counter()
    query_id = str(uuid4())
    created_at = datetime.now(timezone.utc)
    result_queue = f"painel-consulta:result:{query_id}"
    client = redis.from_url(REDIS_URL, decode_responses=True)

    job = {
        "id": query_id,
        "command": payload.command,
        "created_at": created_at.isoformat(),
        "result_queue": result_queue,
    }

    try:
        await client.rpush(QUEUE_NAME, json.dumps(job, ensure_ascii=False))
        result = await client.blpop(result_queue, timeout=QUERY_TIMEOUT_SECONDS)

        if result is None:
            raise HTTPException(
                status_code=504,
                detail="O Telegram não respondeu dentro do tempo limite.",
            )

        _, raw_result = result
        data = json.loads(raw_result)
        status = data.get("status", "ERROR")

        if status != "COMPLETED":
            raise HTTPException(
                status_code=502,
                detail=data.get("error", "Falha ao processar a consulta no Telegram."),
            )

        return QueryResponse(
            id=query_id,
            command=payload.command,
            status="COMPLETED",
            content=data.get("content", ""),
            created_at=created_at,
            elapsed_ms=round((time.perf_counter() - started) * 1000),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Falha na fila de consultas: {exc}") from exc
    finally:
        await client.delete(result_queue)
        await client.aclose()
