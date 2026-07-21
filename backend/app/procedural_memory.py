"""Phase 4 procedural memory: persist reusable, privacy-minimized procedures."""

import json
import hashlib
import os
import sqlite3
from pathlib import Path
from typing import Any
from cryptography.fernet import Fernet

DB_PATH = Path(__file__).parents[1] / "procedural_memory.sqlite3"


def _db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.execute(
        """CREATE TABLE IF NOT EXISTS procedures (
            id INTEGER PRIMARY KEY,
            intent TEXT NOT NULL,
            steps_json TEXT NOT NULL,
            success INTEGER NOT NULL DEFAULT 1,
            outcome TEXT NOT NULL DEFAULT 'succeeded',
            scope TEXT NOT NULL DEFAULT 'local',
            fingerprint TEXT NOT NULL DEFAULT '',
            version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    for statement in (
        "ALTER TABLE procedures ADD COLUMN outcome TEXT NOT NULL DEFAULT 'succeeded'",
        "ALTER TABLE procedures ADD COLUMN scope TEXT NOT NULL DEFAULT 'local'",
        "ALTER TABLE procedures ADD COLUMN fingerprint TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE procedures ADD COLUMN version INTEGER NOT NULL DEFAULT 1",
    ):
        try:
            connection.execute(statement)
        except sqlite3.OperationalError:
            pass
    return connection


def _cipher() -> Fernet | None:
    key = os.getenv("GOOGLE_TOKEN_ENCRYPTION_KEY")
    return Fernet(key.encode()) if key else None


def _encode(value: str) -> str:
    cipher = _cipher()
    return cipher.encrypt(value.encode()).decode() if cipher else value


def _decode(value: str) -> str:
    cipher = _cipher()
    return cipher.decrypt(value.encode()).decode() if cipher else value


def save_procedure(intent: str, history: list[dict[str, Any]], success: bool = True, scope: str = "local", outcome: str = "succeeded") -> None:
    """Store a versioned trace; encrypt the step payload when the production key is configured."""
    steps = [
        {"toolName": step.get("toolName"), "arguments": step.get("arguments", {})}
        for step in history
    ]
    serialized = json.dumps(steps, default=str, sort_keys=True)[:50000]
    fingerprint = hashlib.sha256(f"{scope}:{intent.lower()}:{serialized}".encode()).hexdigest()
    with _db() as connection:
        previous = connection.execute("SELECT id FROM procedures WHERE scope = ? AND fingerprint = ? LIMIT 1", (scope[:200], fingerprint)).fetchone()
        if previous:
            connection.execute(
                "UPDATE procedures SET success = ?, outcome = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
                (int(success), outcome[:40], previous[0]),
            )
            return
        latest = connection.execute("SELECT COALESCE(MAX(version), 0) FROM procedures WHERE scope = ? AND LOWER(intent) = LOWER(?)", (scope[:200], intent[:500])).fetchone()
        version = latest[0] + 1
        connection.execute(
            "INSERT INTO procedures(intent, steps_json, success, outcome, scope, fingerprint, version) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (intent[:500], _encode(serialized), int(success), outcome[:40], scope[:200], fingerprint, version),
        )


def search_procedures(intent: str, limit: int = 3) -> list[dict[str, Any]]:
    terms = [term for term in intent.lower().split() if len(term) > 2][:6]
    if not terms:
        return []
    where = " OR ".join("LOWER(intent) LIKE ?" for _ in terms)
    with _db() as connection:
        rows = connection.execute(
            f"SELECT id, intent, steps_json, success, outcome, scope, version, created_at FROM procedures WHERE {where} "
            "ORDER BY success DESC, created_at DESC LIMIT ?",
            tuple(f"%{term}%" for term in terms) + (limit,),
        ).fetchall()
    return [
        {"id": row[0], "intent": row[1], "steps": json.loads(_decode(row[2])), "success": bool(row[3]), "outcome": row[4], "scope": row[5], "version": row[6], "createdAt": row[7]}
        for row in rows
    ]


def list_procedures(limit: int = 50) -> list[dict[str, Any]]:
    with _db() as connection:
        rows = connection.execute(
            "SELECT id, intent, steps_json, success, outcome, scope, version, created_at FROM procedures "
            "ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        {"id": row[0], "intent": row[1], "steps": json.loads(_decode(row[2])), "success": bool(row[3]), "outcome": row[4], "scope": row[5], "version": row[6], "createdAt": row[7]}
        for row in rows
    ]


def delete_procedure(procedure_id: int) -> bool:
    with _db() as connection:
        cursor = connection.execute("DELETE FROM procedures WHERE id = ?", (procedure_id,))
        return cursor.rowcount > 0
