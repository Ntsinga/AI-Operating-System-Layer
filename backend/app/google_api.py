import os
import base64
from typing import Any

import httpx

from app.token_vault import load_token


async def _token() -> str:
    token = load_token()
    if not token:
        raise RuntimeError("Connect a Google account first with connect_google_account.")
    if token.get("access_token"):
        return token["access_token"]
    raise RuntimeError("Google OAuth token is missing.")


async def google_get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(url, params=params, headers={"Authorization": f"Bearer {await _token()}"})
        response.raise_for_status()
        return response.json()


async def gmail_search(query: str, max_results: int = 10) -> list[dict[str, Any]]:
    listing = await google_get("https://gmail.googleapis.com/gmail/v1/users/me/messages", {"q": query, "maxResults": max(1, min(max_results, 25))})
    messages = listing.get("messages", [])
    results: list[dict[str, Any]] = []
    for item in messages[:max_results]:
        message = await google_get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{item['id']}", {"format": "metadata", "metadataHeaders": ["From", "To", "Subject", "Date"]})
        headers = {h["name"].lower(): h["value"] for h in message.get("payload", {}).get("headers", [])}
        results.append({"id": item["id"], "threadId": item.get("threadId"), "snippet": message.get("snippet", ""), "from": headers.get("from", ""), "to": headers.get("to", ""), "subject": headers.get("subject", ""), "date": headers.get("date", "")})
    return results


def _gmail_text(payload: dict[str, Any]) -> str:
    body = payload.get("body", {}).get("data")
    if body:
        try: return base64.urlsafe_b64decode(body + "===").decode("utf-8", errors="replace")
        except Exception: pass
    for part in payload.get("parts", []):
        text = _gmail_text(part)
        if text: return text
    return ""


async def gmail_read(message_id: str) -> dict[str, Any]:
    message = await google_get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}", {"format": "full"})
    headers = {h["name"].lower(): h["value"] for h in message.get("payload", {}).get("headers", [])}
    return {"id": message_id, "threadId": message.get("threadId"), "from": headers.get("from", ""), "to": headers.get("to", ""), "subject": headers.get("subject", ""), "date": headers.get("date", ""), "body": _gmail_text(message.get("payload", {}))}


async def drive_search(query: str, max_results: int = 10) -> list[dict[str, Any]]:
    data = await google_get("https://www.googleapis.com/drive/v3/files", {"q": f"name contains '{query.replace(chr(39), chr(39) + chr(39))}' and trashed = false", "pageSize": max(1, min(max_results, 25)), "fields": "files(id,name,mimeType,modifiedTime,webViewLink,description)"})
    return data.get("files", [])


async def drive_read(file_id: str) -> dict[str, Any]:
    metadata = await google_get(f"https://www.googleapis.com/drive/v3/files/{file_id}", {"fields": "id,name,mimeType,modifiedTime,webViewLink,description"})
    token = await _token()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(f"https://www.googleapis.com/drive/v3/files/{file_id}", params={"alt": "media"}, headers={"Authorization": f"Bearer {token}"})
        response.raise_for_status()
    metadata["content"] = response.text[:100000]
    return metadata


async def gmail_create_draft(to: str, subject: str, body: str) -> dict[str, Any]:
    import base64
    raw = f"To: {to}\r\nSubject: {subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body}"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post("https://gmail.googleapis.com/gmail/v1/users/me/drafts", headers={"Authorization": f"Bearer {await _token()}"}, json={"message": {"raw": base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")}})
        response.raise_for_status(); return response.json()


async def calendar_create_event(title: str, start_time: str, end_time: str, description: str = "") -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post("https://www.googleapis.com/calendar/v3/calendars/primary/events", headers={"Authorization": f"Bearer {await _token()}"}, json={"summary": title, "description": description, "start": {"dateTime": start_time}, "end": {"dateTime": end_time}})
        response.raise_for_status(); return response.json()


async def calendar_upcoming(hours: int = 168) -> list[dict[str, Any]]:
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc); end = now + timedelta(hours=max(1, min(hours, 168)))
    data = await google_get("https://www.googleapis.com/calendar/v3/calendars/primary/events", {"timeMin": now.isoformat(), "timeMax": end.isoformat(), "singleEvents": "true", "orderBy": "startTime", "maxResults": 50})
    return data.get("items", [])
