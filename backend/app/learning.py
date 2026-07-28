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
MAX_ACTIONS_JSON_CHARS = 120000
MAX_ACTIONS = 180
ACTION_PRIORITY = {
    "text_input": 0,
    "tap": 1,
    "long_click": 2,
    "selection": 3,
    "screen_transition": 7,
    "scroll": 8,
    "observe": 9,
}


def _record_learning_event(**kwargs: Any) -> None:
    try:
        record_event(**kwargs)
    except Exception:
        # Debug traces are diagnostic only. They must never prevent teaching or
        # replay from working, especially during schema migrations on Render.
        logger.warning("learning_debug_event_failed event=%s", kwargs.get("event"), exc_info=True)


def _compact_screen(screen: Any) -> Any:
    if not isinstance(screen, dict):
        return screen
    visible_texts = screen.get("visibleTexts")
    interactive = screen.get("interactiveElements")
    compacted = {
        "surface": screen.get("surface"),
        "role": screen.get("role"),
        "title": screen.get("title"),
        "visibleTexts": visible_texts[:18] if isinstance(visible_texts, list) else visible_texts,
        "interactiveElements": interactive[:16] if isinstance(interactive, list) else interactive,
    }
    return {key: value for key, value in compacted.items() if value is not None}


def _safe_action_payload(action: dict[str, Any]) -> dict[str, Any]:
    safe = {key: action.get(key) for key in ("schemaVersion", "surface", "role", "text", "contentDescription", "resourceId", "fieldKey", "action", "value", "screenTitle", "screen", "clickable", "enabled") if key in action}
    if "screen" in safe:
        safe["screen"] = _compact_screen(safe["screen"])
    return safe


def _removable_action_index(actions: list[dict[str, Any]]) -> int:
    for removable_type in ("screen_transition", "observe", "scroll"):
        for index, action in enumerate(actions):
            if action.get("action") == removable_type:
                return index
    priorities = [ACTION_PRIORITY.get(str(action.get("action") or ""), 5) for action in actions]
    return max(range(len(actions)), key=lambda index: priorities[index])


def _compact_actions(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep session JSON valid without blindly truncating it.

    Prefer preserving actionable steps. If a session gets too large, drop older
    observe/scroll noise first, then oldest actions only as a last resort.
    """
    compacted = list(actions)
    while len(compacted) > MAX_ACTIONS and len(compacted) > 1:
        compacted.pop(_removable_action_index(compacted))
    while len(json.dumps(compacted, default=str)) > MAX_ACTIONS_JSON_CHARS and len(compacted) > 1:
        compacted.pop(_removable_action_index(compacted))
    return compacted


def _db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH) if not postgres_enabled() else __import__('psycopg').connect(__import__('os').environ['DATABASE_URL'])
    id_definition = "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY" if postgres_enabled() else "INTEGER PRIMARY KEY"
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
    connection.execute(
        f"""CREATE TABLE IF NOT EXISTS learning_actions (
            id {id_definition},
            session_id TEXT NOT NULL,
            sequence INTEGER NOT NULL,
            action_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, sequence)
        )"""
    )
    connection.execute("CREATE INDEX IF NOT EXISTS idx_learning_actions_session_sequence ON learning_actions(session_id, sequence)")
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


def _read_action_rows(connection: sqlite3.Connection, session_id: str, limit: int | None = None) -> list[dict[str, Any]]:
    if limit:
        rows = execute(
            connection,
            "SELECT action_json FROM learning_actions WHERE session_id = ? ORDER BY sequence DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
        return [json.loads(row[0]) for row in reversed(rows)]
    rows = execute(
        connection,
        "SELECT action_json FROM learning_actions WHERE session_id = ? ORDER BY sequence ASC",
        (session_id,),
    ).fetchall()
    return [json.loads(row[0]) for row in rows]


def _read_session_actions(connection: sqlite3.Connection, session_id: str, fallback_actions_json: str) -> list[dict[str, Any]]:
    actions = _read_action_rows(connection, session_id)
    if actions:
        return actions
    return json.loads(fallback_actions_json)


def append_action(session_id: str, action: dict[str, Any]) -> dict[str, Any]:
    with _connection() as connection:
        row = execute(connection, "SELECT actions_json, status FROM learning_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise KeyError("Learning session was not found.")
        if row[1] != "recording":
            raise ValueError("Learning session is no longer recording.")
        actions = json.loads(row[0])
        # Keep semantic selectors and compact screen context; omit screenshots,
        # passwords, and arbitrary payloads.
        safe = _safe_action_payload(action)
        next_sequence = execute(connection, "SELECT COALESCE(MAX(sequence), 0) + 1 FROM learning_actions WHERE session_id = ?", (session_id,)).fetchone()[0]
        execute(
            connection,
            "INSERT INTO learning_actions(session_id, sequence, action_json) VALUES (?, ?, ?)",
            (session_id, int(next_sequence), json.dumps(safe, default=str)),
        )
        summary_actions = _compact_actions(_read_action_rows(connection, session_id, MAX_ACTIONS * 2))
        execute(connection, "UPDATE learning_sessions SET actions_json = ? WHERE id = ?", (json.dumps(summary_actions, default=str), session_id))
        action_count = execute(connection, "SELECT COUNT(*) FROM learning_actions WHERE session_id = ?", (session_id,)).fetchone()[0]
    logger.info("learning_action_appended session=%s action_count=%d action=%s", session_id, action_count, safe.get("action", ""))
    _record_learning_event(
        trace_id=session_id,
        flow="learning",
        event="action_appended",
        session_id=session_id,
        step=int(action_count),
        details={
            "actionCount": int(action_count),
            "action": safe.get("action"),
            "surface": safe.get("surface"),
            "role": safe.get("role"),
            "text": safe.get("text"),
            "contentDescription": safe.get("contentDescription"),
            "resourceId": safe.get("resourceId"),
            "fieldKey": safe.get("fieldKey"),
            "screenTitle": safe.get("screenTitle"),
            "clickable": safe.get("clickable"),
            "enabled": safe.get("enabled"),
            "screen": safe.get("screen"),
        },
    )
    return {"sessionId": session_id, "actionCount": int(action_count), "lastAction": safe, "status": "recording"}


def complete_session(session_id: str) -> dict[str, Any]:
    with _connection() as connection:
        row = execute(connection, "SELECT intent, app_package, actions_json, status FROM learning_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise KeyError("Learning session was not found.")
        if row[3] != "recording":
            raise ValueError("Learning session is no longer recording.")
        actions = _read_session_actions(connection, session_id, row[2])
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
