"""Check that local and OSS photos produce safe, usable life entries."""

import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "new_life.py"
spec = importlib.util.spec_from_file_location("new_life", SCRIPT)
new_life = importlib.util.module_from_spec(spec)
spec.loader.exec_module(new_life)


class NewLifeTests(unittest.TestCase):
    def test_local_and_oss_photos(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            drafts = root / "drafts"
            drafts.mkdir()
            (drafts / "park.jpg").write_bytes(b"image bytes")
            draft = drafts / "life.toml"
            draft.write_text(
                'title = "周末散步"\n'
                'date = "2026-09-26"\n'
                'slug = "park-walk"\n'
                "body = '''今天去了公园。'''\n"
                '[[photos]]\nsource = "park.jpg"\nalt = "公园"\n'
                '[[photos]]\nsource = "https://example.com/other.jpg"\nalt = "朋友"\n',
                encoding="utf-8",
            )
            with patch.object(new_life, "ROOT", root):
                new_life.create(draft)
                output = root / "src/life/2026-09-26-park-walk.md"
                content = output.read_text(encoding="utf-8")
                self.assertIn("permalink: /life/2026-09-26-park-walk/", content)
                self.assertIn("/assets/images/life/2026-09-26-park-walk-01.jpg", content)
                self.assertIn("https://example.com/other.jpg", content)
                self.assertIn("今天去了公园。", content)
                self.assertEqual(
                    (root / "assets/images/life/2026-09-26-park-walk-01.jpg").read_bytes(),
                    b"image bytes",
                )
                with self.assertRaisesRegex(ValueError, "记录已存在"):
                    new_life.create(draft)
                self.assertEqual(output.read_text(encoding="utf-8"), content)

    def test_invalid_draft_does_not_create_files(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            draft = root / "life.toml"
            draft.write_text(
                'title = "记录"\ndate = "2026-02-30"\n'
                '[[photos]]\nsource = "http://example.com/image.jpg"\n',
                encoding="utf-8",
            )
            with patch.object(new_life, "ROOT", root):
                with self.assertRaisesRegex(ValueError, "真实日期"):
                    new_life.create(draft)
            self.assertFalse((root / "src").exists())


if __name__ == "__main__":
    unittest.main()
