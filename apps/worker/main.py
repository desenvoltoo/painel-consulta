import asyncio
import json
import logging
import os
from contextlib import suppress

import redis.asyncio as redis
from telethon import TelegramClient, events, utils

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("telegram-worker")

REDIS_URL = os.getenv("REDIS_URL", "redis://consulta-redis:6379/0")
QUEUE_NAME = os.getenv("QUERY_QUEUE_NAME", "painel-consulta:queries")
QUERY_TIMEOUT_SECONDS = int(os.getenv("QUERY_TIMEOUT_SECONDS", "120"))


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


async def process_job(
    client: TelegramClient,
    redis_client,
    group_entity,
    bot_entity,
    job: dict,
) -> None:
    query_id = job.get("id", "sem-id")
    command = job.get("command", "")
    result_queue = job.get("result_queue")

    if not result_queue:
        logger.error("Consulta %s sem fila de retorno.", query_id)
        return

    loop = asyncio.get_running_loop()
    response_future = loop.create_future()

    async def on_bot_message(event):
        if response_future.done():
            return

        message = event.message
        content = message.raw_text or ""

        if message.file and not content:
            content = f"Arquivo recebido: {message.file.name or 'sem_nome'}"

        response_future.set_result(content)

    handler = client.add_event_handler(
        on_bot_message,
        events.NewMessage(chats=group_entity, from_users=bot_entity),
    )

    try:
        logger.info("Enviando consulta %s ao Telegram.", query_id)
        await client.send_message(group_entity, command)
        content = await asyncio.wait_for(response_future, timeout=QUERY_TIMEOUT_SECONDS)

        await redis_client.rpush(
            result_queue,
            json.dumps(
                {"status": "COMPLETED", "content": content},
                ensure_ascii=False,
            ),
        )
        await redis_client.expire(result_queue, QUERY_TIMEOUT_SECONDS + 60)
        logger.info("Consulta %s concluída.", query_id)
    except asyncio.TimeoutError:
        await redis_client.rpush(
            result_queue,
            json.dumps(
                {
                    "status": "ERROR",
                    "error": "O bot não respondeu dentro do tempo limite.",
                },
                ensure_ascii=False,
            ),
        )
        await redis_client.expire(result_queue, QUERY_TIMEOUT_SECONDS + 60)
        logger.warning("Consulta %s expirou aguardando resposta.", query_id)
    except Exception as exc:
        await redis_client.rpush(
            result_queue,
            json.dumps(
                {"status": "ERROR", "error": str(exc)},
                ensure_ascii=False,
            ),
        )
        await redis_client.expire(result_queue, QUERY_TIMEOUT_SECONDS + 60)
        logger.exception("Falha ao processar consulta %s.", query_id)
    finally:
        client.remove_event_handler(handler)
        if not response_future.done():
            response_future.cancel()
            with suppress(asyncio.CancelledError):
                await response_future


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

    logger.info(
        "Worker pronto. Grupo=%s Bot=@%s Fila=%s",
        utils.get_peer_id(group_entity),
        bot_username,
        QUEUE_NAME,
    )

    try:
        while True:
            item = await redis_client.blpop(QUEUE_NAME, timeout=30)
            if item is None:
                continue

            _, raw_job = item
            try:
                job = json.loads(raw_job)
            except json.JSONDecodeError:
                logger.exception("Job inválido recebido na fila.")
                continue

            await process_job(
                client,
                redis_client,
                group_entity,
                bot_entity,
                job,
            )
    finally:
        await redis_client.aclose()
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
