import asyncio
import json
import logging
import os
from contextlib import suppress
from datetime import datetime, timezone

import redis.asyncio as redis
from telethon import TelegramClient, events, utils

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("telegram-worker")

REDIS_URL = os.getenv("REDIS_URL", "redis://consulta-redis:6379/0")
QUEUE_NAME = os.getenv("QUERY_QUEUE_NAME", "painel-consulta:queries")
PROCESSING_QUEUE_NAME = os.getenv("QUERY_PROCESSING_QUEUE_NAME", "painel-consulta:processing")
WORKER_HEARTBEAT_KEY = os.getenv("WORKER_HEARTBEAT_KEY", "painel-consulta:worker:heartbeat")
QUERY_TIMEOUT_SECONDS = int(os.getenv("QUERY_TIMEOUT_SECONDS", "120"))
HEARTBEAT_SECONDS = int(os.getenv("WORKER_HEARTBEAT_SECONDS", "10"))
RESPONSE_SETTLE_SECONDS = float(os.getenv("TELEGRAM_RESPONSE_SETTLE_SECONDS", "1.2"))


async def resolve_group(client: TelegramClient, configured_id: int):
    try:
        return await client.get_entity(configured_id)
    except Exception:
        logger.warning("ID direto do grupo não foi resolvido; procurando nos diálogos...")

    target = abs(configured_id)
    async for dialog in client.iter_dialogs():
        entity = dialog.entity
        raw_id = getattr(entity, "id", None)
        marked_id = utils.get_peer_id(entity)
        if raw_id == target or abs(marked_id) == target or marked_id == configured_id:
            logger.info("Grupo resolvido: %s (%s)", dialog.name, marked_id)
            return entity

    raise RuntimeError(f"Grupo Telegram não encontrado para o ID {configured_id}")


async def heartbeat_loop(redis_client, group_entity, bot_username: str, current_job: dict) -> None:
    while True:
        payload = {
            "status": "online",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "group_id": utils.get_peer_id(group_entity),
            "bot": f"@{bot_username}",
            "current_query_id": current_job.get("id"),
            "current_command": current_job.get("command"),
        }
        await redis_client.set(
            WORKER_HEARTBEAT_KEY,
            json.dumps(payload, ensure_ascii=False),
            ex=max(HEARTBEAT_SECONDS * 3, 30),
        )
        await asyncio.sleep(HEARTBEAT_SECONDS)


async def recover_processing_jobs(redis_client) -> int:
    recovered = 0
    while True:
        raw_job = await redis_client.rpop(PROCESSING_QUEUE_NAME)
        if raw_job is None:
            break
        await redis_client.rpush(QUEUE_NAME, raw_job)
        recovered += 1
    if recovered:
        logger.warning("%s consulta(s) recuperada(s) da fila de processamento.", recovered)
    return recovered


async def publish_result(redis_client, result_queue: str, payload: dict) -> None:
    await redis_client.rpush(result_queue, json.dumps(payload, ensure_ascii=False))
    await redis_client.expire(result_queue, QUERY_TIMEOUT_SECONDS + 60)


