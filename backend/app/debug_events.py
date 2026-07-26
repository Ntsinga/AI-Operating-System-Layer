"""Structured debug-event storage for phone teaching/replay traces.

These records are intentionally small and semantic: labels, selectors, counts,
and failure reasons. Do not store screenshots, audio, passwords, or raw tool
payloads here.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from app.storage import execute, postgres_enabled

DB_PATH = Path(__file__).parents[1] / "procedural_memory.sqlite3"
logger = logging.getLogger("aios.debug")

SAFE_DETAIL_KEYS = {
    "action",
    "actionCount",
    "appPackage",
    "attempted",
    "clickable",
    "clickableTargetFound",
    "completion",
    "contentDescription",
    "enabled",
    "executed",
    "fieldKey",
    "intent",
    "matched",
    "reason",
    "resourceId",
    "role",
    "screen",
    "selector",
    "skipped",
    "step",
    "surface",
    "text",
    "verified",
    "visibleTexts",
}


def _db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH) if not postgres_enabled() else __import__("psycopg").connect(__import__("os").environ["DATABASE_URL"])
    connection.execute(
        """CREATE TABLE IF NOT EXISTS debug_events (
            id INTEGER PRIMARY KEY,
            trace_id TEXT NOT NULL,
            flow TEXT NOT NULL,
            event TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT 'info',
            session_id TEXT,
            procedure_id INTEGER,
            step INTEGER,
            details_json TEXT NOT NULL DEFAULT '{}',
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


def _sanitize(value: Any, depth: int = 0) -> Any:
    if depth > 4:
        return str(value)[:200]
    if isinstance(value, dict):
        return {
            str(key)[:80]: _sanitize(item, depth + 1)
            for key, item in value.items()
            if key in SAFE_DETAIL_KEYS or depth > 0
        }
    if isinstance(value, list):
        return [_sanitize(item, depth + 1) for item in value[:40]]
    if isinstance(value, str):
        return value[:500]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)[:200]


def record_event(
    *,
    trace_id: str,
    flow: str,
    event: str,
    level: str = "info",
    session_id: str | None = None,
    procedure_id: int | None = None,
    step: int | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    safe_details = _sanitize(details or {})
    with _connection() as connection:
        execute(
            connection,
            "INSERT INTO debug_events(trace_id, flow, event, level, session_id, procedure_id, step, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                trace_id[:120],
                flow[:80],
                event[:120],
                level[:20],
                (session_id or "")[:120],
                procedure_id,
                step,
                json.dumps(safe_details, ensure_ascii=False)[:20000],
            ),
        )
    logger.info("debug_event trace=%s flow=%s event=%s step=%s level=%s", trace_id[:80], flow, event, step, level)
    return {
        "traceId": trace_id,
        "flow": flow,
        "event": event,
        "level": level,
        "sessionId": session_id,
        "procedureId": procedure_id,
        "step": step,
        "details": safe_details,
    }


def record_events(events: list[dict[str, Any]]) -> dict[str, Any]:
    stored = 0
    for item in events[:200]:
        record_event(
            trace_id=str(item.get("traceId") or item.get("trace_id") or "unknown"),
            flow=str(item.get("flow") or "unknown"),
            event=str(item.get("event") or "unknown"),
            level=str(item.get("level") or "info"),
            session_id=item.get("sessionId") or item.get("session_id"),
            procedure_id=item.get("procedureId") or item.get("procedure_id"),
            step=item.get("step"),
            details=item.get("details") if isinstance(item.get("details"), dict) else {},
        )
        stored += 1
    return {"stored": stored}


def list_events(trace_id: str | None = None, session_id: str | None = None, procedure_id: int | None = None, limit: int = 100) -> list[dict[str, Any]]:
    where: list[str] = []
    params: list[Any] = []
    if trace_id:
        where.append("trace_id = ?")
        params.append(trace_id)
    if session_id:
        where.append("session_id = ?")
        params.append(session_id)
    if procedure_id is not None:
        where.append("procedure_id = ?")
        params.append(procedure_id)
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    with _connection() as connection:
        rows = execute(
            connection,
            f"SELECT id, trace_id, flow, event, level, session_id, procedure_id, step, details_json, created_at FROM debug_events {clause} ORDER BY id DESC LIMIT ?",
            (*params, max(1, min(limit, 500))),
        ).fetchall()
    return [
        {
            "id": row[0],
            "traceId": row[1],
            "flow": row[2],
            "event": row[3],
            "level": row[4],
            "sessionId": row[5] or None,
            "procedureId": row[6],
            "step": row[7],
            "details": json.loads(row[8] or "{}"),
            "createdAt": row[9],
        }
        for row in rows
    ]
