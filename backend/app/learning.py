"""Phase 5 learning-mode sessions for semantic workflow recording.

The recorder accepts UI semantics, not screenshots or raw coordinate streams. It is a
development scaffold for the Android AccessibilityService watcher that will feed it.
"""

import json
import logging
import sqlite3
import threading
from contextlib import contextmanager
import uuid
from pathlib import Path
from typing import Any
from app.storage import postgres_enabled, execute
from app.debug_events import record_event

DB_PATH = Path(__file__).parents[1] / "procedural_memory.sqlite3"
logger = logging.getLogger("aios.learning")
# Each action can now embed a compact screen snapshot (added for the hybrid inference pipeline -
# see LearningWatcherService.kt's addTransitionEvidence/applyInferredTapIfConfident), roughly
# 3-4KB per action. At the old 50000 budget, a session hit the ceiling after just ~4 real taps;
# once _compact_actions exhausts noise-type entries (screen_transition/observe/scroll) it falls
# back to evicting the OLDEST action of any type to make room for each new one - a silent
# pop-and-push that nets zero growth and looks identical to a lost-update bug (a teaching session
# stuck reporting the same actionCount across several real appends). Match the client's own
# MAX_QUEUE_CHARS (400000, LearningWatcherService.kt) since both budgets hold the same shape of
# payload. See ERROR_LOG.md 2026-07-30 (Book 7 stuck-step-count investigation).
MAX_ACTIONS_JSON_CHARS = 400000
MAX_ACTIONS = 80

# append_action's SELECT-then-UPDATE is a classic read-modify-write race: FastAPI runs sync
# endpoint handlers in a thread pool, so two overlapping requests for the SAME session (e.g. a
# client-side poll tick whose network round-trip outlasts its own interval, firing again before
# the first finishes) can both read the same actions_json, append independently, and the later
# write silently clobbers the earlier one - no error, just quietly lost taps. Neither SQLite nor
# a plain Postgres connection here prevents this on their own (see ERROR_LOG.md 2026-07-30: a 45s
# teach session recorded 60+ real taps but only 8 survived to the saved procedure). A single
# in-process lock is sufficient because Render runs this backend with WEB_CONCURRENCY=1 - only
# one process ever touches this database, so there is no cross-process race to also guard against.
_actions_lock = threading.Lock()


def _record_learning_event(**kwargs: Any) -> None:
    try:
        record_event(**kwargs)
    except Exception:
        # Debug traces are diagnostic only. They must never prevent teaching or
        # replay from working, especially during schema migrations on Render.
        logger.warning("learning_debug_event_failed event=%s", kwargs.get("event"), exc_info=True)


NOISE_ACTION_TYPES = {"observe", "scroll", "screen_transition"}


def _compact_actions(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep session JSON valid without blindly truncating it.

    Prefer preserving actionable steps (tap, text_input, ...). If a session gets too large,
    drop older observe/scroll/screen_transition noise first, then oldest actions only as a
    last resort - matches the low-value tail of procedural_memory.py's STEP_ACTION_PRIORITY.

    A previous version applied a hard `actions[-MAX_ACTIONS:]` positional cutoff before this
    loop ever ran, which silently discarded the oldest actions regardless of type - including,
    in a long teaching session, the very first tap that triggered the whole flow - while this
    noise-preferring logic never actually ran (80 items are always under the char budget).
    """
    compacted = list(actions)
    while (len(compacted) > MAX_ACTIONS or len(json.dumps(compacted, default=str)) > MAX_ACTIONS_JSON_CHARS) and len(compacted) > 1:
        removable_index = next(
            (
                index
                for index, action in enumerate(compacted)
                if action.get("action") in NOISE_ACTION_TYPES
            ),
            0,
        )
        compacted.pop(removable_index)
    return compacted


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
    # See _actions_lock's module-level comment: this read-modify-write must be atomic across
    # concurrent requests for the same (or any) session, or a later write can silently discard an
    # earlier one.
    with _actions_lock:
        with _connection() as connection:
            row = execute(connection, "SELECT actions_json, status FROM learning_sessions WHERE id = ?", (session_id,)).fetchone()
            if not row:
                raise KeyError("Learning session was not found.")
            if row[1] != "recording":
                raise ValueError("Learning session is no longer recording.")
            actions = json.loads(row[0])
            # Keep semantic selectors and omit screenshots, passwords, and arbitrary payloads.
            safe = {key: action.get(key) for key in ("schemaVersion", "timestamp", "surface", "role", "text", "contentDescription", "resourceId", "resourceIdOccurrence", "fieldKey", "action", "value", "screenTitle", "screen", "preScreen", "postScreen", "semanticDiff", "clickable", "editable", "scrollable", "enabled", "selectorKind", "nodeClass", "parentClass", "parentSelectorKind", "parentText", "synthetic", "inferred", "confidence", "inferenceReason") if key in action}
            actions.append(safe)
            actions = _compact_actions(actions)
            execute(connection, "UPDATE learning_sessions SET actions_json = ? WHERE id = ?", (json.dumps(actions, default=str), session_id))
    logger.info("learning_action_appended session=%s action_count=%d action=%s", session_id, len(actions), safe.get("action", ""))
    _record_learning_event(
        trace_id=session_id,
        flow="learning",
        event="action_appended",
        session_id=session_id,
        step=len(actions),
        details={
            "actionCount": len(actions),
            "clientTimestamp": safe.get("timestamp"),
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
            "synthetic": safe.get("synthetic"),
            "inferred": safe.get("inferred"),
            "confidence": safe.get("confidence"),
            "inferenceReason": safe.get("inferenceReason"),
            "screen": safe.get("screen"),
        },
    )
    return {"sessionId": session_id, "actionCount": len(actions), "lastAction": safe, "status": "recording"}


def append_actions(session_id: str, actions_to_append: list[dict[str, Any]]) -> dict[str, Any]:
    """Persist a queue batch before the client clears its device copy."""
    if not actions_to_append:
        return {"sessionId": session_id, "actionCount": 0, "appended": 0, "lastAction": None, "status": "recording"}
    result: dict[str, Any] = {}
    for action in actions_to_append:
        result = append_action(session_id, action)
    result["appended"] = len(actions_to_append)
    return result


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
        actionable = {"tap", "text_input", "long_click", "selection", "scroll"}
        if not any(str(action.get("action") or "") in actionable for action in actions):
            raise ValueError("No actionable taps, typing, selections, or scrolls were captured. Try teaching again with AI-OS Accessibility enabled.")
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
