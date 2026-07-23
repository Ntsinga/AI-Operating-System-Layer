import re
from datetime import date
from typing import Any

from app.google_api import gmail_read, gmail_search

AMOUNT_RE = re.compile(r"(?P<currency>UGX|USD|EUR|GBP|KES|TZS|\$|€|£)\s*([0-9][0-9,]*(?:\.\d{1,2})?)", re.I)


def _amounts(text: str) -> list[tuple[str, float]]:
    return [(match.group("currency").upper(), float(match.group(2).replace(",", ""))) for match in AMOUNT_RE.finditer(text)]

def _category(text: str) -> str:
    value = text.lower()
    for name, words in (("Food", ("food", "restaurant", "cafe", "lunch", "dinner")), ("Transport", ("uber", "fuel", "taxi", "transport")), ("Housing", ("rent", "utility", "electricity")), ("Software", ("subscription", "software", "hosting")), ("Travel", ("hotel", "flight", "travel"))):
        if any(word in value for word in words): return name
    return "Other"


async def monthly_finances(year: int, month: int) -> dict[str, Any]:
    start = date(year, month, 1)
    end = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
    after = start.strftime("%Y/%m/%d"); before = end.strftime("%Y/%m/%d")
    expense_ids = await gmail_search(f"after:{after} before:{before} (receipt OR invoice OR payment OR expense)", 25)
    revenue_ids = await gmail_search(f"after:{after} before:{before} (revenue OR income OR salary OR paid OR deposit)", 25)
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for kind, matches in (("expense", expense_ids), ("revenue", revenue_ids)):
        for match in matches:
            if match["id"] in seen: continue
            seen.add(match["id"])
            message = await gmail_read(match["id"])
            parsed = _amounts(" ".join([match.get("subject", ""), match.get("snippet", ""), message.get("body", "")]))
            if not parsed: continue
            currency, amount = parsed[-1]
            items.append({"type": kind, "amount": amount, "currency": currency, "category": _category(match.get("subject", "") + " " + message.get("body", "")), "subject": match.get("subject", ""), "date": match.get("date", ""), "sourceId": match["id"], "confidence": "medium"})
    totals: dict[str, dict[str, float]] = {"expense": {}, "revenue": {}}
    for item in items: totals[item["type"]][item["currency"]] = totals[item["type"]].get(item["currency"], 0) + item["amount"]
    return {"year": year, "month": month, "items": items, "totals": totals, "note": "Email-derived candidates require review; this is not accounting advice."}
