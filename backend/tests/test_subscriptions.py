import unittest
from datetime import datetime, timedelta, timezone

from app.subscriptions import detect_recurring_charges


def _iso(days_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


class DetectRecurringChargesTests(unittest.TestCase):
    def test_detects_monthly_charge_with_two_occurrences(self):
        items = [
            {"type": "expense", "subject": "Netflix", "amount": 15000, "currency": "UGX", "date": _iso(60)},
            {"type": "expense", "subject": "Netflix", "amount": 15000, "currency": "UGX", "date": _iso(30)},
        ]
        result = detect_recurring_charges(items)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["subject"], "netflix")
        self.assertEqual(result[0]["occurrences"], 2)

    def test_single_occurrence_is_not_recurring(self):
        items = [{"type": "expense", "subject": "Netflix", "amount": 15000, "currency": "UGX", "date": _iso(10)}]
        self.assertEqual(detect_recurring_charges(items), [])

    def test_irregular_spacing_is_not_recurring(self):
        # 5 days apart is not a monthly cadence.
        items = [
            {"type": "expense", "subject": "One-off shop", "amount": 5000, "currency": "UGX", "date": _iso(10)},
            {"type": "expense", "subject": "One-off shop", "amount": 5000, "currency": "UGX", "date": _iso(5)},
        ]
        self.assertEqual(detect_recurring_charges(items), [])

    def test_revenue_items_are_ignored(self):
        items = [
            {"type": "revenue", "subject": "Salary", "amount": 500000, "currency": "UGX", "date": _iso(60)},
            {"type": "revenue", "subject": "Salary", "amount": 500000, "currency": "UGX", "date": _iso(30)},
        ]
        self.assertEqual(detect_recurring_charges(items), [])

    def test_different_amounts_do_not_group_together(self):
        items = [
            {"type": "expense", "subject": "MTNData", "amount": 5000, "currency": "UGX", "date": _iso(60)},
            {"type": "expense", "subject": "MTNData", "amount": 3000, "currency": "UGX", "date": _iso(30)},
        ]
        self.assertEqual(detect_recurring_charges(items), [])

    def test_sorted_by_total_impact_descending(self):
        items = [
            {"type": "expense", "subject": "Spotify", "amount": 9000, "currency": "UGX", "date": _iso(60)},
            {"type": "expense", "subject": "Spotify", "amount": 9000, "currency": "UGX", "date": _iso(30)},
            {"type": "expense", "subject": "Netflix", "amount": 25000, "currency": "UGX", "date": _iso(60)},
            {"type": "expense", "subject": "Netflix", "amount": 25000, "currency": "UGX", "date": _iso(30)},
        ]
        result = detect_recurring_charges(items)
        self.assertEqual([entry["subject"] for entry in result], ["netflix", "spotify"])


if __name__ == "__main__":
    unittest.main()
