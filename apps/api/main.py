from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import redis.asyncio as redis
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field, field_validator

app = FastAPI(title="Painel de Consulta API", version="0.3.0")
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
JWT_SECRET = os.getenv("JWT_SECRET", "troque-esta-chave-em-producao")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "12"))
MAX_BATCH_ITEMS = int(os.getenv("MAX_BATCH_ITEMS", "50"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def configured_users() -> dict[str, dict[str, str]]:
    users: dict[str, dict[str, str]] = {}
    definitions = [
        ("Matheus", "ADMIN", "MATHEUS_EMAIL", "MATHEUS_PASSWORD"),
        ("Nilza", "OPERADOR", "NILZA_EMAIL", "NILZA_PASSWORD"),
        ("Robô", "OPERADOR", "ROBO_EMAIL", "ROBO_PASSWORD"),
    ]
    for name, role, email_key, password_key in definitions:
        email = os.getenv(email_key, "").strip().lower()
        password = os.getenv(password_key, "")
        if email and password:
            users[email] = {
                "name": name,
                "email": email,
                "role": role,
                "password_hash": pwd_context.hash(password),
            }
    return users


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=200)


class UserResponse(BaseModel):
    name: str
    email: str
    role: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


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


class BatchRequest(BaseModel):
    command_prefix: str = Field(min_length=2, max_length=80)
    values: list[str] = Field(min_length=1)

    @field_validator("command_prefix")
    @classmethod
    def validate_prefix(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned.startswith("/") or " " in cleaned:
            raise ValueError("Prefixo de comando inválido")
        return cleaned

    @field_validator("values")
    @classmethod
    def validate_values(cls, values: list[str]) -> list[str]:
        cleaned = [item.strip() for item in values if item.strip()]
        if not cleaned:
            raise ValueError("Informe ao menos um valor")
        if len(cleaned) > MAX_BATCH_ITEMS:
            raise ValueError(f"O limite por lote é de {MAX_BATCH_ITEMS} itens")
        return cleaned


class QueryResponse(BaseModel):
    id: str
    command: str
    status: str
    content: str
    created_at: datetime
    elapsed_ms: int
    requested_by: str


class BatchItemResponse(BaseModel):
    value: str
    success: bool
    result: QueryResponse | None = None
    error: str | None = None


class BatchResponse(BaseModel):
    total: int
    completed: int
    failed: int
    items: list[BatchItemResponse]


def create_token(user: dict[str, str]) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {
        "sub": user["email"],
        "name": user["name"],
        "role": user["role"],
        "exp": expires,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, str]:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Autenticação necessária")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
        email = str(payload.get("sub", "")).lower()
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada") from exc

    user = configured_users().get(email)
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    return user


async def execute_query(command: str, user: dict[str, str]) -> QueryResponse:
    started = time.perf_counter()
    query_id = str(uuid4())
    created_at = datetime.now(timezone.utc)
    result_queue = f"painel-consulta:result:{query_id}"
    client = redis.from_url(REDIS_URL, decode_responses=True)
    job = {
        "id": query_id,
        "command": command,
        "created_at": created_at.isoformat(),
        "result_queue": result_queue,
        "requested_by": user["email"],
    }

    try:
        await client.rpush(QUEUE_NAME, json.dumps(job, ensure_ascii=False))
        result = await client.blpop(result_queue, timeout=QUERY_TIMEOUT_SECONDS)
        if result is None:
            raise HTTPException(status_code=504, detail="O Telegram não respondeu dentro do tempo limite.")

        _, raw_result = result
        data = json.loads(raw_result)
        if data.get("status") != "COMPLETED":
            raise HTTPException(status_code=502, detail=data.get("error", "Falha no Telegram"))

        return QueryResponse(
            id=query_id,
            command=command,
            status="COMPLETED",
            content=data.get("content", ""),
            created_at=created_at,
            elapsed_ms=round((time.perf_counter() - started) * 1000),
            requested_by=user["name"],
        )
    finally:
        await client.delete(result_queue)
        await client.aclose()


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


@app.post("/api/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest) -> LoginResponse:
    user = configured_users().get(payload.email.lower())
    if not user or not pwd_context.verify(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")
    return LoginResponse(
        access_token=create_token(user),
        user=UserResponse(name=user["name"], email=user["email"], role=user["role"]),
    )


@app.get("/api/auth/me", response_model=UserResponse)
async def me(user: dict[str, str] = Depends(current_user)) -> UserResponse:
    return UserResponse(name=user["name"], email=user["email"], role=user["role"])


@app.post("/api/queries", response_model=QueryResponse)
async def create_query(
    payload: QueryRequest,
    user: dict[str, str] = Depends(current_user),
) -> QueryResponse:
    return await execute_query(payload.command, user)


@app.post("/api/queries/batch", response_model=BatchResponse)
async def create_batch(
    payload: BatchRequest,
    user: dict[str, str] = Depends(current_user),
) -> BatchResponse:
    items: list[BatchItemResponse] = []
    for value in payload.values:
        command = f"{payload.command_prefix} {value}".strip()
        try:
            result = await execute_query(command, user)
            items.append(BatchItemResponse(value=value, success=True, result=result))
        except HTTPException as exc:
            items.append(BatchItemResponse(value=value, success=False, error=str(exc.detail)))
        except Exception as exc:
            items.append(BatchItemResponse(value=value, success=False, error=str(exc)))
        await asyncio.sleep(0.4)

    completed = sum(1 for item in items if item.success)
    return BatchResponse(
        total=len(items),
        completed=completed,
        failed=len(items) - completed,
        items=items,
    )
