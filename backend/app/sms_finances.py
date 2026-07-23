import re
from typing import Any

AMOUNT_RE = re.compile(r"(?P<currency>UGX|USD|KES|TZS|EUR|GBP|\$|€|£)\s*([0-9][0-9,]*(?:\.\d{1,2})?)", re.I)
def sms_finances(messages: list[dict[str, Any]], year: int, month: int) -> dict[str, Any]:
    items = []
    for message in messages:
        body = message.get("body", ""); matches = list(AMOUNT_RE.finditer(body))
        if not matches: continue
        lower = body.lower(); currency = matches[-1].group("currency").upper(); amount = float(matches[-1].group(2).replace(",", ""))
        kind = "revenue" if any(word in lower for word in ("received", "deposit", "credited", "salary", "income")) else "expense"
        category = "Transport" if any(word in lower for word in ("uber", "fuel", "taxi")) else "Food" if any(word in lower for word in ("restaurant", "food", "cafe")) else "Other"
        items.append({"type": kind, "amount": amount, "currency": currency, "category": category, "subject": message.get("address", "SMS"), "date": message.get("dateEpochMs"), "source": "sms", "confidence": "medium"})
    totals: dict[str, dict[str, float]] = {"expense": {}, "revenue": {}}
    for item in items: totals[item["type"]][item["currency"]] = totals[item["type"]].get(item["currency"], 0) + item["amount"]
    return {"year": year, "month": month, "items": items, "totals": totals, "note": "SMS-derived candidates require review; this is not accounting advice."}
