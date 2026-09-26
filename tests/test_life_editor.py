"""Keep the GUI publish button from pushing from an unsafe Git state."""

from pathlib import Path
import runpy
import unittest
from unittest.mock import patch


EDITOR = runpy.run_path(str(Path(__file__).resolve().parents[1] / "life_editor.pyw"), run_name="test")


class PublishTests(unittest.TestCase):
    def test_publish_rejects_non_main_branch_without_fetching(self):
        with patch.dict(EDITOR["check_publish_ready"].__globals__, {"git": lambda *args: "feature"}):
            with self.assertRaisesRegex(RuntimeError, "main 分支"):
                EDITOR["check_publish_ready"]()

    def test_publish_rejects_staged_changes(self):
        calls = []

        def fake_git(*args):
            calls.append(args)
            return "main" if args[0] == "branch" else "README.md"

        with patch.dict(EDITOR["check_publish_ready"].__globals__, {"git": fake_git}):
            with self.assertRaisesRegex(RuntimeError, "暂存区"):
                EDITOR["check_publish_ready"]()
        self.assertEqual(calls, [("branch", "--show-current"), ("diff", "--cached", "--name-only")])


if __name__ == "__main__":
    unittest.main()
