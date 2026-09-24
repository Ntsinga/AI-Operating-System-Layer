"""Board sessions: the drawing/visualization surface and its persistence.

A "board" is one drawing/lesson/choices session, stored like learning.py's
learning_sessions - a single row per session with JSON blobs, not per-stroke rows:

  scene_json   the current canvas (strokes + any AI-drawn elements). This is what
               re-renders when the board is reopened.
  events_json  an append-only log (strokes committed, questions asked, AI steps
               played). P1 only writes strokes/questions; the log is what later lets
               a lesson be replayed like a video (P3).

P1 exposes create / list / get / save / delete plus /ask, a single multimodal
question about the current canvas (the phone sends a PNG snapshot; llm.chat routes
it to a vision-capable provider). Stepped AI drawing and narration are P2.

Follows learning.py's storage conventions deliberately: a self-initializing table via
_db() (CREATE TABLE IF NOT EXISTS on every connect, so there is no separate migration
step) and app.storage.execute for the ?->%s placeholder translation between SQLite and
Postgres. Writes are guarded by a single in-process lock because the backend runs with
WEB_CONCURRENCY=1 (see learning.py's _actions_lock comment for the full rationale).
"""

import json
import logging
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Optional

from app.storage import execute, postgres_enabled

DB_PATH = Path(__file__).parents[1] / "procedural_memory.sqlite3"
logger = logging.getLogger("aios.boards")

VALID_KINDS = ("drawing", "lesson", "choices")
# Scene/events/thumb are user-authored canvas data, not the multi-KB screenshot payloads
# learning.py carries, but a runaway client (or a huge pasted image) should still not be
# able to store an unbounded blob. These ceilings are generous for hand-drawn ink.
MAX_SCENE_CHARS = 2_000_000
MAX_EVENTS_CHARS = 4_000_000
MAX_THUMB_CHARS = 400_000  # ~a 120px PNG data-URI

_write_lock = threading.Lock()


