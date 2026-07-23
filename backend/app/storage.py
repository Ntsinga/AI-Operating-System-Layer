"""Small persistence adapter: PostgreSQL in hosted environments, SQLite locally."""
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DB_PATH = Path(__file__).parents[1] / "procedural_memory.sqlite3"

def postgres_enabled() -> bool:
    return bool(DATABASE_URL)

@contextmanager
def connection():
    if postgres_enabled():
        import psycopg
        conn = psycopg.connect(DATABASE_URL, autocommit=False)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()
    else:
        conn = sqlite3.connect(DB_PATH)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

def execute(conn, sql: str, params=()):
    if postgres_enabled():
        sql = sql.replace("?", "%s")
    return conn.execute(sql, params)
