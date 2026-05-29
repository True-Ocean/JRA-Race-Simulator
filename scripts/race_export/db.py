import os

from dotenv import load_dotenv
from sqlalchemy import create_engine

from .config import DOTENV_PATH


def create_db_engine():
    if not DOTENV_PATH.is_file():
        raise FileNotFoundError(f".env not found: {DOTENV_PATH}")

    load_dotenv(DOTENV_PATH)

    connection_config = {
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASS") or "",
        "host": os.getenv("DB_HOST"),
        "port": os.getenv("DB_PORT"),
        "database": os.getenv("DB_NAME"),
    }

    missing = [k for k, v in connection_config.items() if k != "password" and not v]
    if missing:
        raise ValueError(f"Missing DB env vars: {', '.join(missing)}")

    url = "postgresql://{user}:{password}@{host}:{port}/{database}".format(
        **connection_config
    )
    return create_engine(url)
