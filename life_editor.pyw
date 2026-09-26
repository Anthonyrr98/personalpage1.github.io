"""Double-click to open the private life editor in a local browser tab."""

from datetime import date
import json
import mimetypes
import os
from pathlib import Path
import secrets
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import time
from urllib.parse import parse_qs, urlsplit
import webbrowser

from scripts.new_life import IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, ROOT, write_entry


EDITOR = ROOT / "editor"
DRAFT = ROOT / "drafts" / "life-form.json"
UPLOADS = ROOT / "drafts" / "life-uploads"
MAX_JSON_BYTES = 1024 * 1024


def empty_draft():
    return {"title": "", "date": date.today().isoformat(), "description": "", "body": "", "photos": []}


def git(*args):
    result = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True,
        encoding="utf-8", errors="replace", check=False,
    )
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip() or "Git 操作失败")
    return result.stdout.strip()


def check_publish_ready():
    if git("branch", "--show-current") != "main":
        raise RuntimeError("当前不在 main 分支。请先合并并同步项目，再从 main 发布。")
    if git("diff", "--cached", "--name-only"):
        raise RuntimeError("暂存区已有其他改动，请先处理这些改动，以免一起提交。")
    git("fetch", "origin", "main")
    if git("rev-parse", "HEAD") != git("rev-parse", "origin/main"):
        raise RuntimeError("本地 main 与 GitHub 不一致，请先同步项目。")


def publish_files(output, images, title):
    paths = [str(path.relative_to(ROOT)) for path in [output, *images]]
    git("add", "--", *paths)
    git("commit", "-m", f"Add life entry: {title}")
    git("push", "origin", "main")


