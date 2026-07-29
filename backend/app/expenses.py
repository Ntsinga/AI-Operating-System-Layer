import re
from datetime import date, timedelta
from typing import Any

from app.google_api import gmail_read, gmail_search

AMOUNT_RE = re.compile(r"(?P<currency>UGX|USD|EUR|GBP|KES|TZS|\$|€|£)\s*([0-9][0-9,]*(?:\.\d{1,2})?)", re.I)
# "Total"-shaped labels outrank a bare number: a receipt/invoice usually has several dollar
# amounts (line items, tax, subtotal) and the one adjacent to one of these labels is far more
# likely to be the actual charge than whichever number happens to appear last in the text.
# The leading \b matters: without it, "total" matches inside "Subtotal" too, and since Subtotal
# usually appears right before an earlier (smaller, wrong) line-item amount, it would often win
# the "nearest label" comparison over the real "Total:" label later in the message.
TOTAL_LABEL_RE = re.compile(r"\b(grand total|total due|total charged|amount due|amount charged|total paid|amount paid|balance due|total)", re.I)
TOTAL_LABEL_WINDOW = 40


def _amounts(text: str) -> list[tuple[str, float, int]]:
    return [(match.group("currency").upper(), float(match.group(2).replace(",", "")), match.start()) for match in AMOUNT_RE.finditer(text)]


def _best_amount(text: str) -> tuple[str, float] | None:
    matches = _amounts(text)
    if not matches:
        return None
    label_positions = [m.start() for m in TOTAL_LABEL_RE.finditer(text)]
    best: tuple[str, float] | None = None
    best_distance = None
    for currency, amount, pos in matches:
        for label_pos in label_positions:
            distance = pos - label_pos
            if 0 <= distance <= TOTAL_LABEL_WINDOW and (best_distance is None or distance < best_distance):
                best, best_distance = (currency, amount), distance
    if best:
        return best
    # No total-like label nearby - the largest amount found is a safer guess than the last one,
    # since trailing footer/disclaimer text often contains unrelated numbers.
    return max(((currency, amount) for currency, amount, _ in matches), key=lambda pair: pair[1])

def _category(text: str) -> str:
    value = text.lower()
    for name, words in (
        ("Mobile Money", ("momo", "mobile money", "airtel money", "wallet transfer")),
        ("Banking", ("bank", "atm", "withdrawal", "loan", "overdraft")),
        ("Food", ("food", "restaurant", "cafe", "lunch", "dinner")),
        ("Transport", ("uber", "fuel", "taxi", "transport")),
        ("Housing", ("rent", "utility", "electricity")),
        ("Software", ("subscription", "software", "hosting")),
        ("Travel", ("hotel", "flight", "travel")),
    ):
        if any(word in value for word in words): return name
    return "Other"


async def monthly_finances(year: int, month: int, day: int | None = None) -> dict[str, Any]:
    if day:
        start = date(year, month, day)
        end = start + timedelta(days=1)
    else:
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
            best = _best_amount(" ".join([match.get("subject", ""), match.get("snippet", ""), message.get("body", "")]))
            if not best: continue
            currency, amount = best
            items.append({"type": kind, "amount": amount, "currency": currency, "category": _category(match.get("subject", "") + " " + message.get("body", "")), "subject": match.get("subject", ""), "date": match.get("date", ""), "sourceId": match["id"], "confidence": "medium"})
    totals: dict[str, dict[str, float]] = {"expense": {}, "revenue": {}}
    for item in items: totals[item["type"]][item["currency"]] = totals[item["type"]].get(item["currency"], 0) + item["amount"]
    return {"year": year, "month": month, "items": items, "totals": totals, "note": "Email-derived candidates require review; this is not accounting advice."}
