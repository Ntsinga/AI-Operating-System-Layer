"""Phase 4 procedural memory: persist reusable, privacy-minimized procedures."""

import json
import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).parents[1] / "procedural_memory.sqlite3"


def _db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.execute(
        """CREATE TABLE IF NOT EXISTS procedures (
            id INTEGER PRIMARY KEY,
            intent TEXT NOT NULL,
            steps_json TEXT NOT NULL,
            success INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    return connection


def save_procedure(intent: str, history: list[dict[str, Any]], success: bool = True) -> None:
    """Store a compact trace; never persist tool results, screenshots, or credentials."""
    steps = [
        {"toolName": step.get("toolName"), "arguments": step.get("arguments", {})}
        for step in history
    ]
    with _db() as connection:
        connection.execute(
            "INSERT INTO procedures(intent, steps_json, success) VALUES (?, ?, ?)",
            (intent[:500], json.dumps(steps, default=str)[:50000], int(success)),
        )


def search_procedures(intent: str, limit: int = 3) -> list[dict[str, Any]]:
    terms = [term for term in intent.lower().split() if len(term) > 2][:6]
    if not terms:
        return []
    where = " OR ".join("LOWER(intent) LIKE ?" for _ in terms)
    with _db() as connection:
        rows = connection.execute(
            f"SELECT intent, steps_json, success, created_at FROM procedures WHERE {where} "
            "ORDER BY success DESC, created_at DESC LIMIT ?",
            tuple(f"%{term}%" for term in terms) + (limit,),
        ).fetchall()
    return [
        {"intent": row[0], "steps": json.loads(row[1]), "success": bool(row[2]), "createdAt": row[3]}
        for row in rows
    ]