def _db() -> sqlite3.Connection:
    connection = (
        __import__("psycopg").connect(os.environ["DATABASE_URL"])
        if postgres_enabled()
        else sqlite3.connect(DB_PATH)
    )
    connection.execute(
        """CREATE TABLE IF NOT EXISTS board_sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'Untitled board',
            kind TEXT NOT NULL DEFAULT 'drawing',
            scene_json TEXT NOT NULL DEFAULT '{}',
            events_json TEXT NOT NULL DEFAULT '[]',
            thumb TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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


def _summary(row: tuple) -> dict[str, Any]:
    """The shape the sessions list needs - no scene/events blobs, but the thumb for the card."""
    return {
        "id": row[0],
        "title": row[1],
        "kind": row[2],
        "thumb": row[3],
        "createdAt": row[4],
        "updatedAt": row[5],
    }


def create_board(title: Optional[str], kind: Optional[str]) -> dict[str, Any]:
    board_id = str(uuid.uuid4())
    clean_title = (title or "Untitled board").strip()[:200] or "Untitled board"
    clean_kind = kind if kind in VALID_KINDS else "drawing"
    with _write_lock, _connection() as connection:
        execute(
            connection,
            "INSERT INTO board_sessions(id, title, kind) VALUES (?, ?, ?)",
            (board_id, clean_title, clean_kind),
        )
    logger.info("board_created board=%s kind=%s", board_id, clean_kind)
    return {
        "id": board_id,
        "title": clean_title,
        "kind": clean_kind,
        "scene": {},
        "events": [],
        "thumb": "",
    }


def list_boards() -> list[dict[str, Any]]:
    with _connection() as connection:
        rows = execute(
            connection,
            "SELECT id, title, kind, thumb, created_at, updated_at FROM board_sessions ORDER BY updated_at DESC",
        ).fetchall()
    return [_summary(row) for row in rows]


def get_board(board_id: str) -> dict[str, Any]:
    with _connection() as connection:
        row = execute(
            connection,
            "SELECT id, title, kind, scene_json, events_json, thumb, created_at, updated_at FROM board_sessions WHERE id = ?",
            (board_id,),
        ).fetchone()
    if not row:
        raise KeyError("Board was not found.")
    return {
        "id": row[0],
        "title": row[1],
        "kind": row[2],
        "scene": json.loads(row[3] or "{}"),
        "events": json.loads(row[4] or "[]"),
        "thumb": row[5],
        "createdAt": row[6],
        "updatedAt": row[7],
    }


def save_board(
    board_id: str,
    *,
    title: Optional[str] = None,
    scene: Optional[Any] = None,
    events: Optional[Any] = None,
    thumb: Optional[str] = None,
) -> dict[str, Any]:
    """Patch a board. Only the fields provided are written, so an autosave can send just
    the scene+thumb without clobbering a title the user set moments earlier."""
    scene_json = json.dumps(scene, default=str) if scene is not None else None
    events_json = json.dumps(events, default=str) if events is not None else None
    if scene_json is not None and len(scene_json) > MAX_SCENE_CHARS:
        raise ValueError("Board scene is too large to save.")
    if events_json is not None and len(events_json) > MAX_EVENTS_CHARS:
        raise ValueError("Board history is too large to save.")
    if thumb is not None and len(thumb) > MAX_THUMB_CHARS:
        thumb = ""  # A too-big thumbnail is cosmetic; drop it rather than failing the save.

    sets = ["updated_at = CURRENT_TIMESTAMP"]
    params: list[Any] = []
    if title is not None:
        sets.append("title = ?")
        params.append(title.strip()[:200] or "Untitled board")
    if scene_json is not None:
        sets.append("scene_json = ?")
        params.append(scene_json)
    if events_json is not None:
        sets.append("events_json = ?")
        params.append(events_json)
    if thumb is not None:
        sets.append("thumb = ?")
        params.append(thumb)
    params.append(board_id)

    with _write_lock, _connection() as connection:
        cursor = execute(
            connection,
            f"UPDATE board_sessions SET {', '.join(sets)} WHERE id = ?",
            tuple(params),
        )
        if cursor.rowcount == 0:
            raise KeyError("Board was not found.")
    logger.info("board_saved board=%s scene=%s events=%s", board_id, scene_json is not None, events_json is not None)
    return {"id": board_id, "status": "saved"}


def delete_board(board_id: str) -> dict[str, Any]:
    with _write_lock, _connection() as connection:
        cursor = execute(connection, "DELETE FROM board_sessions WHERE id = ?", (board_id,))
        if cursor.rowcount == 0:
            raise KeyError("Board was not found.")
    logger.info("board_deleted board=%s", board_id)
    return {"id": board_id, "status": "deleted"}


ASK_SYSTEM_PROMPT = (
    "You are a patient tutor looking at a hand-drawn board (a whiteboard sketch). The user "
    "has drawn something and is asking about it. Look at the image and answer their question "
    "directly and concisely, in plain spoken language - a few sentences, no markdown. If they "
    "circled or selected a region, focus on that. If the drawing is unclear, say what you can "
    "and ask one short clarifying question."
)


def ask_board(board_id: str, question: str, snapshot_data_uri: str, selection: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """One multimodal question about the board's current canvas. The snapshot is a PNG
    data-URI produced by the phone (canvas.toDataURL). Returns a plain-text answer."""
    question = (question or "").strip()
    if not question:
        raise ValueError("A question is required.")
    if not snapshot_data_uri.startswith("data:image/"):
        raise ValueError("A canvas snapshot image is required.")

    from app.llm import chat  # imported after validation so a bad request needs no LLM deps

    context = question
    if selection and all(k in selection for k in ("x", "y", "w", "h")):
        context = (
            f"{question}\n\n(The user selected a region of the board at "
            f"x={selection['x']}, y={selection['y']}, width={selection['w']}, height={selection['h']} pixels.)"
        )

    messages = [
        {"role": "system", "content": ASK_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": context},
                {"type": "image_url", "image_url": {"url": snapshot_data_uri}},
            ],
        },
    ]
    result = chat("board_ask", messages, vision=True, max_tokens=500)
    answer = result.text.strip()
    logger.info("board_ask board=%s provider=%s chars=%d", board_id, result.provider, len(answer))
    # Record the exchange in the board's own event log so it re-opens with its history.
    try:
        board = get_board(board_id)
        events = board["events"]
        events.append({"type": "ask", "question": question, "answer": answer, "selection": selection})
        save_board(board_id, events=events)
    except (KeyError, ValueError):
        logger.warning("board_ask_log_skipped board=%s", board_id)
    return {"answer": answer, "provider": result.provider}
