"""Phase 5 learning-mode sessions for semantic workflow recording.

The recorder accepts UI semantics, not screenshots or raw coordinate streams. It is a
development scaffold for the Android AccessibilityService watcher that will feed it.
"""

import json
import logging
import sqlite3
from contextlib import contextmanager
import uuid
from pathlib import Path
from typing import Any
from app.storage import postgres_enabled, execute
from app.debug_events import record_event

DB_PATH = Path(__file__).parents[1] / "procedural_memory.sqlite3"
logger = logging.getLogger("aios.learning")


def _record_learning_event(**kwargs: Any) -> None:
    try:
        record_event(**kwargs)
    except Exception:
        # Debug traces are diagnostic only. They must never prevent teaching or
        # replay from working, especially during schema migrations on Render.
        logger.warning("learning_debug_event_failed event=%s", kwargs.get("event"), exc_info=True)


def _db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH) if not postgres_enabled() else __import__('psycopg').connect(__import__('os').environ['DATABASE_URL'])
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


@contextmanager
def _connection():
    connection = _db()
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def start_session(intent: str, app_package: str | None = None) -> dict[str, Any]:
    session_id = str(uuid.uuid4())
    with _connection() as connection:
        execute(connection,
            "INSERT INTO learning_sessions(id, intent, app_package) VALUES (?, ?, ?)",
            (session_id, intent[:500], (app_package or "")[:200]),
        )
    logger.info("learning_session_started session=%s app=%s", session_id, (app_package or "")[:80])
    _record_learning_event(
        trace_id=session_id,
        flow="learning",
        event="session_started",
        session_id=session_id,
        details={"intent": intent[:500], "appPackage": app_package},
    )
    return {"sessionId": session_id, "intent": intent[:500], "appPackage": app_package, "status": "recording", "actions": []}


def append_action(session_id: str, action: dict[str, Any]) -> dict[str, Any]:
    with _connection() as connection:
        row = execute(connection, "SELECT actions_json, status FROM learning_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise KeyError("Learning session was not found.")
        if row[1] != "recording":
            raise ValueError("Learning session is no longer recording.")
        actions = json.loads(row[0])
        # Keep semantic selectors and omit screenshots, passwords, and arbitrary payloads.
        safe = {key: action.get(key) for key in ("schemaVersion", "surface", "role", "text", "contentDescription", "resourceId", "fieldKey", "action", "value", "screen", "clickable", "enabled") if key in action}
        actions.append(safe)
        execute(connection, "UPDATE learning_sessions SET actions_json = ? WHERE id = ?", (json.dumps(actions)[:50000], session_id))
    logger.info("learning_action_appended session=%s action_count=%d action=%s", session_id, len(actions), safe.get("action", ""))
    _record_learning_event(
        trace_id=session_id,
        flow="learning",
        event="action_appended",
        session_id=session_id,
        step=len(actions),
        details={
            "actionCount": len(actions),
            "action": safe.get("action"),
            "surface": safe.get("surface"),
            "role": safe.get("role"),
            "text": safe.get("text"),
            "contentDescription": safe.get("contentDescription"),
            "resourceId": safe.get("resourceId"),
            "fieldKey": safe.get("fieldKey"),
            "clickable": safe.get("clickable"),
            "enabled": safe.get("enabled"),
            "screen": safe.get("screen"),
        },
    )
    return {"sessionId": session_id, "actionCount": len(actions), "lastAction": safe, "status": "recording"}


def complete_session(session_id: str) -> dict[str, Any]:
    with _connection() as connection:
        row = execute(connection, "SELECT intent, app_package, actions_json, status FROM learning_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise KeyError("Learning session was not found.")
        if row[3] != "recording":
            raise ValueError("Learning session is no longer recording.")
        actions = json.loads(row[2])
        if not actions:
            raise ValueError("At least one semantic action is required.")
        execute(connection, "UPDATE learning_sessions SET status = 'completed' WHERE id = ?", (session_id,))
    from app.procedural_memory import save_procedure
    history = [{"toolName": action.get("action", "ui_action"), "arguments": action} for action in actions]
    save_procedure(row[0], history, success=True, scope=row[1] or "local", outcome="taught", state="draft")
    logger.info("learning_session_completed session=%s actions=%d procedure_saved=true", session_id, len(actions))
    _record_learning_event(
        trace_id=session_id,
        flow="learning",
        event="session_completed",
        session_id=session_id,
        details={"actionCount": len(actions), "appPackage": row[1] or None, "intent": row[0]},
    )
    return {"sessionId": session_id, "intent": row[0], "appPackage": row[1] or None, "actions": actions, "status": "completed", "procedureSaved": True}