def save_draft(data):
    if not isinstance(data, dict) or not isinstance(data.get("photos"), list):
        raise ValueError("草稿格式不正确")
    allowed = {key: data.get(key, default) for key, default in empty_draft().items()}
    DRAFT.parent.mkdir(parents=True, exist_ok=True)
    temporary = DRAFT.with_suffix(".tmp")
    temporary.write_text(json.dumps(allowed, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, DRAFT)
    return allowed


def read_draft():
    if not DRAFT.exists():
        return empty_draft()
    return json.loads(DRAFT.read_text(encoding="utf-8"))


def handle_entry(data, publish):
    data = save_draft(data)
    if publish:
        check_publish_ready()
    output = None
    try:
        output, images, url = write_entry(data, DRAFT.parent)
        if publish:
            publish_files(output, images, data["title"].strip())
    except Exception as error:
        return 400, {"error": str(error), "generated": str(output.relative_to(ROOT)) if output else None}
    for photo in data["photos"]:
        source = photo.get("source", "")
        if source.startswith("life-uploads/"):
            (DRAFT.parent / source).unlink(missing_ok=True)
    save_draft(empty_draft())
    return 200, {"path": str(output.relative_to(ROOT)), "url": url, "images": len(images), "published": publish}


def make_handler(token):
    prefix = f"/{token}"

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, status, content, mime="application/json; charset=utf-8"):
            if isinstance(content, (dict, list)):
                content = json.dumps(content, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; img-src 'self' https: data:; style-src 'self'; "
                "script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'",
            )
            self.end_headers()
            self.wfile.write(content)

        def authorized(self):
            path = urlsplit(self.path).path
            if not path.startswith(prefix + "/"):
                self.reply(404, {"error": "页面不存在"})
                return False
            host = self.headers.get("Host", "")
            if host != f"127.0.0.1:{self.server.server_port}":
                self.reply(403, {"error": "访问来源不正确"})
                return False
            if self.command == "POST":
                origin = self.headers.get("Origin")
                if origin and origin != f"http://{host}":
                    self.reply(403, {"error": "访问来源不正确"})
                    return False
            self.server.last_request = time.monotonic()
            return True

        def body(self, limit):
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > limit:
                raise ValueError("上传内容为空或过大")
            return self.rfile.read(length)

        def do_GET(self):
            if not self.authorized():
                return
            path = urlsplit(self.path).path.removeprefix(prefix)
            if path == "/api/draft":
                try:
                    self.reply(200, read_draft())
                except (OSError, ValueError) as error:
                    self.reply(500, {"error": f"草稿无法读取：{error}"})
                return
            if path == "/api/status":
                try:
                    branch = git("branch", "--show-current")
                    self.reply(200, {"branch": branch, "canPublish": branch == "main"})
                except RuntimeError as error:
                    self.reply(500, {"error": str(error)})
                return
            if path.startswith("/preview/"):
                name = path.removeprefix("/preview/")
                file = UPLOADS / name
                if Path(name).name == name and file.is_file():
                    self.reply(200, file.read_bytes(), mimetypes.guess_type(name)[0] or "application/octet-stream")
                else:
                    self.reply(404, {"error": "图片不存在"})
                return
            files = {"/": "index.html", "/app.css": "app.css", "/app.js": "app.js"}
            if path in files:
                file = EDITOR / files[path]
                mime = {".html": "text/html", ".css": "text/css", ".js": "text/javascript"}[file.suffix]
                self.reply(200, file.read_bytes(), mime + "; charset=utf-8")
            else:
                self.reply(404, {"error": "页面不存在"})

        def do_POST(self):
            if not self.authorized():
                return
            path = urlsplit(self.path).path.removeprefix(prefix)
            try:
                if path == "/api/upload":
                    name = parse_qs(urlsplit(self.path).query).get("name", [""])[0]
                    extension = Path(name).suffix.lower()
                    if extension not in IMAGE_EXTENSIONS:
                        raise ValueError("只支持 JPG、PNG、WebP、GIF 或 AVIF 图片")
                    content = self.body(MAX_IMAGE_BYTES)
                    UPLOADS.mkdir(parents=True, exist_ok=True)
                    filename = secrets.token_hex(12) + extension
                    (UPLOADS / filename).write_bytes(content)
                    self.reply(200, {"source": f"life-uploads/{filename}", "name": Path(name).name})
                elif path in ("/api/draft", "/api/generate", "/api/publish"):
                    data = json.loads(self.body(MAX_JSON_BYTES))
                    if path == "/api/draft":
                        save_draft(data)
                        self.reply(200, {"saved": True})
                    else:
                        status, result = handle_entry(data, path == "/api/publish")
                        self.reply(status, result)
                elif path == "/api/remove-upload":
                    source = json.loads(self.body(MAX_JSON_BYTES)).get("source", "")
                    if not isinstance(source, str):
                        raise ValueError("照片路径不正确")
                    name = source.removeprefix("life-uploads/")
                    if not source.startswith("life-uploads/") or Path(name).name != name:
                        raise ValueError("照片路径不正确")
                    (UPLOADS / name).unlink(missing_ok=True)
                    self.reply(200, {"removed": True})
                elif path == "/api/close":
                    self.reply(200, {"closed": True})
                    Thread(target=self.server.shutdown, daemon=True).start()
                else:
                    self.reply(404, {"error": "页面不存在"})
            except (OSError, ValueError, RuntimeError) as error:
                self.reply(400, {"error": str(error)})

    return Handler


def start_server():
    token = secrets.token_urlsafe(24)
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(token))
    server.daemon_threads = True
    server.last_request = time.monotonic()
    return server, f"http://127.0.0.1:{server.server_port}/{token}/"


if __name__ == "__main__":
    server, address = start_server()
    webbrowser.open(address)

    def expire_when_idle():
        while True:
            time.sleep(60)
            if time.monotonic() - server.last_request > 1800:
                server.shutdown()
                return

    Thread(target=expire_when_idle, daemon=True).start()
    try:
        server.serve_forever()
    finally:
        server.server_close()
