"""Small development OAuth bridge for Gmail, Calendar, and Drive.

Production must replace the in-memory token store with encrypted, per-user storage and add
account authentication. No Google client secret or token belongs in the mobile bundle.
"""
import os
import secrets
from urllib.parse import urlencode

import httpx
from app.token_vault import load_token, save_token

GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]
_pending_states: set[str] = set()


def start_url() -> str:
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/connect/google/callback")
    if not client_id:
        raise RuntimeError("GOOGLE_CLIENT_ID is not configured.")
    state = secrets.token_urlsafe(32)
    _pending_states.add(state)
    return GOOGLE_AUTH + "?" + urlencode({"client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code", "scope": " ".join(SCOPES), "access_type": "offline", "prompt": "consent", "state": state})


async def exchange(code: str, state: str) -> dict:
    if state not in _pending_states:
        raise ValueError("Invalid or expired OAuth state.")
    _pending_states.remove(state)
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/connect/google/callback")
    if not client_id or not client_secret:
        raise RuntimeError("Google OAuth client credentials are not configured.")
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(GOOGLE_TOKEN, data={"code": code, "client_id": client_id, "client_secret": client_secret, "redirect_uri": redirect_uri, "grant_type": "authorization_code"})
        response.raise_for_status()
        token = response.json()
    save_token(token)
    return token


def status() -> dict:
    token = load_token()
    return {"connected": bool(token), "scopes": SCOPES if token else []}
