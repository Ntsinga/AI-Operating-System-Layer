import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import learning, procedural_memory


class ProceduralMemoryAndLearningTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(self.temp_dir.name) / "memory.sqlite3"
        self.db_patch = patch.object(procedural_memory, "DB_PATH", db_path)
        self.learning_patch = patch.object(learning, "DB_PATH", db_path)
        self.db_patch.start()
        self.learning_patch.start()

    def tearDown(self):
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
