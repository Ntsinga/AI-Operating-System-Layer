import unittest

from app.replay_recovery import _validate_decision, resolve_replay_recovery


def _element(index, text=None, resource_id=None, content_description=None):
    return {"index": index, "text": text, "resourceId": resource_id, "contentDescription": content_description}


class ResolveReplayRecoveryDeterministicTests(unittest.TestCase):
    def test_no_elements_returns_retry(self):
        result = resolve_replay_recovery({"text": "2.4 mi"}, [], typed_value="Ntind")
        self.assertEqual(result["action"], "retry")

    def test_unambiguous_typed_value_match_auto_resolves_without_model_call(self):
        elements = [
            _element(0, text="Ntinda Shopping Center, Plot 1 Kimera Rd, Kampala"),
            _element(1, text="Search in a different city"),
        ]
        result = resolve_replay_recovery({"text": "2.4 mi"}, elements, typed_value="Ntind")
        self.assertEqual(result["action"], "select_element")
        self.assertEqual(result["elementIndex"], 0)

    def test_multiple_matches_never_auto_resolve_but_ask_the_user(self):
        # This is the actual bug case: several "Ntinda ..." results all match the typed prefix,
        # and we genuinely don't know which one the user originally picked. Never guess - but
        # also don't dead-end the replay; hand it to the person to choose.
        elements = [
            _element(0, text="Ntinda Shopping Center, Plot 1 Kimera Rd, Kampala"),
            _element(1, text="Ntinda Kigowa Road, Kampala, Uganda"),
            _element(2, text="Ntinda - Kisaasi Road, Kampala, Uganda"),
            _element(3, text="Ntinda View Crescent, Kampala, Uganda"),
        ]
        result = resolve_replay_recovery({"text": "2.4 mi"}, elements, typed_value="Ntind")
        self.assertEqual(result["action"], "ask_user")
        self.assertIsNone(result["elementIndex"])
        self.assertEqual(result["candidateIndices"], [0, 1, 2, 3])

    def test_ask_user_candidates_from_model_fallback_are_bounded(self):
        # No typed value to match against, so this exercises the _ask_model -> abort -> ask_user
        # promotion path, not the typed-value-matches path (which is intentionally unbounded -
        # every genuine typed-value match is a real candidate worth showing).
        elements = [_element(i, text=f"Option {i}") for i in range(12)]
        result = resolve_replay_recovery({"text": "Confirm"}, elements, typed_value=None)
        self.assertEqual(result["action"], "ask_user")
        self.assertEqual(len(result["candidateIndices"]), 8)

    def test_content_description_also_counts_as_a_match(self):
        elements = [_element(0, content_description="pickup location Ntinda Shopping Center")]
        result = resolve_replay_recovery({"text": "2.4 mi"}, elements, typed_value="Ntind")
        self.assertEqual(result["action"], "select_element")
        self.assertEqual(result["elementIndex"], 0)

    def test_no_typed_value_and_no_api_key_asks_the_user_instead_of_dead_ending(self):
        elements = [_element(0, text="Confirm"), _element(1, text="Cancel")]
        result = resolve_replay_recovery({"text": "Confirm"}, elements, typed_value=None)
        # No OPENAI_API_KEY in the test environment - must never silently pick one, but also must
        # not dead-end the whole replay when there's a human right there who can just be asked.
        self.assertEqual(result["action"], "ask_user")
        self.assertEqual(result["candidateIndices"], [0, 1])


class ValidateDecisionGuardTests(unittest.TestCase):
    def test_rejects_index_outside_real_element_list(self):
        elements = [_element(0, text="A"), _element(1, text="B")]
        # A model claiming high confidence for an index that doesn't exist must still be rejected.
        decision = {"action": "select_element", "elementIndex": 7, "reason": "very confident"}
        result = _validate_decision(decision, elements)
        self.assertEqual(result["action"], "abort")

    def test_accepts_valid_index(self):
        elements = [_element(0, text="A"), _element(1, text="B")]
        decision = {"action": "select_element", "elementIndex": 1, "reason": "matches"}
        result = _validate_decision(decision, elements)
        self.assertEqual(result, {"action": "select_element", "elementIndex": 1, "reason": "matches"})

    def test_rejects_unknown_action(self):
        decision = {"action": "delete_everything", "elementIndex": 0, "reason": "..."}
        result = _validate_decision(decision, [_element(0)])
        self.assertEqual(result["action"], "abort")

    def test_retry_and_abort_pass_through_without_needing_an_index(self):
        for action in ("retry", "abort"):
            decision = {"action": action, "elementIndex": None, "reason": "reason"}
            result = _validate_decision(decision, [_element(0)])
            self.assertEqual(result["action"], action)


if __name__ == "__main__":
    unittest.main()
