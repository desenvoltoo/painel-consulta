import asyncio
import json
import os
import time

import redis.asyncio as redis

import main as worker

MIN_TELEGRAM_INTERVAL_SECONDS = float(os.getenv("TELEGRAM_MIN_INTERVAL_SECONDS", "12"))
RATE_LIMIT_KEY = os.getenv("TELEGRAM_RATE_LIMIT_KEY", "painel-consulta:telegram:last-send")
RATE_LIMIT_MESSAGE = "Você está consultando rápido demais"
BOT_COOLDOWN_SECONDS = float(os.getenv("TELEGRAM_BOT_COOLDOWN_SECONDS", "20"))

_original_process_job = worker.process_job
_original_start_file_server = worker.start_file_server


async def paced_process_job(client, redis_client, group_entity, bot_entity, raw_job: str, job: dict, current_job: dict) -> None:
    while True:
        now = time.time()
        last_sent_raw = await redis_client.get(RATE_LIMIT_KEY)
        last_sent = float(last_sent_raw or 0)
        wait_for = MIN_TELEGRAM_INTERVAL_SECONDS - (now - last_sent)
        if wait_for <= 0:
            break
        current_job.clear()
        current_job.update({
            "id": job.get("id"),
            "command": job.get("command"),
            "batch_id": job.get("batch_id"),
            "status": "aguardando_intervalo",
            "wait_seconds": round(wait_for, 1),
        })
        await asyncio.sleep(min(wait_for, 1.0))

    await redis_client.set(RATE_LIMIT_KEY, str(time.time()), ex=max(int(MIN_TELEGRAM_INTERVAL_SECONDS * 10), 120))
    await _original_process_job(client, redis_client, group_entity, bot_entity, raw_job, job, current_job)

    query_id = str(job.get("id") or "")
    if not query_id:
        return
    content = await redis_client.hget(worker.query_key(query_id), "content") or ""
    if RATE_LIMIT_MESSAGE.lower() not in content.lower():
        return

    attempt = int(job.get("rate_limit_retry", 0))
    max_retries = int(os.getenv("TELEGRAM_RATE_LIMIT_RETRIES", "3"))
    if attempt >= max_retries:
        return

    job["rate_limit_retry"] = attempt + 1
    job["last_error"] = "Bot solicitou intervalo entre consultas"
    await redis_client.hset(
        worker.query_key(query_id),
        mapping={
            "status": "QUEUED",
            "error": "Aguardando intervalo solicitado pelo bot",
            "content": "",
        },
    )
    if job.get("batch_id"):
        await worker.update_batch(redis_client, job.get("batch_id"), "COMPLETED", "QUEUED")
    await asyncio.sleep(BOT_COOLDOWN_SECONDS)
    await redis_client.lpush(worker.QUEUE_NAME, json.dumps(job, ensure_ascii=False))


async def fixed_start_file_server():
    if len(worker.FILE_DOWNLOAD_SECRET) < 32:
        raise RuntimeError("FILE_DOWNLOAD_SECRET deve ter pelo menos 32 caracteres")

    from aiohttp import web

    async def health_handler(_request):
        return web.json_response({"status": "ok", "service": "telegram-file-server"})

    app = web.Application()
    app.router.add_get("/files/{token}", worker.download_handler)
    app.router.add_get("/health", health_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, worker.FILE_SERVER_HOST, worker.FILE_SERVER_PORT).start()
    worker.logger.info("Servidor de arquivos iniciado em %s:%s", worker.FILE_SERVER_HOST, worker.FILE_SERVER_PORT)
    return runner


worker.process_job = paced_process_job
worker.start_file_server = fixed_start_file_server


if __name__ == "__main__":
    asyncio.run(worker.main())
