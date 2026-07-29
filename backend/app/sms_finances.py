import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

AMOUNT_RE = re.compile(r"(?P<currency>UGX|USD|KES|TZS|EUR|GBP|\$|€|£)\s*([0-9][0-9,]*(?:\.\d{1,2})?)", re.I)
# Ordered most-specific-first: mobile money/bank/airtime senders (e.g. "MTNMobMoney", "MTNDATA",
# "EquityBank") dominate real SMS traffic and were previously falling through to "Other" because
# only a handful of generic English words were checked.
CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("Mobile Money", ("momo", "mobile money", "mtnmob", "airtel money", "airtelmoney", "pesa", "wallet")),
    ("Airtime & Data", ("airtime", "data bundle", "mtndata", "internet bundle", "bundle purchase", "topup", "top-up")),
    ("Banking", ("bank", "equity", "stanbic", "centenary", "dfcu", "absa", "kcb", "atm", "withdrawal", "loan")),
    ("Food", ("restaurant", "food", "cafe", "lunch", "dinner", "supermarket", "grocery")),
    ("Transport", ("uber", "fuel", "taxi", "boda", "transport", "fare")),
    ("Utilities", ("umeme", "nwsc", "electricity", "water bill", "utility")),
    ("Housing", ("rent", "landlord")),
    ("Software", ("subscription", "hosting", "software")),
]


def _category(text: str) -> str:
    lower = text.lower()
    for name, words in CATEGORY_KEYWORDS:
        if any(word in lower for word in words):
            return name
    return "Other"


def _in_range(epoch_ms: Any, start: date, end: date) -> bool:
    if not isinstance(epoch_ms, (int, float)):
        return True  # keep undated messages rather than silently dropping candidates
    when = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).date()
    return start <= when < end


def sms_finances(messages: list[dict[str, Any]], year: int, month: int, day: int | None = None) -> dict[str, Any]:
    if day:
        start = date(year, month, day)
        end = start + timedelta(days=1)
    else:
        start = date(year, month, 1)
        end = date(year + (month == 12), 1 if month == 12 else month + 1, 1)

    items = []
    for message in messages:
        if not _in_range(message.get("dateEpochMs"), start, end):
            continue
        body = message.get("body", ""); matches = list(AMOUNT_RE.finditer(body))
        if not matches: continue
        address = message.get("address", "SMS")
        lower = body.lower(); currency = matches[-1].group("currency").upper(); amount = float(matches[-1].group(2).replace(",", ""))
        kind = "revenue" if any(word in lower for word in ("received", "deposit", "credited", "salary", "income")) else "expense"
        category = _category(f"{address} {body}")
        items.append({"type": kind, "amount": amount, "currency": currency, "category": category, "subject": address, "date": message.get("dateEpochMs"), "source": "sms", "confidence": "medium"})
    totals: dict[str, dict[str, float]] = {"expense": {}, "revenue": {}}
    for item in items: totals[item["type"]][item["currency"]] = totals[item["type"]].get(item["currency"], 0) + item["amount"]
    return {"year": year, "month": month, "items": items, "totals": totals, "note": "SMS-derived candidates require review; this is not accounting advice."}
