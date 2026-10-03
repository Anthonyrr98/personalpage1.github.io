"""Article edits keep custom front matter and reject stale browser tabs."""

from contextlib import ExitStack
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from scripts import article_records


EDITOR = runpy.run_path(str(Path(__file__).resolve().parents[1] / "life_editor.pyw"), run_name="test")


class ArticleEditorTests(unittest.TestCase):
    def test_new_article_publish_commits_only_new_file(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            calls = []
            state = {"committed": False}
            def fake_git(*args):
                calls.append(args)
                if args == ("branch", "--show-current"): return "main"
                if args == ("rev-parse", "HEAD"): return "new" if state["committed"] else "old"
                if args == ("rev-parse", "origin/main"): return "old"
                if args[:4] == ("diff", "--cached", "--name-only", "--"): return args[4]
                if args[0] == "commit": state["committed"] = True
                return ""
            data = {"slug": "new-story", "title": "New story", "cardTitle": "New story",
                    "description": "Description", "summary": "Summary", "category": "Travel",
                    "date": "2026-09-29", "cover": "", "body": "New story body"}
            globals_ = EDITOR["handle_new_article"].__globals__
            with patch.dict(globals_, {"ROOT": root, "ARTICLE_DRAFT": root / "drafts/article-form.json",
                                       "PENDING_PUBLISH": root / "drafts/pending-publish.json", "git": fake_git}), \
                    patch.object(article_records, "ROOT", root):
                status, result = EDITOR["handle_new_article"](data, True)
                self.assertEqual(status, 200)
                self.assertTrue(result["published"])
                self.assertEqual(result["article"]["url"], "/articles/2026-09-29-new-story/")
                self.assertIn(("add", "--", str(Path("src/articles/20260929/new-story.md"))), calls)
                self.assertFalse((root / "drafts/pending-publish.json").exists())
                self.assertEqual(EDITOR["read_article_draft"]()["slug"], "")

    def test_create_markdown_article_and_keep_its_url_on_edit(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            data = {"slug": "new-story", "title": "新文章｜赵荣力", "cardTitle": "新文章",
                    "description": "页面简介", "summary": "列表摘要", "category": "旅行",
                    "date": "2026-09-29", "cover": "https://example.com/cover.jpg",
                    "body": "## 第一节\n\n文章内容。\n"}
            with patch.object(article_records, "ROOT", root):
                path, article = article_records.create(data)
                self.assertEqual(article["url"], "/articles/2026-09-29-new-story/")
                self.assertEqual(article["format"], "markdown")
                self.assertIn('tags: ["article"]', path.read_text(encoding="utf-8"))
                self.assertEqual(article_records.list_articles()[0]["cardTitle"], "新文章")
                with self.assertRaisesRegex(ValueError, "已有文章"):
                    article_records.create(data)
                edited = dict(data, body="修改后的内容\n", date="2026-09-30")
                _, changed, updated = article_records.save(article["id"], article["version"], edited)
                self.assertTrue(changed)
                self.assertEqual(updated["url"], article["url"])
                self.assertIn('dateLabel: "2026年9月30日"', path.read_text(encoding="utf-8"))
                with self.assertRaisesRegex(ValueError, "网址名称"):
                    article_records.create(dict(data, slug="../bad"))

    def test_edit_preserves_custom_markup_and_front_matter(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "src/articles/20240102/example.njk"
            path.parent.mkdir(parents=True)
            path.write_text('''---
layout: "layouts/base.njk"
permalink: "/media/pages/articles/20240102/example.html"
title: "Old title"
description: "Old description"
activeNav: "articles"
isArticle: true
tags: ["article"]
date: "2024-01-02"
cardTitle: "Old card"
summary: "Old summary"
category: "编程"
dateLabel: "2024年1月2日"
cover: "https://example.com/cover.jpg"
customField: "keep me"
---
<article><h1>Original visible heading</h1></article>
''', encoding="utf-8")
            with patch.object(article_records, "ROOT", root):
                original = article_records.parse("20240102/example")
                data = {key: original[key] for key in article_records.FIELDS}
                data.update(title="New browser title", cardTitle="New card", date="2024-02-03",
                            body='<article><h1>Edited</h1>{{ "safe" }}</article>\n')
                saved_path, changed, updated = article_records.save(original["id"], original["version"], data)
                self.assertTrue(changed)
                self.assertEqual(saved_path, path)
                source = path.read_text(encoding="utf-8")
                self.assertIn('customField: "keep me"', source)
                self.assertIn('dateLabel: "2024年2月3日"', source)
                self.assertIn(data["body"], source)
                self.assertEqual(updated["cardTitle"], "New card")
                with self.assertRaisesRegex(ValueError, "已被其他操作修改"):
                    article_records.save(original["id"], original["version"], data)
                with self.assertRaisesRegex(ValueError, "编号"):
                    article_records.parse("../outside")


class LocalGitArticlePublishTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "checkout"
        remote = Path(temporary.name) / "origin.git"
        self.root.mkdir()
        subprocess.run(["git", "init", "--bare", "--initial-branch=main", str(remote)],
                       check=True, capture_output=True)
        self.repo_git("init", "--initial-branch=main")
        self.repo_git("config", "user.name", "Editor tests")
        self.repo_git("config", "user.email", "editor-tests@example.invalid")
        self.repo_git("config", "commit.gpgsign", "false")
        self.repo_git("config", "core.hooksPath", str(self.root / "no-hooks"))
        (self.root / "README.md").write_text("Initial content\n", encoding="utf-8")
        (self.root / ".gitignore").write_text("drafts/\n", encoding="utf-8")
        self.repo_git("add", "README.md", ".gitignore")
        self.repo_git("commit", "-m", "Initial content")
        self.repo_git("remote", "add", "origin", str(remote))
        self.repo_git("push", "-u", "origin", "main")
        stack = ExitStack()
        self.addCleanup(stack.close)
        self.globals = EDITOR["change_article"].__globals__
        stack.enter_context(patch.dict(self.globals, {
            "ROOT": self.root, "ARTICLE_DRAFT": self.root / "drafts/article-form.json",
            "PENDING_PUBLISH": self.root / "drafts/pending-publish.json",
        }))
        stack.enter_context(patch.object(article_records, "ROOT", self.root))
        self.data = {"slug": "local-story", "title": "Local story", "cardTitle": "Local story",
                     "description": "Description", "summary": "Summary", "category": "Test",
                     "date": "2026-10-02", "cover": "", "body": "Locally generated story\n"}

    def repo_git(self, *args):
        result = subprocess.run(["git", *args], cwd=self.root, check=True,
                                capture_output=True, encoding="utf-8")
        return result.stdout.strip()

    def save_article(self, article, publish=False, **updates):
        data = {key: article[key] for key in (*article_records.FIELDS, "body")}
        return EDITOR["change_article"]({
            "id": article["id"], "version": article["version"],
            "data": {**data, **updates}, "publish": publish,
        })

    def test_generate_locally_then_publish_without_edits_and_skip_empty_commit(self):
        status, generated = EDITOR["handle_new_article"](self.data, False)
        self.assertEqual(status, 200)
        self.assertFalse(generated["published"])
        (self.root / "README.md").write_text("Unrelated changes\n", encoding="utf-8")
        result = self.save_article(generated["article"], publish=True)
        self.assertTrue(result["published"])
        self.assertTrue(result["unchanged"])
        path = f"src/articles/{generated['article']['id']}.md"
        self.assertEqual(self.repo_git("show", "--pretty=format:", "--name-only", "HEAD"), path)
        self.assertIn("Locally generated story", self.repo_git("show", f"origin/main:{path}"))
        head = self.repo_git("rev-parse", "HEAD")
        result = self.save_article(result["article"], publish=True)
        self.assertFalse(result["published"])
        self.assertTrue(result["unchanged"])
        self.assertEqual(self.repo_git("rev-parse", "HEAD"), head)
        self.assertIn("README.md", self.repo_git("status", "--short"))

    def test_locally_saved_existing_article_publishes_and_retry_keeps_same_commit(self):
        status, generated = EDITOR["handle_new_article"](self.data, True)
        self.assertEqual(status, 200)
        self.assertTrue(generated["published"])
        saved = self.save_article(generated["article"], body="Saved to local first\n")
        self.assertFalse(saved["published"])
        original_git = self.globals["git"]
        def fail_push(*args):
            if args[0] == "push":
                raise RuntimeError("temporary network failure")
            return original_git(*args)
        with patch.dict(self.globals, {"git": fail_push}):
            with self.assertRaisesRegex(RuntimeError, "temporary network failure"):
                self.save_article(saved["article"], publish=True)
        head = self.repo_git("rev-parse", "HEAD")
        result = EDITOR["retry_publish"]()
        self.assertTrue(result["published"])
        self.assertEqual(self.repo_git("rev-parse", "HEAD"), head)
        self.assertEqual(self.repo_git("rev-parse", "origin/main"), head)
        path = f"src/articles/{saved['article']['id']}.md"
        self.assertIn("Saved to local first", self.repo_git("show", f"origin/main:{path}"))
        self.assertFalse((self.root / "drafts/pending-publish.json").exists())


if __name__ == "__main__":
    unittest.main()
