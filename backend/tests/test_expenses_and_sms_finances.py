"""Regression coverage for the SMS/email expense-parsing bugs found in a 2026-07-29 session:
1. Picking the trailing "balance" figure instead of the actual transaction amount.
2. Counting loan/bundle ADS (which mention amounts but describe no real transaction) as expenses.
3. Picking the wrong currency when a transaction amount and balance use different currencies.
Fixtures mirror the structural shape of real MTN Mobile Money / bank SMS without using the
user's actual transaction IDs or phone numbers.
"""

import unittest
from datetime import datetime, timezone

from app.sms_finances import _best_amount as sms_best_amount, _category as sms_category, _is_real_transaction, sms_finances
from app.expenses import _best_amount as email_best_amount, _category as email_category


def _epoch_ms(year: int, month: int, day: int, hour: int = 12) -> int:
    return int(datetime(year, month, day, hour, tzinfo=timezone.utc).timestamp() * 1000)


class SmsAmountSelectionTests(unittest.TestCase):
    def test_picks_transaction_amount_not_trailing_balance(self):
        body = "You have sent UGX 6,500 to John Doe. Fee:UGX 500.00. Transaction ID:100200300. Your Mobile Money balance is now UGX 0."
        self.assertEqual(sms_best_amount(body), ("UGX", 6500.0))

    def test_ignores_available_balance_label_variant(self):
        body = "You have used UGX 7000 with access fee UGX 193 from MOMOADVANCE. Your available MOMOADVANCE balance is UGX 42950. Transaction Id: 1."
        self.assertEqual(sms_best_amount(body), ("UGX", 7000.0))

    def test_picks_correct_currency_when_transaction_and_balance_differ(self):
        body = "Transaction of USD 1.99 on your Virtual Card has been completed. New Balance UGX 2,065.00."
        self.assertEqual(sms_best_amount(body), ("USD", 1.99))

    def test_no_amount_returns_none(self):
        self.assertIsNone(sms_best_amount("Your OTP is 4821. Do not share it."))


class SmsRealTransactionFilterTests(unittest.TestCase):
    def test_loan_offer_ad_is_excluded(self):
        self.assertFalse(_is_real_transaction("Y'ello! Borrow up to UGX 16,000 today and start building your limit toward UGX 2M. Dial *165*40#, select Loans to borrow."))

    def test_bundle_ad_with_no_verb_or_transaction_id_is_excluded(self):
        self.assertFalse(_is_real_transaction("Don't have enough money? Loan up to UGX 2,000,000. Download now."))

    def test_pending_approval_prompt_is_excluded(self):
        self.assertFalse(_is_real_transaction("Dial *165# and select My Approvals to allow payment of UGX 3,553 to a merchant."))

    def test_completed_transaction_without_transaction_id_wording_is_included(self):
        self.assertTrue(_is_real_transaction("Transaction of USD 1.99 on your Virtual Card has been completed."))

    def test_transaction_id_alone_counts_as_real(self):
        self.assertTrue(_is_real_transaction("Bundle loaded worth UGX 5,000/-. Transaction ID: 100200300."))


class SmsCategoryTests(unittest.TestCase):
    def test_mobile_money_sender(self):
        self.assertEqual(sms_category("MTNMobMoney sent UGX 500"), "Mobile Money")

    def test_airtime_and_data_sender(self):
        self.assertEqual(sms_category("MTNDATA data bundle purchase UGX 5000"), "Airtime & Data")

    def test_banking_sender(self):
        self.assertEqual(sms_category("EquityBank atm withdrawal"), "Banking")

    def test_unrecognized_sender_falls_back_to_other(self):
        self.assertEqual(sms_category("Random Sender: your package has shipped"), "Other")


class SmsFinancesEndToEndTests(unittest.TestCase):
    def test_excludes_ads_and_totals_only_real_transactions(self):
        messages = [
            {"address": "MTNMoKash", "body": "Borrow up to UGX 16,000 today. Dial *165*40#, select Loans to borrow.", "dateEpochMs": _epoch_ms(2026, 7, 29)},
            {"address": "MTNMobMoney", "body": "You have sent UGX 6,500 to John. Fee:UGX 500.00. Transaction ID:1. Your Mobile Money balance is now UGX 0.", "dateEpochMs": _epoch_ms(2026, 7, 29)},
            {"address": "PractiSpeed", "body": "Loan up to UGX 2,000,000. Download now.", "dateEpochMs": _epoch_ms(2026, 7, 29)},
            {"address": "MTNMobMoney", "body": "Bundle loaded worth UGX 5,000/- . New balance: UGX 0. Transaction ID: 2.", "dateEpochMs": _epoch_ms(2026, 7, 28)},
        ]
        result = sms_finances(messages, 2026, 7)
        self.assertEqual(len(result["items"]), 2)
        amounts = sorted(item["amount"] for item in result["items"])
        self.assertEqual(amounts, [5000.0, 6500.0])
        self.assertTrue(all(item["category"] == "Mobile Money" for item in result["items"]))

    def test_day_filter_excludes_other_days(self):
        messages = [{"address": "MTNMobMoney", "body": "You have sent UGX 1,000. Transaction ID:1.", "dateEpochMs": _epoch_ms(2026, 7, 1)}]
        result = sms_finances(messages, 2026, 7, day=15)
        self.assertEqual(len(result["items"]), 0)

    def test_day_filter_includes_matching_day(self):
        messages = [{"address": "MTNMobMoney", "body": "You have sent UGX 1,000. Transaction ID:1.", "dateEpochMs": _epoch_ms(2026, 7, 15)}]
        result = sms_finances(messages, 2026, 7, day=15)
        self.assertEqual(len(result["items"]), 1)


class EmailAmountSelectionTests(unittest.TestCase):
    def test_prefers_amount_near_total_label_over_line_items(self):
        text = "Subtotal: USD 40.00 Tax: USD 4.00 Total: USD 44.00 Thank you for your order."
        self.assertEqual(email_best_amount(text), ("USD", 44.00))

    def test_total_label_is_not_confused_by_subtotal_substring(self):
        # "Subtotal" contains "total" as a substring - the label matcher must not treat it as a
        # real total label (see the \b fix in expenses.py's TOTAL_LABEL_RE).
        text = "Subtotal: USD 40.00 Total: USD 44.00"
        self.assertEqual(email_best_amount(text), ("USD", 44.00))

    def test_falls_back_to_largest_amount_without_total_label(self):
        text = "You paid USD 12.00 for shipping and USD 88.00 for the item, no receipt total line was included."
        self.assertEqual(email_best_amount(text), ("USD", 88.00))

    def test_no_amount_returns_none(self):
        self.assertIsNone(email_best_amount("Your order has shipped and is on its way."))


class EmailCategoryTests(unittest.TestCase):
    def test_transport_keyword(self):
        self.assertEqual(email_category("Your Uber trip receipt"), "Transport")

    def test_software_keyword(self):
        self.assertEqual(email_category("Your Netflix subscription renewal"), "Software")

    def test_unrecognized_falls_back_to_other(self):
        self.assertEqual(email_category("Welcome to our newsletter"), "Other")


if __name__ == "__main__":
    unittest.main()
