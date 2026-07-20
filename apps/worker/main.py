import asyncio
import logging
import os

from telethon import TelegramClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("telegram-worker")


async def main() -> None:
    api_id = os.getenv("TELEGRAM_API_ID")
    api_hash = os.getenv("TELEGRAM_API_HASH")
    session_path = os.getenv("TELEGRAM_SESSION_PATH", "/app/sessions/painel-consulta")

    if not api_id or not api_hash:
        logger.warning("Credenciais do Telegram ainda não configuradas. Worker em modo de espera.")
        while True:
            await asyncio.sleep(60)

    client = TelegramClient(session_path, int(api_id), api_hash)
    await client.connect()

    if not await client.is_user_authorized():
        logger.error("Sessão do Telegram não autorizada. Gere a sessão fora do ambiente público antes do deploy.")
        await client.disconnect()
        while True:
            await asyncio.sleep(60)

    logger.info("Worker conectado ao Telegram com uma sessão autorizada.")

    # Próxima etapa: consumir a fila Redis, enviar o comando ao grupo configurado,
    # correlacionar a resposta do bot e persistir o resultado na consulta.
    await client.run_until_disconnected()


if __name__ == "__main__":
    asyncio.run(main())
