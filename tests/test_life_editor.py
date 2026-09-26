"""Keep the GUI publish button from pushing from an unsafe Git state."""

import json
from email.message import Message
from io import BytesIO
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
from threading import Thread
from types import SimpleNamespace
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

from scripts import new_life


EDITOR = runpy.run_path(str(Path(__file__).resolve().parents[1] / "life_editor.pyw"), run_name="test")


class PublishTests(unittest.TestCase):
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
            }), patch.object(new_life, "ROOT", root):
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
                finally:
                    server.shutdown()
                    server.server_close()
                    thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
