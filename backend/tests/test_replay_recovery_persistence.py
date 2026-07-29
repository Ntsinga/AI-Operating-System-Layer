import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import learning, procedural_memory


class CorrectStepAndSaveVersionTests(unittest.TestCase):
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

    def _teach_ride(self) -> int:
        history = [
            {"toolName": "tap", "arguments": {"action": "tap", "resourceId": "destination_field"}},
            {"toolName": "text_input", "arguments": {"action": "text_input", "resourceId": "edit_text", "value": "Ntind"}},
            {"toolName": "tap", "arguments": {"action": "tap", "text": "2.4 mi"}},
        ]
        procedural_memory.save_procedure("Ride home", history, scope="com.ubercab")
        procedures = procedural_memory.list_procedures()
        return next(p["id"] for p in procedures if p["intent"] == "Ride home")

    def test_correction_creates_a_new_version_and_leaves_the_original_intact(self):
        original_id = self._teach_ride()
        original = procedural_memory.get_procedure(original_id)
        self.assertEqual(original["version"], 1)

        corrected = procedural_memory.correct_step_and_save_version(
            original_id, 2, {"text": "Ntinda Shopping Center, Plot 1 Kimera Rd, Kampala"}
        )

        self.assertIsNotNone(corrected)
        self.assertEqual(corrected["version"], 2)
        self.assertEqual(corrected["steps"][2]["arguments"]["text"], "Ntinda Shopping Center, Plot 1 Kimera Rd, Kampala")
        # The original version's row is untouched - real audit trail, not an overwrite.
        original_again = procedural_memory.get_procedure(original_id)
        self.assertEqual(original_again["steps"][2]["arguments"]["text"], "2.4 mi")

    def test_corrected_version_inherits_scope_and_state(self):
        original_id = self._teach_ride()
        procedural_memory.approve_procedure(original_id)
        corrected = procedural_memory.correct_step_and_save_version(original_id, 2, {"text": "Ntinda Shopping Center"})
        self.assertEqual(corrected["scope"], "com.ubercab")
        self.assertEqual(corrected["state"], "approved")

    def test_unknown_procedure_returns_none(self):
        result = procedural_memory.correct_step_and_save_version(999999, 0, {"text": "x"})
        self.assertIsNone(result)

    def test_out_of_range_step_index_returns_none(self):
        original_id = self._teach_ride()
        result = procedural_memory.correct_step_and_save_version(original_id, 99, {"text": "x"})
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