async def process_job(
    client: TelegramClient,
    redis_client,
    group_entity,
    bot_entity,
    raw_job: str,
    job: dict,
    current_job: dict,
) -> None:
    query_id = job.get("id", "sem-id")
    command = job.get("command", "")
    result_queue = job.get("result_queue")

    if not result_queue:
        logger.error("Consulta %s sem fila de retorno.", query_id)
        await redis_client.lrem(PROCESSING_QUEUE_NAME, 1, raw_job)
        return

    current_job.clear()
    current_job.update({"id": query_id, "command": command})

    first_response = asyncio.Event()
    response_parts: list[str] = []
    sent_message_id: int | None = None
    sent_at = datetime.now(timezone.utc)

    async def on_bot_message(event):
        nonlocal sent_message_id
        message = event.message

        if sent_message_id is None:
            return
        if message.id <= sent_message_id:
            return
        if message.date and message.date < sent_at:
            return

        reply_to_id = getattr(message, "reply_to_msg_id", None)
        if reply_to_id is not None and reply_to_id != sent_message_id:
            return

        content = message.raw_text or ""
        if message.file:
            file_name = message.file.name or "sem_nome"
            content = content or f"Arquivo recebido: {file_name}"

        if content:
            response_parts.append(content)
            first_response.set()

    event_builder = events.NewMessage(chats=group_entity, from_users=bot_entity)
    client.add_event_handler(on_bot_message, event_builder)

    try:
        logger.info("Enviando consulta %s ao Telegram.", query_id)
        sent_message = await client.send_message(group_entity, command)
        sent_message_id = sent_message.id
        sent_at = sent_message.date or datetime.now(timezone.utc)

        await asyncio.wait_for(first_response.wait(), timeout=QUERY_TIMEOUT_SECONDS)
        await asyncio.sleep(RESPONSE_SETTLE_SECONDS)

        content = "\n\n".join(response_parts).strip()
        await publish_result(
            redis_client,
            result_queue,
            {"status": "COMPLETED", "content": content},
        )
        logger.info("Consulta %s concluída com %s resposta(s).", query_id, len(response_parts))
    except asyncio.TimeoutError:
        await publish_result(
            redis_client,
            result_queue,
            {"status": "ERROR", "error": "O bot não respondeu dentro do tempo limite."},
        )
        logger.warning("Consulta %s expirou aguardando resposta.", query_id)
    except Exception as exc:
        await publish_result(
            redis_client,
            result_queue,
            {"status": "ERROR", "error": str(exc)},
        )
        logger.exception("Falha ao processar consulta %s.", query_id)
    finally:
        client.remove_event_handler(on_bot_message, event_builder)
        await redis_client.lrem(PROCESSING_QUEUE_NAME, 1, raw_job)
        current_job.clear()


async def main() -> None:
    api_id = os.getenv("TELEGRAM_API_ID")
    api_hash = os.getenv("TELEGRAM_API_HASH")
    session_path = os.getenv("TELEGRAM_SESSION_PATH", "/app/sessions/painel-consulta")
    group_id = os.getenv("TELEGRAM_GROUP_ID")
    bot_username = os.getenv("TELEGRAM_RESPONSE_BOT_USERNAME", "sawneybot").lstrip("@")

    missing = [
        name
        for name, value in {
            "TELEGRAM_API_ID": api_id,
            "TELEGRAM_API_HASH": api_hash,
            "TELEGRAM_GROUP_ID": group_id,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"Variáveis obrigatórias ausentes: {', '.join(missing)}")

    client = TelegramClient(session_path, int(api_id), api_hash)
    await client.connect()

    if not await client.is_user_authorized():
        raise RuntimeError("Sessão do Telegram não autorizada.")

    group_entity = await resolve_group(client, int(group_id))
    bot_entity = await client.get_entity(bot_username)
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    await redis_client.ping()
    await recover_processing_jobs(redis_client)

    current_job: dict = {}
    heartbeat_task = asyncio.create_task(
        heartbeat_loop(redis_client, group_entity, bot_username, current_job)
    )

    logger.info(
        "Worker pronto. Grupo=%s Bot=@%s Fila=%s Processamento=%s",
        utils.get_peer_id(group_entity),
        bot_username,
        QUEUE_NAME,
        PROCESSING_QUEUE_NAME,
    )

    try:
        while True:
            raw_job = await redis_client.brpoplpush(
                QUEUE_NAME,
                PROCESSING_QUEUE_NAME,
                timeout=30,
            )
            if raw_job is None:
                continue

            try:
                job = json.loads(raw_job)
            except json.JSONDecodeError:
                logger.exception("Job inválido recebido na fila.")
                await redis_client.lrem(PROCESSING_QUEUE_NAME, 1, raw_job)
                continue

            await process_job(
                client,
                redis_client,
                group_entity,
                bot_entity,
                raw_job,
                job,
                current_job,
            )
    finally:
        heartbeat_task.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat_task
        await redis_client.delete(WORKER_HEARTBEAT_KEY)
        await redis_client.aclose()
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
