import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from app import learning, procedural_memory
from app import debug_events


class ProceduralMemoryAndLearningTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(self.temp_dir.name) / "memory.sqlite3"
        self.db_patch = patch.object(procedural_memory, "DB_PATH", db_path)
        self.learning_patch = patch.object(learning, "DB_PATH", db_path)
        self.debug_patch = patch.object(debug_events, "DB_PATH", db_path)
        self.db_patch.start()
        self.learning_patch.start()
        self.debug_patch.start()

    def tearDown(self):
        self.debug_patch.stop()
        self.learning_patch.stop()
        self.db_patch.stop()
        self.temp_dir.cleanup()

    def test_procedure_deduplicates_and_versions_by_scope(self):
        history = [{"toolName": "tap", "arguments": {"resourceId": "book"}}]
        procedural_memory.save_procedure("book a ride", history, scope="device-a")
        procedural_memory.save_procedure("book a ride", history, scope="device-a")
        procedures = procedural_memory.list_procedures()
        self.assertEqual(len(procedures), 1)
        self.assertEqual(procedures[0]["version"], 1)
        procedural_memory.save_procedure("book a ride", [{"toolName": "scroll", "arguments": {}}], scope="device-a")
        self.assertEqual(len(procedural_memory.list_procedures()), 2)
        self.assertEqual({item["scope"] for item in procedural_memory.list_procedures()}, {"device-a"})

    def test_learning_session_creates_draft_and_sanitizes_payload(self):
        session = learning.start_session("teach ride booking", "com.example.ride")
        learning.append_action(session["sessionId"], {"action": "tap", "text": "Book", "screenshot": "must-not-store"})
        result = learning.complete_session(session["sessionId"])
        self.assertTrue(result["procedureSaved"])
        self.assertEqual(result["actions"][0], {"action": "tap", "text": "Book"})
        self.assertEqual(procedural_memory.list_procedures()[0]["state"], "draft")

    def test_learning_session_preserves_inferred_tap_fields(self):
        # ERROR_LOG.md 2026-07-30: an inferred tap (no authoritative TYPE_VIEW_CLICKED event -
        # e.g. Compose-based apps like Airbnb) must stay distinguishable from a real click all the
        # way through persistence, not just at capture time - otherwise "typed and auditable"
        # is meaningless. A field allowlist here previously would have silently dropped these.
        session = learning.start_session("teach airbnb filter", "com.airbnb.android")
        learning.append_action(session["sessionId"], {
            "action": "tap",
            "text": "Services",
            "resourceId": "com.airbnb.android:id/filter_chip",
            "inferred": True,
            "confidence": 0.8,
            "inferenceReason": "single clickable node changed state, stable resourceId",
            "preScreen": {"title": "Home", "interactiveElements": [{"text": "Start Search"}]},
            "postScreen": {"title": "Search", "interactiveElements": [{"text": "Where to?"}]},
            "semanticDiff": {"added": [{"text": "Where to?"}], "removed": [], "changedState": []},
        })
        result = learning.complete_session(session["sessionId"])
        saved = result["actions"][0]
        self.assertTrue(saved["inferred"])
        self.assertEqual(saved["confidence"], 0.8)
        self.assertEqual(saved["inferenceReason"], "single clickable node changed state, stable resourceId")
        self.assertEqual(saved["preScreen"]["title"], "Home")
        self.assertEqual(saved["postScreen"]["title"], "Search")
        self.assertEqual(saved["semanticDiff"]["added"][0]["text"], "Where to?")

    def test_concurrent_append_action_calls_do_not_lose_writes(self):
        # ERROR_LOG.md 2026-07-30: FastAPI runs sync endpoint handlers in a thread pool, so two
        # overlapping requests for the same session (e.g. a client poll tick whose network
        # round-trip outlasts its own interval) could previously race on append_action's plain
        # read-then-write, with the later write silently clobbering the earlier one - a real
        # 45s Airbnb teach session recorded 60+ real taps but only 8 survived. _actions_lock
        # exists specifically to make this impossible; prove it under real concurrent threads
        # rather than trusting the lock is there and correctly placed.
        session = learning.start_session("teach concurrent taps", "com.example.app")
        session_id = session["sessionId"]
        thread_count = 8
        appends_per_thread = 5  # well under MAX_ACTIONS (80) - compaction must not be a factor here

        def hammer(thread_index: int) -> None:
            for i in range(appends_per_thread):
                learning.append_action(session_id, {"action": "tap", "text": f"t{thread_index}-{i}"})

        threads = [threading.Thread(target=hammer, args=(index,)) for index in range(thread_count)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        result = learning.complete_session(session_id)
        self.assertEqual(len(result["actions"]), thread_count * appends_per_thread)
        # Every single append must have survived - not just the count, since a lock placed in
        # the wrong spot could still coincidentally produce the right length via a different bug.
        recorded_labels = {action["text"] for action in result["actions"]}
        expected_labels = {f"t{i}-{j}" for i in range(thread_count) for j in range(appends_per_thread)}
        self.assertEqual(recorded_labels, expected_labels)

    def test_debug_events_are_persisted_and_sanitized(self):
        result = debug_events.record_events([
            {
                "traceId": "trace-1",
                "flow": "replay",
                "event": "step_skipped",
                "level": "warn",
                "procedureId": 42,
                "step": 3,
                "details": {
                    "reason": "selector_not_found",
                    "resourceId": "com.example:id/book",
                    "visibleTexts": ["Home", "Book"],
                    "screenshot": "must-not-store",
                    "password": "must-not-store",
                },
            }
        ])
        self.assertEqual(result["stored"], 1)
        events = debug_events.list_events(trace_id="trace-1")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["procedureId"], 42)
        self.assertEqual(events[0]["details"]["reason"], "selector_not_found")
        self.assertNotIn("screenshot", events[0]["details"])
        self.assertNotIn("password", events[0]["details"])

    def test_learning_session_preserves_rich_semantic_selectors(self):
        session = learning.start_session("teach destination", "com.example.ride")
        screen = {
            "surface": "com.example.ride",
            "title": "Where to?",
            "visibleTexts": ["Where to?", "Home"],
            "interactiveElements": [{"resourceId": "destination", "text": "Where to?"}],
        }
        learning.append_action(
            session["sessionId"],
            {
                "schemaVersion": 2,
                "surface": "com.example.ride",
                "role": "android.widget.EditText",
                "action": "text_input",
                "resourceId": "destination",
                "fieldKey": "destination",
                "value": "Home",
                "screen": screen,
                "screenshot": "must-not-store",
            },
        )
        result = learning.complete_session(session["sessionId"])
        self.assertEqual(result["actions"][0]["schemaVersion"], 2)
        self.assertEqual(result["actions"][0]["fieldKey"], "destination")
        self.assertEqual(result["actions"][0]["value"], "Home")
        self.assertEqual(result["actions"][0]["screen"], screen)
        self.assertNotIn("screenshot", result["actions"][0])

    def test_learning_session_compacts_noise_before_meaningful_actions(self):
        # A long teaching session (232 raw appends) exceeds MAX_ACTIONS (80, see learning.py).
        # Compaction must drop the low-value screen_transition noise first - never the initial
        # tap that triggered the flow or the final text_input - even though the tap is by far
        # the oldest action and would be the first thing a naive "keep last N" cutoff discards.
        session = learning.start_session("teach long ride flow", "com.example.ride")
        learning.append_actions(session["sessionId"], [{"action": "tap", "text": "Order a SafeBoda", "resourceId": "content"}])
        for index in range(230):
            learning.append_action(
                session["sessionId"],
                {
                    "action": "screen_transition",
                    "screenTitle": f"Screen {index}",
                    "screen": {
                        "surface": "com.example.ride",
                        "title": f"Screen {index}",
                        "visibleTexts": [f"Screen {index}", "Order a SafeBoda"],
                        "interactiveElements": [{"text": "Order a SafeBoda", "resourceId": "content"}],
                    },
                },
            )
        learning.append_action(session["sessionId"], {"action": "text_input", "resourceId": "destination", "value": "Acacia Mall"})

        result = learning.complete_session(session["sessionId"])

        self.assertLessEqual(len(result["actions"]), learning.MAX_ACTIONS)
        self.assertEqual(result["actions"][0]["action"], "tap")
        self.assertEqual(result["actions"][0]["text"], "Order a SafeBoda")
        self.assertEqual(result["actions"][-1]["action"], "text_input")
        self.assertEqual(result["actions"][-1]["value"], "Acacia Mall")

    def test_learning_session_batch_appends_actions_atomically(self):
        session = learning.start_session("teach ride batch", "com.example.ride")
        result = learning.append_actions(
            session["sessionId"],
            [
                {"action": "tap", "text": "Order a SafeBoda"},
                {"action": "text_input", "resourceId": "destination", "value": "Kololo"},
                {"action": "tap", "text": "Kololo"},
            ],
        )

        self.assertEqual(result["appended"], 3)
        self.assertEqual(result["actionCount"], 3)
        completed = learning.complete_session(session["sessionId"])
        self.assertEqual([action["action"] for action in completed["actions"]], ["tap", "text_input", "tap"])

    def test_learning_session_rejects_screen_only_recordings(self):
        session = learning.start_session("teach broken ride flow", "com.example.ride")
        learning.append_action(session["sessionId"], {"action": "screen_transition", "screenTitle": "Home"})
        learning.append_action(session["sessionId"], {"action": "screen_transition", "screenTitle": "Wallet"})

        with self.assertRaisesRegex(ValueError, "No actionable"):
            learning.complete_session(session["sessionId"])

        self.assertEqual(procedural_memory.list_procedures(), [])

    def test_draft_requires_explicit_approval(self):
        session = learning.start_session("teach a task")
        learning.append_action(session["sessionId"], {"action": "tap", "resourceId": "confirm"})
        result = learning.complete_session(session["sessionId"])
        procedure_id = procedural_memory.list_procedures()[0]["id"]
        self.assertEqual(result["status"], "completed")
        self.assertTrue(procedural_memory.approve_procedure(procedure_id))
        self.assertEqual(procedural_memory.list_procedures()[0]["state"], "approved")


if __name__ == "__main__":
    unittest.main()
