import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

from app import boards


def _fake_llm_module(chat_impl):
    """A stand-in for app.llm so tests don't need the openai package installed. ask_board
    imports `chat` from app.llm lazily, so injecting this into sys.modules is enough."""
    module = types.ModuleType("app.llm")
    module.chat = chat_impl
    module.LLMUnavailableError = type("LLMUnavailableError", (RuntimeError,), {})
    module.LLMError = type("LLMError", (RuntimeError,), {})
    return module


class BoardStorageTests(unittest.TestCase):
    def setUp(self):
        # Isolate every test from the real dev SQLite file (and from each other).
        self._tmp = tempfile.TemporaryDirectory()
        patcher = mock.patch.object(boards, "DB_PATH", Path(self._tmp.name) / "boards_test.sqlite3")
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._tmp.cleanup)

    def test_create_then_get_roundtrips_defaults(self):
        created = boards.create_board("Cone sketch", "drawing")
        fetched = boards.get_board(created["id"])
        self.assertEqual(fetched["title"], "Cone sketch")
        self.assertEqual(fetched["kind"], "drawing")
        self.assertEqual(fetched["scene"], {})
        self.assertEqual(fetched["events"], [])

    def test_unknown_kind_falls_back_to_drawing(self):
        created = boards.create_board("x", "nonsense")
        self.assertEqual(created["kind"], "drawing")

    def test_save_patches_only_given_fields(self):
        board_id = boards.create_board("Original", "lesson")["id"]
        boards.save_board(board_id, scene={"strokes": [1, 2, 3]}, thumb="data:image/png;base64,AAAA")
        fetched = boards.get_board(board_id)
        # Title untouched by a scene-only save; scene and thumb written.
        self.assertEqual(fetched["title"], "Original")
        self.assertEqual(fetched["scene"], {"strokes": [1, 2, 3]})
        self.assertEqual(fetched["thumb"], "data:image/png;base64,AAAA")

    def test_list_orders_newest_updated_first_and_omits_blobs(self):
        first = boards.create_board("First", "drawing")["id"]
        second = boards.create_board("Second", "drawing")["id"]
        boards.save_board(first, scene={"strokes": []})  # bumps first's updated_at
        listed = boards.list_boards()
        self.assertEqual([b["id"] for b in listed], [first, second])
        self.assertNotIn("scene", listed[0])
        self.assertIn("thumb", listed[0])

    def test_delete_removes_board(self):
        board_id = boards.create_board("Doomed", "drawing")["id"]
        boards.delete_board(board_id)
        with self.assertRaises(KeyError):
            boards.get_board(board_id)

    def test_get_missing_raises_keyerror(self):
        with self.assertRaises(KeyError):
            boards.get_board("does-not-exist")

    def test_oversized_scene_rejected(self):
        board_id = boards.create_board("Big", "drawing")["id"]
        with self.assertRaises(ValueError):
            boards.save_board(board_id, scene={"blob": "x" * (boards.MAX_SCENE_CHARS + 1)})


class BoardAskTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        patcher = mock.patch.object(boards, "DB_PATH", Path(self._tmp.name) / "boards_test.sqlite3")
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._tmp.cleanup)

    def test_ask_requires_image(self):
        board_id = boards.create_board("Q", "drawing")["id"]
        with self.assertRaises(ValueError):
            boards.ask_board(board_id, "why?", "not-an-image")

    def test_ask_calls_vision_model_and_logs_exchange(self):
        board_id = boards.create_board("Q", "drawing")["id"]
        fake = mock.Mock(text="It takes three cones to fill the cylinder.", provider="openai")
        chat = mock.Mock(return_value=fake)
        with mock.patch.dict(sys.modules, {"app.llm": _fake_llm_module(chat)}):
            result = boards.ask_board(
                board_id,
                "How was the volume derived?",
                "data:image/png;base64,AAAA",
                selection={"x": 1, "y": 2, "w": 3, "h": 4},
            )
        self.assertEqual(result["answer"], "It takes three cones to fill the cylinder.")
        # vision=True is what routes the request away from text-only providers.
        self.assertTrue(chat.call_args.kwargs["vision"])
        # The exchange is appended to the board's event log so it re-opens with history.
        events = boards.get_board(board_id)["events"]
        self.assertEqual(events[-1]["type"], "ask")
        self.assertEqual(events[-1]["answer"], "It takes three cones to fill the cylinder.")


if __name__ == "__main__":
    unittest.main()
