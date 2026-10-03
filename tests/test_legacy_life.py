"""Legacy entries must be editable without disturbing the surrounding page."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from scripts import legacy_life


class LegacyLifeTests(unittest.TestCase):
    def test_changed_dates_are_validated_without_rejecting_historical_dates(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "src/legacy/work/work1.njk"
            path.parent.mkdir(parents=True)
            template = '<div class="stream-lr"><div class="stream-meta"><span class="streamitem-date">{}</span></div><div class="stream-main"><h3 class="streamitem-title">旧记录</h3></div></div>'
            historical = '2024<span>年</span> <a href="">春天</a>'
            path.write_text(template.format(historical), encoding="utf-8")
            with patch.object(legacy_life, "ROOT", root):
                entry = legacy_life.parse("legacy-work1-1")
                changed = entry["html"].replace("旧记录", "新标题")
                legacy_life.change(entry["id"], entry["version"], "save", changed)
                entry = legacy_life.parse(entry["id"])
                self.assertEqual(entry["date"], "2024年春天")
                for invalid in ('0<span>年</span> <a href="">undefined月undefined号</a>',
                                '2024<span>年</span> <a href="">2月30号</a>',
                                '2024年13月1日', 'NaN年NaN月NaN号'):
                    with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, "真实的年月日"):
                        legacy_life.change(entry["id"], entry["version"], "save", template.format(invalid))
                    self.assertEqual(legacy_life.parse(entry["id"])["version"], entry["version"])
                valid = template.format('2024<span>年</span> <a href="">2月29号</a>')
                legacy_life.change(entry["id"], entry["version"], "save", valid)
                self.assertEqual(legacy_life.parse(entry["id"])["date"], "2024-02-29")

    def test_edit_hide_show_and_delete_one_block(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "src/legacy/work/work1.njk"
            path.parent.mkdir(parents=True)
            first = '<div class="stream-lr"><div class="stream-meta"><span class="streamitem-date">2024<span>年</span> <a href="">1月2号</a></span></div><div class="stream-main"><h3 class="streamitem-title">第一条</h3></div></div>'
            second = '<div class="stream-lr"><div class="stream-main"><h3 class="streamitem-title">第二条</h3></div></div>'
            page = "---\ntitle: life\n---\n" + first + "\n" + second + "\n<nav>保留分页</nav>"
            path.write_text(page, encoding="utf-8")
            with patch.object(legacy_life, "ROOT", root):
                entries = legacy_life.list_entries()
                self.assertEqual(len(entries), 2)
                self.assertEqual(entries[0]["date"], "2024-01-02")
                entry = legacy_life.parse("legacy-work1-1")
                changed_html = entry["html"].replace("第一条", "改过的第一条")
                legacy_life.change(entry["id"], entry["version"], "save", changed_html)
                entry = legacy_life.parse("legacy-work1-1")
                self.assertEqual(entry["title"], "改过的第一条")
                legacy_life.change(entry["id"], entry["version"], "visibility")
                entry = legacy_life.parse("legacy-work1-1")
                self.assertTrue(entry["hidden"])
                self.assertIn("{% if false %}", path.read_text(encoding="utf-8"))
                legacy_life.change(entry["id"], entry["version"], "visibility")
                entry = legacy_life.parse("legacy-work1-1")
                self.assertFalse(entry["hidden"])
                legacy_life.change(entry["id"], entry["version"], "delete")
                self.assertEqual(len(legacy_life.list_entries()), 1)
                self.assertIn(second, path.read_text(encoding="utf-8"))
                self.assertIn("<nav>保留分页</nav>", path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
