"""Phase 5 learning-mode sessions for semantic workflow recording.

The recorder accepts UI semantics, not screenshots or raw coordinate streams. It is a
development scaffold for the Android AccessibilityService watcher that will feed it.
"""

import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).parents[1] / "procedural_memory.sqlite3"


def _db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.execute(
        """CREATE TABLE IF NOT EXISTS learning_sessions (
            id TEXT PRIMARY KEY,
            intent TEXT NOT NULL,
            app_package TEXT,
            actions_json TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'recording',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    return connection


def start_session(intent: str, app_package: str | None = None) -> dict[str, Any]:
    session_id = str(uuid.uuid4())
    with _db() as connection:
        connection.execute(
            "INSERT INTO learning_sessions(id, intent, app_package) VALUES (?, ?, ?)",
            (session_id, intent[:500], (app_package or "")[:200]),
        )
    return {"sessionId": session_id, "intent": intent[:500], "appPackage": app_package, "status": "recording", "actions": []}


def append_action(session_id: str, action: dict[str, Any]) -> dict[str, Any]:
    with _db() as connection:
        row = connection.execute("SELECT actions_json, status FROM learning_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise KeyError("Learning session was not found.")
        if row[1] != "recording":
            raise ValueError("Learning session is no longer recording.")
        actions = json.loads(row[0])
        # Keep semantic selectors and omit screenshots, passwords, and arbitrary payloads.
        safe = {key: action.get(key) for key in ("surface", "role", "text", "resourceId", "action", "value") if key in action}
        actions.append(safe)
        connection.execute("UPDATE learning_sessions SET actions_json = ? WHERE id = ?", (json.dumps(actions)[:50000], session_id))
    return {"sessionId": session_id, "actionCount": len(actions), "lastAction": safe, "status": "recording"}


def complete_session(session_id: str) -> dict[str, Any]:
    with _db() as connection:
        row = connection.execute("SELECT intent, app_package, actions_json, status FROM learning_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise KeyError("Learning session was not found.")
        if row[3] != "recording":
            raise ValueError("Learning session is no longer recording.")
        actions = json.loads(row[2])
        if not actions:
            raise ValueError("At least one semantic action is required.")
        connection.execute("UPDATE learning_sessions SET status = 'completed' WHERE id = ?", (session_id,))
    from app.procedural_memory import save_procedure
    history = [{"toolName": action.get("action", "ui_action"), "arguments": action} for action in actions]
    save_procedure(row[0], history, success=True, scope=row[1] or "local", outcome="taught")
    return {"sessionId": session_id, "intent": row[0], "appPackage": row[1] or None, "actions": actions, "status": "completed", "procedureSaved": True}
