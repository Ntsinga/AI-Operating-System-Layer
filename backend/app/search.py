"""Structured web search (Advanced Capability Backlog item 7).

Uses the Brave Search API. The key stays server-side only, same rationale as the
OpenAI key - see openaiPlanner.ts's SECURITY NOTE and CLAUDE.md.

Note: this project originally tried Google Custom Search JSON API, then briefly
switched to it fully. As of 2026-01-20 Google discontinued "Search the entire
web" for newly-created Programmable Search Engines (existing ones keep it until
2027-01-01) - new engines are capped at a 50-domain "Sites to search" allowlist,
which is useless for general web search. Google's suggested replacement,
Vertex AI Search, is an enterprise product requiring a custom quote. Brave has
no such gating and keeps a real, usable free tier - see ERROR_LOG.md.
"""

import os
from typing import Any

import httpx

BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
BRAVE_IMAGE_SEARCH_URL = "https://api.search.brave.com/res/v1/images/search"


def _raise_with_brave_detail(response: httpx.Response) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        # Brave returns a structured {"error": {...}} body on 4xx/5xx - the bare httpx message
        # (just status + URL) hides the actual reason (e.g. an invalid/expired subscription
        # token), which made this endpoint impossible to diagnose from the client-visible error.
        try:
            detail = response.json()
        except ValueError:
            detail = response.text
        raise httpx.HTTPStatusError(f"{error}. Brave response: {detail}", request=error.request, response=error.response) from None


def search_web(query: str, count: int = 5) -> list[dict[str, Any]]:
    api_key = os.environ.get("BRAVE_SEARCH_API_KEY")
    if not api_key:
        raise RuntimeError("BRAVE_SEARCH_API_KEY is not set. Add it to backend/.env.")

    response = httpx.get(
        BRAVE_SEARCH_URL,
        params={"q": query, "count": count},
        headers={"Accept": "application/json", "Accept-Encoding": "gzip", "Cache-Control": "no-cache", "X-Subscription-Token": api_key},
        timeout=10.0,
    )
    _raise_with_brave_detail(response)

    results = response.json().get("web", {}).get("results", [])
    return [
        {
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "description": item.get("description", ""),
        }
        for item in results[:count]
    ]


def search_images(query: str, count: int = 12) -> list[dict[str, Any]]:
    api_key = os.environ.get("BRAVE_SEARCH_API_KEY")
    if not api_key:
        raise RuntimeError("BRAVE_SEARCH_API_KEY is not set. Add it to backend/.env.")

    response = httpx.get(
        BRAVE_IMAGE_SEARCH_URL,
        params={"q": query, "count": min(max(count, 1), 20), "safesearch": "strict"},
        headers={"Accept": "application/json", "Accept-Encoding": "gzip", "Cache-Control": "no-cache", "X-Subscription-Token": api_key},
        timeout=15.0,
    )
    _raise_with_brave_detail(response)

    results = response.json().get("results", [])
    normalized: list[dict[str, Any]] = []
    for item in results[:count]:
        properties = item.get("properties") or {}
        thumbnail = item.get("thumbnail") or {}
        image_url = properties.get("url") or item.get("image_url") or thumbnail.get("src")
        if not image_url:
            continue
        normalized.append(
            {
                "title": item.get("title", ""),
                "imageUrl": image_url,
                "thumbnailUrl": thumbnail.get("src") or image_url,
                "sourceUrl": item.get("url", ""),
                "width": properties.get("width"),
                "height": properties.get("height"),
            }
        )
    return normalized
