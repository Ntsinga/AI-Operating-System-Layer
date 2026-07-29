"""Detects likely recurring/subscription charges from already-extracted expense items - the
same sender+amount charged repeatedly on a roughly monthly cadence. Pure computation over items
already produced by sms_finances.py/expenses.py; no OpenAI call, no new external dependency.
"""

from datetime import datetime, timezone
from typing import Any

MONTHLY_DAYS = 30
DAY_TOLERANCE = 4  # accepts real-world MTN/bank billing jitter (28-31 day months, weekends, etc.)


def _parse_date(value: Any) -> datetime | None:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def detect_recurring_charges(items: list[dict[str, Any]], min_occurrences: int = 2) -> list[dict[str, Any]]:
    groups: dict[tuple[str, float, str], list[datetime]] = {}
    for item in items:
        if item.get("type") != "expense":
            continue
        when = _parse_date(item.get("date"))
        if not when:
            continue
        subject = str(item.get("subject", "")).strip().lower()
        amount = round(float(item.get("amount") or 0), 2)
        currency = str(item.get("currency", "")).upper()
        if not subject or amount <= 0:
            continue
        groups.setdefault((subject, amount, currency), []).append(when)

    recurring: list[dict[str, Any]] = []
    for (subject, amount, currency), dates in groups.items():
        dates.sort()
        if len(dates) < min_occurrences:
            continue
        has_monthly_gap = any(
            abs((dates[i + 1] - dates[i]).days - MONTHLY_DAYS) <= DAY_TOLERANCE
            for i in range(len(dates) - 1)
        )
        if not has_monthly_gap:
            continue
        recurring.append({
            "subject": subject,
            "amount": amount,
            "currency": currency,
            "occurrences": len(dates),
            "lastDate": dates[-1].isoformat(),
        })

    recurring.sort(key=lambda entry: entry["amount"] * entry["occurrences"], reverse=True)
    return recurring
