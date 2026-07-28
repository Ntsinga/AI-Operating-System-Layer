"""Phase 4 procedural memory: persist reusable, privacy-minimized procedures."""

import json
import hashlib
import logging
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from app.storage import connection, execute, postgres_enabled
from typing import Any
try:
    from cryptography.fernet import Fernet
except ImportError:  # pragma: no cover - production requirements install cryptography
    Fernet = None  # type: ignore[assignment,misc]

DB_PATH = Path(__file__).parents[1] / "procedural_memory.sqlite3"
logger = logging.getLogger("aios.procedural_memory")
MAX_STEPS_JSON_CHARS = 50000
STEP_ACTION_PRIORITY = {
    "tap": 0,
    "focus": 0,
    "selection": 0,
    "long_click": 0,
    "text_input": 1,
    "screen_transition": 7,
    "scroll": 8,
    "observe": 9,
}
ACTIONABLE_TYPES = {"tap", "focus", "text_input", "long_click", "selection", "scroll"}


def _db():
    connection = sqlite3.connect(DB_PATH) if not postgres_enabled() else __import__('psycopg').connect(os.environ['DATABASE_URL'])
    id_definition = "INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY" if postgres_enabled() else "INTEGER PRIMARY KEY"
    connection.execute(
        f"""CREATE TABLE IF NOT EXISTS procedures (
            id {id_definition},
            intent TEXT NOT NULL,
            steps_json TEXT NOT NULL,
            success INTEGER NOT NULL DEFAULT 1,
            outcome TEXT NOT NULL DEFAULT 'succeeded',
            scope TEXT NOT NULL DEFAULT 'local',
            fingerprint TEXT NOT NULL DEFAULT '',
            version INTEGER NOT NULL DEFAULT 1,
            state TEXT NOT NULL DEFAULT 'approved',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    if not postgres_enabled():
        statements = (
        "ALTER TABLE procedures ADD COLUMN outcome TEXT NOT NULL DEFAULT 'succeeded'",
        "ALTER TABLE procedures ADD COLUMN scope TEXT NOT NULL DEFAULT 'local'",
        "ALTER TABLE procedures ADD COLUMN fingerprint TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE procedures ADD COLUMN version INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE procedures ADD COLUMN state TEXT NOT NULL DEFAULT 'approved'",
        )
        for statement in statements:
            try: connection.execute(statement)
            except sqlite3.OperationalError: pass
    return connection


@contextmanager
def _connection():
    connection = _db()
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def _cipher() -> Any:
    key = os.getenv("GOOGLE_TOKEN_ENCRYPTION_KEY")
    if key and Fernet is None:
        raise RuntimeError("cryptography is required when procedural-memory encryption is enabled.")
    if Fernet is None:
        return None
    return Fernet(key.encode()) if key else None


def _encode(value: str) -> str:
    cipher = _cipher()
    return cipher.encrypt(value.encode()).decode() if cipher else value


def _decode(value: str) -> str:
    cipher = _cipher()
    return cipher.decrypt(value.encode()).decode() if cipher else value


def _serialized_steps(steps: list[dict[str, Any]]) -> str:
    compacted = _normalize_steps_for_storage(steps)
    while len(json.dumps(compacted, default=str, sort_keys=True)) > MAX_STEPS_JSON_CHARS and len(compacted) > 1:
        compacted.pop(_removable_step_index(compacted))
    return json.dumps(compacted, default=str, sort_keys=True)


def _compact_step_context(step: dict[str, Any]) -> dict[str, Any]:
    """Keep selector identity while trimming bulky screen snapshots.

    The replay layer needs the action selector and a small amount of surrounding
    context. It does not need every visible string on every recorded frame.
    """
    normalized = dict(step)
    args = dict(normalized.get("arguments") or {})
    screen = args.get("screen")
    if isinstance(screen, dict):
        visible = screen.get("visibleTexts")
        interactive = screen.get("interactiveElements")
        args["screen"] = {
            key: value
            for key, value in {
                "surface": screen.get("surface"),
                "role": screen.get("role"),
                "title": screen.get("title"),
                "visibleTexts": visible[:8] if isinstance(visible, list) else visible,
                "interactiveElements": interactive[:8] if isinstance(interactive, list) else interactive,
            }.items()
            if value is not None
        }
    normalized["arguments"] = args
    return normalized


def _same_text_target(a: dict[str, Any], b: dict[str, Any]) -> bool:
    a_args = a.get("arguments") or {}
    b_args = b.get("arguments") or {}
    a_target = a_args.get("resourceId") or a_args.get("fieldKey") or a_args.get("contentDescription")
    b_target = b_args.get("resourceId") or b_args.get("fieldKey") or b_args.get("contentDescription")
    if a_target and b_target and a_target == b_target:
        return str(a_args.get("resourceIdOccurrence") or "") == str(b_args.get("resourceIdOccurrence") or "")
    return False


def _normalize_steps_for_storage(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Preserve workflow structure before compressing noisy text/screen events.

    Android emits many text_input events while a person types. Replaying every
    prefix is wasteful, but dropping the tap/focus/navigation around those
    events makes the procedure unusable. Keep all navigation/action steps and
    only the final text value for each uninterrupted field-edit run.
    """
    normalized: list[dict[str, Any]] = []
    pending_text: dict[str, Any] | None = None

    def flush_pending_text() -> None:
        nonlocal pending_text
        if pending_text is not None:
            normalized.append(_compact_step_context(pending_text))
            pending_text = None

    for step in steps:
        action = str((step.get("arguments") or {}).get("action") or "")
        if action == "text_input":
            if pending_text is not None and _same_text_target(pending_text, step):
                pending_text = step
            else:
                flush_pending_text()
                pending_text = step
            continue

        flush_pending_text()
        normalized.append(_compact_step_context(step))

    flush_pending_text()
    return normalized


def _removable_step_index(steps: list[dict[str, Any]]) -> int:
    for removable_type in ("screen_transition", "observe", "scroll"):
        for index, step in enumerate(steps):
            if step.get("arguments", {}).get("action") == removable_type:
                return index
    priorities = [
        STEP_ACTION_PRIORITY.get(str(step.get("arguments", {}).get("action") or ""), 5)
        for step in steps
    ]
    return max(range(len(steps)), key=lambda index: priorities[index])


def save_procedure(intent: str, history: list[dict[str, Any]], success: bool = True, scope: str = "local", outcome: str = "succeeded", state: str = "approved") -> None:
    """Store a versioned trace; encrypt the step payload when the production key is configured."""
    steps = [
        {"toolName": step.get("toolName"), "arguments": step.get("arguments", {})}
        for step in history
    ]
    serialized = _serialized_steps(steps)
    fingerprint = hashlib.sha256(f"{scope}:{intent.lower()}:{serialized}".encode()).hexdigest()
    logger.info("procedure_save_requested scope=%s outcome=%s state=%s steps=%d", scope[:80], outcome, state, len(steps))
    with _connection() as connection:
        previous = execute(connection, "SELECT id FROM procedures WHERE scope = ? AND fingerprint = ? LIMIT 1", (scope[:200], fingerprint)).fetchone()
        if previous:
            execute(connection,
                "UPDATE procedures SET success = ?, outcome = ?, state = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
                (int(success), outcome[:40], state[:20], previous[0]),
            )
            return
        latest = execute(connection, "SELECT COALESCE(MAX(version), 0) FROM procedures WHERE scope = ? AND LOWER(intent) = LOWER(?)", (scope[:200], intent[:500])).fetchone()
        version = latest[0] + 1
        execute(connection,
            "INSERT INTO procedures(intent, steps_json, success, outcome, scope, fingerprint, version, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (intent[:500], _encode(serialized), int(success), outcome[:40], scope[:200], fingerprint, version, state[:20]),
        )


def search_procedures(intent: str, limit: int = 3) -> list[dict[str, Any]]:
    terms = [term for term in intent.lower().split() if len(term) > 2][:6]
    if not terms:
        return []
    where = " OR ".join("LOWER(intent) LIKE ?" for _ in terms)
    with _connection() as connection:
        rows = execute(connection,
            f"SELECT id, intent, steps_json, success, outcome, scope, version, state, created_at FROM procedures WHERE {where} "
            "ORDER BY success DESC, created_at DESC LIMIT ?",
            tuple(f"%{term}%" for term in terms) + (limit,),
        ).fetchall()
    result = [
        {"id": row[0], "intent": row[1], "steps": json.loads(_decode(row[2])), "success": bool(row[3]), "outcome": row[4], "scope": row[5], "version": row[6], "state": row[7], "createdAt": row[8]}
        for row in rows
    ]
    logger.info("procedure_search query_terms=%d matches=%d", len(terms), len(result))
    return result


def list_procedures(limit: int = 50) -> list[dict[str, Any]]:
    with _connection() as connection:
        rows = execute(connection,
            "SELECT id, intent, steps_json, success, outcome, scope, version, state, created_at FROM procedures "
            "ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        {"id": row[0], "intent": row[1], "steps": json.loads(_decode(row[2])), "success": bool(row[3]), "outcome": row[4], "scope": row[5], "version": row[6], "state": row[7], "createdAt": row[8]}
        for row in rows
    ]


def delete_procedure(procedure_id: int) -> bool:
    with _connection() as connection:
        cursor = execute(connection, "DELETE FROM procedures WHERE id = ?", (procedure_id,))
        deleted = cursor.rowcount > 0
        logger.info("procedure_delete id=%s deleted=%s", procedure_id, deleted)
        return deleted


def approve_procedure(procedure_id: int) -> bool:
    with _connection() as connection:
        row = execute(connection, "SELECT steps_json FROM procedures WHERE id = ?", (procedure_id,)).fetchone()
        if not row:
            logger.info("procedure_approve id=%s approved=false reason=missing", procedure_id)
            return False
        steps = json.loads(_decode(row[0]))
        if _starts_with_text_input(steps):
            logger.info("procedure_approve id=%s approved=false reason=starts_with_text_input", procedure_id)
            return False
        cursor = execute(connection, "UPDATE procedures SET state = 'approved' WHERE id = ?", (procedure_id,))
        approved = cursor.rowcount > 0
        logger.info("procedure_approve id=%s approved=%s", procedure_id, approved)
        return approved


def _starts_with_text_input(steps: list[dict[str, Any]]) -> bool:
    for step in steps:
        action = str((step.get("arguments") or {}).get("action") or "")
        if action in ("observe", "screen_transition", "scroll"):
            continue
        return action == "text_input"
    return False
