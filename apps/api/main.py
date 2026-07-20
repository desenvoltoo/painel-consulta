from __future__ import annotations

import asyncio
import os
import time
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

app = FastAPI(title="Painel de Consulta API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("APP_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"],
)


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
    return {"status": "ok", "service": "painel-consulta-api"}


@app.post("/api/queries", response_model=QueryResponse)
async def create_query(payload: QueryRequest) -> QueryResponse:
    started = time.perf_counter()

    # Integração real será conectada ao worker por Redis.
    # Este retorno permite validar interface, infraestrutura e deploy com segurança.
    await asyncio.sleep(1.1)

    if payload.command.lower() == "/erro":
        raise HTTPException(status_code=502, detail="Falha simulada na comunicação com o Telegram")

    content = (
        "> DADOS DA CONSULTA\n\n"
        f"COMANDO RECEBIDO: {payload.command}\n"
        "STATUS: PROCESSADO\n"
        "ORIGEM: AMBIENTE DE HOMOLOGAÇÃO\n\n"
        "> INFORMAÇÕES\n\n"
        "A interface e a API estão funcionando corretamente.\n"
        "A próxima etapa é conectar a sessão autorizada do Telegram ao worker.\n\n"
        "Consulta concluída com sucesso."
    )

    return QueryResponse(
        id=str(uuid4()),
        command=payload.command,
        status="COMPLETED",
        content=content,
        created_at=datetime.now(timezone.utc),
        elapsed_ms=round((time.perf_counter() - started) * 1000),
    )
