"""Keep the GUI publish button from pushing from an unsafe Git state."""

from contextlib import ExitStack
import json
from email.message import Message
from io import BytesIO
from pathlib import Path
import runpy
import socket
import subprocess
from tempfile import TemporaryDirectory
from threading import Thread
from types import SimpleNamespace
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

from scripts import article_records, new_life, life_records, legacy_life


EDITOR = runpy.run_path(str(Path(__file__).resolve().parents[1] / "life_editor.pyw"), run_name="test")


class PublishTests(unittest.TestCase):
    def test_late_autosave_cannot_replace_a_newer_unload_draft(self):
        with TemporaryDirectory() as directory:
            draft = Path(directory) / "life-form.json"
            globals_ = EDITOR["save_draft"].__globals__
            with patch.dict(globals_, {"DRAFT": draft}):
                latest = {"title": "Newest", "date": "2026-10-02", "body": "Final input",
                          "description": "", "photos": [], "_revision": 2}
                EDITOR["save_draft"](latest)
                delayed = {**latest, "body": "Older input", "_revision": 1}
                self.assertEqual(EDITOR["save_draft"](delayed), latest)
                self.assertEqual(EDITOR["read_draft"](), latest)
                # Clearing a generated draft advances its revision so a late
                # browser backup cannot bring the generated entry back again.
                cleared = EDITOR["save_draft"](EDITOR["empty_draft"]())
                self.assertGreater(cleared["_revision"], latest["_revision"])
                EDITOR["save_draft"](latest)
                self.assertEqual(EDITOR["read_draft"]()["title"], "")

    def test_new_entry_push_failure_reports_committed_state(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = {"committed": False, "fail_push": True}
            def fake_git(*args):
                if args == ("branch", "--show-current"): return "main"
                if args == ("rev-parse", "HEAD"): return "new-commit" if state["committed"] else "old-commit"
                if args == ("rev-parse", "origin/main"): return "old-commit"
                if args == ("rev-parse", "HEAD^"): return "old-commit"
                if args[:4] == ("diff", "--cached", "--name-only", "--"): return args[4]
                if args[0] == "commit": state["committed"] = True
                if args[0] == "push" and state["fail_push"]: raise RuntimeError("network unavailable")
                return ""
            globals_ = EDITOR["handle_entry"].__globals__
            with patch.dict(globals_, {"ROOT": root, "DRAFT": root / "drafts/life-form.json",
                                       "PENDING_PUBLISH": root / "drafts/pending-publish.json", "git": fake_git}), \
                    patch.object(new_life, "ROOT", root):
                status, result = EDITOR["handle_entry"](
                    {"title": "测试", "date": "2026-09-27", "body": "正文", "photos": []}, True)
                self.assertEqual(status, 409)
                self.assertEqual(result["state"], "committed")
                self.assertEqual(result["pending"]["commit"], "new-commit")
                self.assertTrue((root / result["generated"]).exists())
                self.assertEqual(EDITOR["read_draft"]()["title"], "")
                state["fail_push"] = False
                EDITOR["retry_publish"]()
                self.assertEqual(len(list((root / "src/life").glob("*.md"))), 1)

    def test_failed_push_retries_the_same_commit_without_recreating_entry(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "src/life/one.md"
            pending_file = root / "drafts/pending-publish.json"
            calls = []
            remote = "old-commit"
            def fake_git(*args):
                nonlocal remote
                calls.append(args)
                if args[0] == "push":
                    if calls.count(("push", "origin", "main")) == 1:
                        raise RuntimeError("network unavailable")
                    remote = "new-commit"
                if args == ("branch", "--show-current"): return "main"
                if args == ("rev-parse", "HEAD"): return "new-commit"
                if args == ("rev-parse", "HEAD^"): return "old-commit"
                if args == ("rev-parse", "origin/main"): return remote
                if args[:4] == ("diff", "--cached", "--name-only", "--"): return args[4]
                return ""
            globals_ = EDITOR["publish_files"].__globals__
            with patch.dict(globals_, {"ROOT": root, "PENDING_PUBLISH": pending_file, "git": fake_git}):
                with self.assertRaisesRegex(RuntimeError, "network unavailable"):
                    EDITOR["publish_files"](output, [], "测试", "/work/one/")
                self.assertEqual(json.loads(pending_file.read_text(encoding="utf-8"))["commit"], "new-commit")
                result = EDITOR["retry_publish"]()
                self.assertTrue(result["published"])
                self.assertFalse(pending_file.exists())
                self.assertEqual(calls.count(("commit", "-m", "Add life entry: 测试")), 1)
                self.assertEqual(calls.count(("push", "origin", "main")), 2)

    def test_legacy_photo_upload_is_saved_with_the_original_page(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            page = root / "src/legacy/work/work1.njk"
            page.parent.mkdir(parents=True)
            page.write_text('<div class="stream-lr"><div class="stream-meta"><span class="streamitem-date">2024<span>年</span> <a href="">1月2号</a></span></div><div class="stream-main"><h3 class="streamitem-title">旧记录</h3></div></div>', encoding="utf-8")
            source = "life-uploads/" + "a" * 24 + ".jpg"
            upload = root / "drafts" / source
            upload.parent.mkdir(parents=True)
            upload.write_bytes(b"photo bytes")
            globals_ = EDITOR["change_existing"].__globals__
            with patch.dict(globals_, {"ROOT": root, "DRAFT": root / "drafts/life-form.json"}), \
                    patch.object(legacy_life, "ROOT", root):
                entry = legacy_life.parse("legacy-work1-1")
                html = entry["html"].replace('</div></div>', f'<figure class="stream"><img src="{source}" alt="新照片"></figure></div></div>')
                EDITOR["change_existing"]({"id": entry["id"], "version": entry["version"],
                                           "data": {"html": html}, "publish": False}, "save")
                saved = page.read_text(encoding="utf-8")
                self.assertIn('/assets/images/life/legacy-work1-1-', saved)
                self.assertNotIn("life-uploads/", saved)
                self.assertEqual(len(list((root / "assets/images/life").glob("*.jpg"))), 1)
                self.assertFalse(upload.exists())

    def test_proxy_fake_ip_is_allowed_but_private_addresses_stay_blocked(self):
        check = EDITOR["is_public_host"]
        globals_ = check.__globals__
        fake_dns = [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("198.18.0.201", 80))]
        with patch.object(globals_["socket"], "getaddrinfo", return_value=fake_dns), \
                patch.dict(globals_, {"getproxies": lambda: {"http": "proxy configured"}}):
            self.assertTrue(check("websiteanthony.oss-cn-beijing.aliyuncs.com"))
            self.assertFalse(check("127.0.0.1"))
        with patch.object(globals_["socket"], "getaddrinfo", return_value=fake_dns), \
                patch.dict(globals_, {"getproxies": lambda: {}}):
            self.assertFalse(check("websiteanthony.oss-cn-beijing.aliyuncs.com"))

    def test_http_oss_image_is_imported_as_local_upload(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            response = BytesIO(b"sample image")
            response.headers = Message()
            response.headers["Content-Type"] = "image/jpeg"
            globals_ = EDITOR["import_http_photo"].__globals__
            with patch.dict(globals_, {
                "UPLOADS": root / "drafts/life-uploads",
                "is_public_host": lambda _: True,
                "build_opener": lambda *_: SimpleNamespace(open=lambda *_args, **_kwargs: response),
            }):
                result = EDITOR["import_http_photo"]("http://photos.example.com/trip.jpg")
            self.assertTrue(result["source"].startswith("life-uploads/"))
            self.assertEqual((root / "drafts" / result["source"]).read_bytes(), b"sample image")
            with self.assertRaisesRegex(ValueError, "公开"):
                EDITOR["import_http_photo"]("http://127.0.0.1/private.jpg")

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

    def test_local_page_upload_and_generate(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            globals_ = EDITOR["start_server"].__globals__
            with patch.dict(globals_, {
                "ROOT": root,
                "DRAFT": root / "drafts/life-form.json",
                "UPLOADS": root / "drafts/life-uploads",
                "import_http_photo": lambda _: EDITOR["store_upload"](b"oss image", "oss.jpg"),
            }), patch.object(new_life, "ROOT", root), patch.object(life_records, "ROOT", root), \
                    patch.object(legacy_life, "ROOT", root):
                server, url = EDITOR["start_server"]()
                thread = Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    self.assertIn("生活记录编辑器", urlopen(url).read().decode("utf-8"))
                    with self.assertRaises(HTTPError) as rejected:
                        urlopen(Request(url + "api/upload?name=one.png", data=b"image", method="POST",
                                        headers={"Origin": "https://example.com"}))
                    self.assertEqual(rejected.exception.code, 403)
                    rejected.exception.close()
                    uploaded = urlopen(Request(url + "api/upload?name=one.png", data=b"image", method="POST"))
                    source = json.loads(uploaded.read())["source"]
                    imported = urlopen(Request(url + "api/import-url", data=b'{"url":"http://photos.example.com/oss.jpg"}',
                                               method="POST", headers={"Content-Type": "application/json"}))
                    oss_source = json.loads(imported.read())["source"]
                    draft = {"title": "测试记录", "date": "2026-09-26",
                             "description": "", "body": "测试正文", "photos": [
                                 {"source": source, "alt": "测试照片"},
                                 {"source": oss_source, "alt": "OSS 照片"},
                             ]}
                    payload = json.dumps(draft).encode("utf-8")
                    response = urlopen(Request(url + "api/generate", data=payload, method="POST",
                                               headers={"Content-Type": "application/json"}))
                    self.assertEqual(response.status, 200)
                    result = json.loads(response.read())
                    self.assertTrue((root / result["path"]).exists())
                    stem = Path(result["path"]).stem
                    self.assertTrue((root / f"assets/images/life/{stem}-01.png").exists())
                    self.assertEqual((root / f"assets/images/life/{stem}-02.jpg").read_bytes(), b"oss image")
                    entries = json.loads(urlopen(url + "api/entries").read())
                    self.assertEqual(len(entries), 1)
                    self.assertEqual(entries[0]["id"], stem)
                    original = json.loads(urlopen(url + "api/entry?id=" + stem).read())
                    updated_data = {**draft, "title": "修改后的标题", "body": "修改后的正文", "photos": original["photos"]}
                    response = urlopen(Request(url + "api/entry/save", data=json.dumps({
                        "id": stem, "version": original["version"], "data": updated_data, "publish": False,
                    }).encode(), method="POST"))
                    self.assertEqual(response.status, 200)
                    modified = json.loads(urlopen(url + "api/entry?id=" + stem).read())
                    self.assertEqual(modified["title"], "修改后的标题")
                    self.assertEqual(modified["body"], "修改后的正文")
                    self.assertEqual(modified["url"], original["url"])
                    with self.assertRaises(HTTPError) as stale:
                        urlopen(Request(url + "api/entry/visibility", data=json.dumps({
                            "id": stem, "version": original["version"], "publish": False,
                        }).encode(), method="POST"))
                    self.assertEqual(stale.exception.code, 400)
                    stale.exception.close()
                    response = urlopen(Request(url + "api/entry/visibility", data=json.dumps({
                        "id": stem, "version": modified["version"], "publish": False,
                    }).encode(), method="POST"))
                    self.assertEqual(response.status, 200)
                    hidden = json.loads(urlopen(url + "api/entry?id=" + stem).read())
                    self.assertTrue(hidden["hidden"])
                    self.assertIn("permalink: false", (root / result["path"]).read_text(encoding="utf-8"))
                    response = urlopen(Request(url + "api/entry/delete", data=json.dumps({
                        "id": stem, "version": hidden["version"], "publish": False,
                    }).encode(), method="POST"))
                    self.assertEqual(response.status, 200)
                    self.assertFalse((root / result["path"]).exists())
                    self.assertTrue((root / f"assets/images/life/{stem}-01.png").exists())
                finally:
                    server.shutdown()
                    server.server_close()
                    thread.join(timeout=2)


class LocalGitPublishTests(unittest.TestCase):
    """Exercise commits and pushes against a disposable local bare remote."""

    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "checkout"
        self.remote = Path(temporary.name) / "origin.git"
        self.root.mkdir()
        subprocess.run(["git", "init", "--bare", "--initial-branch=main", str(self.remote)],
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
        self.repo_git("remote", "add", "origin", str(self.remote))
        self.repo_git("push", "-u", "origin", "main")
        stack = ExitStack()
        self.addCleanup(stack.close)
        self.globals = EDITOR["publish_paths"].__globals__
        stack.enter_context(patch.dict(self.globals, {
            "ROOT": self.root,
            "DRAFT": self.root / "drafts/life-form.json",
            "UPLOADS": self.root / "drafts/life-uploads",
            "PENDING_PUBLISH": self.root / "drafts/pending-publish.json",
        }))
        for module in (new_life, life_records, legacy_life, article_records):
            stack.enter_context(patch.object(module, "ROOT", self.root))

    def repo_git(self, *args):
        result = subprocess.run(["git", *args], cwd=self.root, check=True,
                                capture_output=True, encoding="utf-8")
        return result.stdout.strip()

    def create_local_entry(self, photos=()):
        status, result = EDITOR["handle_entry"]({
            "title": "Local entry", "date": "2026-10-02", "body": "Local body", "photos": list(photos),
        }, False)
        self.assertEqual(status, 200)
        self.assertFalse(result["published"])
        return life_records.read_entry(Path(result["path"]).stem)

    def save_entry(self, entry, publish=False, **updates):
        return EDITOR["change_existing"]({
            "id": entry["id"], "version": entry["version"],
            "data": {**entry, **updates}, "publish": publish,
        }, "save")

    def test_publish_generated_entry_includes_old_photos_and_skips_empty_commit(self):
        upload = EDITOR["store_upload"](b"first photo", "first.jpg")
        entry = self.create_local_entry([upload])
        image = entry["photos"][0]["source"].lstrip("/")
        unrelated = self.root / "assets/images/life/unrelated.jpg"
        unrelated.write_bytes(b"do not publish")
        (self.root / "README.md").write_text("Unrelated edit\n", encoding="utf-8")
        result = self.save_entry(entry, publish=True)
        self.assertTrue(result["published"])
        self.assertTrue(result["unchanged"])
        committed = set(self.repo_git("show", "--pretty=format:", "--name-only", "HEAD").splitlines())
        self.assertEqual(committed, {f"src/life/{entry['id']}.md", image})
        self.assertEqual(self.repo_git("show", f"origin/main:{image}"), "first photo")
        head = self.repo_git("rev-parse", "HEAD")
        result = self.save_entry(life_records.read_entry(entry["id"]), publish=True)
        self.assertFalse(result["published"])
        self.assertTrue(result["unchanged"])
        self.assertEqual(self.repo_git("rev-parse", "HEAD"), head)
        self.assertIn("README.md", self.repo_git("status", "--short"))
        self.assertIn("unrelated.jpg", self.repo_git("status", "--short"))

    def test_publish_locally_edited_existing_record_without_editing_it_again(self):
        entry = self.create_local_entry()
        self.save_entry(entry, publish=True)
        entry = life_records.read_entry(entry["id"])
        upload = EDITOR["store_upload"](b"later photo", "later.png")
        self.save_entry(entry, body="Edited locally", photos=[upload])
        latest = life_records.read_entry(entry["id"])
        result = self.save_entry(latest, publish=True)
        self.assertTrue(result["published"])
        self.assertTrue(result["unchanged"])
        image = latest["photos"][0]["source"].lstrip("/")
        self.assertEqual(self.repo_git("show", f"origin/main:{image}"), "later photo")
        self.assertIn("Edited locally", self.repo_git("show", f"origin/main:src/life/{entry['id']}.md"))

    def test_legacy_local_save_then_publish_includes_whole_page_photos(self):
        path = self.root / "src/legacy/work/work1.njk"
        path.parent.mkdir(parents=True)
        html = '<div class="stream-lr"><div class="stream-main"><h3 class="streamitem-title">Old entry</h3></div></div>'
        path.write_text(html + html, encoding="utf-8")
        self.repo_git("add", "--", str(path.relative_to(self.root)))
        self.repo_git("commit", "-m", "Existing legacy page")
        self.repo_git("push", "origin", "main")
        for index in (1, 2):
            entry = legacy_life.parse(f"legacy-work1-{index}")
            upload = EDITOR["store_upload"](f"legacy photo {index}".encode(), "legacy.jpg")
            updated_html = entry["html"].replace("</div></div>", f'<img src="{upload["source"]}"></div></div>')
            EDITOR["change_existing"]({"id": entry["id"], "version": entry["version"],
                                       "data": {"html": updated_html}, "publish": False}, "save")
        entry = legacy_life.parse("legacy-work1-1")
        result = EDITOR["change_existing"]({"id": entry["id"], "version": entry["version"],
                                            "data": {"html": entry["html"]}, "publish": True}, "save")
        self.assertTrue(result["published"])
        self.assertTrue(result["unchanged"])
        images = list((self.root / "assets/images/life").glob("*.jpg"))
        self.assertEqual(len(images), 2)
        for image in images:
            self.assertIn(image.relative_to(self.root).as_posix(), self.repo_git("ls-tree", "-r", "--name-only", "origin/main"))
        entry = legacy_life.parse("legacy-work1-1")
        result = EDITOR["change_existing"]({"id": entry["id"], "version": entry["version"],
                                            "data": {"html": entry["html"]}, "publish": True}, "save")
        self.assertFalse(result["published"])

    def test_missing_local_photo_fails_before_staging(self):
        upload = EDITOR["store_upload"](b"photo", "photo.jpg")
        entry = self.create_local_entry([upload])
        (self.root / entry["photos"][0]["source"].lstrip("/")).unlink()
        head = self.repo_git("rev-parse", "HEAD")
        with self.assertRaisesRegex(ValueError, "本地照片不存在"):
            EDITOR["publish_paths"]([life_records.entry_path(entry["id"])], "Publish missing image")
        self.assertEqual(self.repo_git("rev-parse", "HEAD"), head)
        self.assertEqual(self.repo_git("diff", "--cached", "--name-only"), "")

    def test_external_image_url_is_not_treated_as_local_and_encoded_names_are_supported(self):
        entry = self.create_local_entry([{"source": "https://photos.example.com/assets/images/life/external.jpg"}])
        image = self.root / "assets/images/life/a spaced image.jpg"
        image.parent.mkdir(parents=True, exist_ok=True)
        image.write_bytes(b"spaced photo")
        result = self.save_entry(entry, publish=True,
                                 body="![Photo](/assets/images/life/a%20spaced%20image.jpg)")
        self.assertTrue(result["published"])
        self.assertEqual(self.repo_git("show", "origin/main:assets/images/life/a spaced image.jpg"), "spaced photo")

    def test_retry_push_keeps_generated_photos_in_the_original_commit(self):
        entry = self.create_local_entry([EDITOR["store_upload"](b"retry photo", "retry.jpg")])
        original_git = self.globals["git"]
        def fail_push(*args):
            if args[0] == "push":
                raise RuntimeError("temporary network failure")
            return original_git(*args)
        with patch.dict(self.globals, {"git": fail_push}):
            with self.assertRaisesRegex(RuntimeError, "temporary network failure"):
                self.save_entry(entry, publish=True)
        head = self.repo_git("rev-parse", "HEAD")
        self.assertTrue((self.root / "drafts/pending-publish.json").is_file())
        result = EDITOR["retry_publish"]()
        self.assertTrue(result["published"])
        self.assertEqual(self.repo_git("rev-parse", "HEAD"), head)
        self.assertEqual(self.repo_git("rev-parse", "origin/main"), head)
        image = entry["photos"][0]["source"].lstrip("/")
        self.assertEqual(self.repo_git("show", f"origin/main:{image}"), "retry photo")
        self.assertFalse((self.root / "drafts/pending-publish.json").exists())


if __name__ == "__main__":
    unittest.main()
