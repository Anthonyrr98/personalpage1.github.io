"""Double-click to open the private life editor in a local browser tab."""

from datetime import date
import ipaddress
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock, Thread
import time
from urllib.parse import parse_qs, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, getproxies
import webbrowser

from scripts.new_life import IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, ROOT, write_entry
from scripts import life_records, legacy_life


EDITOR = ROOT / "editor"
DRAFT = ROOT / "drafts" / "life-form.json"
UPLOADS = ROOT / "drafts" / "life-uploads"
MAX_JSON_BYTES = 1024 * 1024
IMAGE_TYPES = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
    "image/gif": ".gif", "image/avif": ".avif",
}
PROXY_FAKE_IP_RANGE = ipaddress.ip_network("198.18.0.0/15")
RECORD_LOCK = Lock()


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise ValueError("图片链接发生跳转，请填写最终的图片地址")


def store_upload(content, name):
    extension = Path(name).suffix.lower()
    if extension not in IMAGE_EXTENSIONS:
        raise ValueError("只支持 JPG、PNG、WebP、GIF 或 AVIF 图片")
    if not content or len(content) > MAX_IMAGE_BYTES:
        raise ValueError("图片为空或超过 20 MB")
    UPLOADS.mkdir(parents=True, exist_ok=True)
    filename = secrets.token_hex(12) + extension
    (UPLOADS / filename).write_bytes(content)
    return {"source": f"life-uploads/{filename}", "name": Path(name).name}


def is_public_host(hostname):
    try:
        # A literal private address must stay blocked even when a proxy is configured.
        if not ipaddress.ip_address(hostname).is_global:
            return False
    except ValueError:
        pass
    addresses = socket.getaddrinfo(hostname, 80, type=socket.SOCK_STREAM)
    proxy = getproxies()
    has_http_proxy = bool(proxy.get("http") or proxy.get("all"))
    return bool(addresses) and all(
        ipaddress.ip_address(item[4][0]).is_global
        or (has_http_proxy and ipaddress.ip_address(item[4][0]) in PROXY_FAKE_IP_RANGE)
        for item in addresses
    )


def import_http_photo(source):
    url = urlsplit(source)
    if url.scheme != "http" or not url.hostname or url.username or url.password or url.port not in (None, 80):
        raise ValueError("请填写公开的 HTTP 图片直链")
    if not is_public_host(url.hostname):
        raise ValueError("只允许导入公开的 OSS 图片地址")
    request = Request(source, headers={"User-Agent": "LifeEditor/1.0"})
    with build_opener(NoRedirects()).open(request, timeout=15) as response:
        content_type = response.headers.get_content_type().lower()
        extension = Path(url.path).suffix.lower()
        if content_type in IMAGE_TYPES:
            extension = IMAGE_TYPES[content_type]
        elif content_type != "application/octet-stream" or extension not in IMAGE_EXTENSIONS:
            raise ValueError("链接没有返回受支持的图片")
        if int(response.headers.get("Content-Length", "0")) > MAX_IMAGE_BYTES:
            raise ValueError("图片超过 20 MB，请先压缩")
        content = response.read(MAX_IMAGE_BYTES + 1)
    return store_upload(content, (Path(url.path).stem or "oss-image") + extension)


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


def publish_paths(paths, message):
    paths = [str(path.relative_to(ROOT)) for path in paths]
    git("add", "--", *paths)
    git("commit", "-m", message)
    git("push", "origin", "main")


def publish_files(output, images, title):
    publish_paths([output, *images], f"Add life entry: {title}")


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


def check_entry_version(entry_id, version):
    entry = life_records.read_entry(entry_id)
    if not isinstance(version, str) or version != entry["version"]:
        raise ValueError("这条记录已被其他操作修改，请重新打开后再编辑")
    return entry


def remove_used_uploads(photos):
    for photo in photos:
        source = photo.get("source", "")
        if isinstance(source, str) and source.startswith("life-uploads/"):
            (DRAFT.parent / source).unlink(missing_ok=True)


LEGACY_UPLOAD = re.compile(r'(\bsrc=")(?P<source>life-uploads/[a-f0-9]{24}\.(?:jpe?g|png|webp|gif|avif))(")', re.I)


def materialize_legacy_uploads(html, entry_id):
    """Copy newly added photos before writing a legacy HTML record."""
    images = []
    used = []
    replacements = {}
    def replace(match):
        source = match.group("source")
        if source not in replacements:
            original = DRAFT.parent / source
            if not original.is_file() or original.stat().st_size > MAX_IMAGE_BYTES:
                raise ValueError("旧记录中的本地照片不存在或超过 20 MB")
            destination = ROOT / "assets" / "images" / "life" / f"{entry_id}-{secrets.token_hex(6)}{original.suffix.lower()}"
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original, destination)
            images.append(destination)
            used.append(original)
            replacements[source] = f"/assets/images/life/{destination.name}"
        return match.group(1) + replacements[source] + match.group(3)
    try:
        updated = LEGACY_UPLOAD.sub(replace, html)
        if "life-uploads/" in updated:
            raise ValueError("旧记录中存在无法识别的本地照片地址")
    except Exception:
        for image in images:
            image.unlink(missing_ok=True)
        raise
    return updated, images, used


def change_existing(payload, action):
    if not isinstance(payload, dict):
        raise ValueError("请求格式不正确")
    with RECORD_LOCK:
        if isinstance(payload.get("id"), str) and payload["id"].startswith("legacy-"):
            entry = legacy_life.parse(payload["id"])
            if entry["version"] != payload.get("version"):
                raise ValueError("这条记录已被修改，请重新打开")
            publish = payload.get("publish", False)
            if not isinstance(publish, bool):
                raise ValueError("发布选项不正确")
            if publish:
                check_publish_ready()
            data = payload.get("data", {})
            html = data.get("html") if isinstance(data, dict) else None
            images = []
            used = []
            if action == "save" and isinstance(html, str):
                html, images, used = materialize_legacy_uploads(html, entry["id"])
            try:
                path, changed = legacy_life.change(entry["id"], entry["version"], action, html)
            except Exception:
                for image in images:
                    image.unlink(missing_ok=True)
                raise
            if publish and changed:
                try:
                    publish_paths([path, *images], f"{action.capitalize()} legacy life entry: {entry['title']}")
                except RuntimeError as error:
                    raise RuntimeError(f"已在本地修改，但推送失败：{error}") from error
            for upload in used:
                upload.unlink(missing_ok=True)
            updated = None if action == "delete" else legacy_life.public(legacy_life.parse(entry["id"]))
            return {"deleted": action == "delete", "published": publish,
                    "unchanged": not changed, "entry": updated}
        entry = check_entry_version(payload.get("id"), payload.get("version"))
        publish = payload.get("publish", False)
        if not isinstance(publish, bool):
            raise ValueError("发布选项不正确")
        if publish:
            check_publish_ready()
        path = life_records.entry_path(entry["id"])
        if action == "delete":
            tracked = bool(git("ls-files", "--", str(path.relative_to(ROOT)))) if publish else False
            path.unlink()
            if tracked:
                try:
                    publish_paths([path], f"Delete life entry: {entry['title']}")
                except RuntimeError as error:
                    raise RuntimeError(f"已在本地删除，但推送失败：{error}") from error
            return {"deleted": True, "published": tracked}
        data = payload.get("data") if action == "save" else entry
        if not isinstance(data, dict):
            raise ValueError("记录内容格式不正确")
        data = dict(data)
        data["hidden"] = not entry["hidden"] if action == "visibility" else entry["hidden"]
        output, images, url = write_entry(data, DRAFT.parent, existing_name=entry["id"],
                                          extra_frontmatter=entry["extra"])
        updated = life_records.read_entry(entry["id"])
        changed = updated["version"] != entry["version"] or bool(images)
        if publish and changed:
            verb = "Hide" if data["hidden"] and action == "visibility" else \
                   "Show" if action == "visibility" else "Update"
            try:
                publish_paths([output, *images], f"{verb} life entry: {data['title'].strip()}")
            except RuntimeError as error:
                raise RuntimeError(f"已在本地修改，但推送失败：{error}") from error
        remove_used_uploads(data.get("photos", []))
        return {"id": entry["id"], "version": updated["version"], "url": url,
                "hidden": updated["hidden"], "published": publish, "unchanged": not changed}


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
            if path == "/api/entries":
                try:
                    self.reply(200, life_records.list_entries() + legacy_life.list_entries())
                except (OSError, ValueError) as error:
                    self.reply(500, {"error": f"记录列表无法读取：{error}"})
                return
            if path == "/api/entry":
                try:
                    entry_id = parse_qs(urlsplit(self.path).query).get("id", [""])[0]
                    self.reply(200, legacy_life.public(legacy_life.parse(entry_id)) if entry_id.startswith("legacy-")
                               else life_records.read_entry(entry_id))
                except (OSError, ValueError) as error:
                    self.reply(404, {"error": str(error)})
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
            if path.startswith("/asset/"):
                name = path.removeprefix("/asset/")
                file = ROOT / "assets" / "images" / "life" / name
                if Path(name).name == name and file.suffix.lower() in IMAGE_EXTENSIONS and file.is_file():
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
                    self.reply(200, store_upload(self.body(MAX_IMAGE_BYTES), name))
                elif path == "/api/import-url":
                    source = json.loads(self.body(MAX_JSON_BYTES)).get("url", "")
                    if not isinstance(source, str):
                        raise ValueError("图片链接格式不正确")
                    self.reply(200, import_http_photo(source))
                elif path in ("/api/draft", "/api/generate", "/api/publish"):
                    data = json.loads(self.body(MAX_JSON_BYTES))
                    if path == "/api/draft":
                        save_draft(data)
                        self.reply(200, {"saved": True})
                    else:
                        status, result = handle_entry(data, path == "/api/publish")
                        self.reply(status, result)
                elif path in ("/api/entry/save", "/api/entry/visibility", "/api/entry/delete"):
                    payload = json.loads(self.body(MAX_JSON_BYTES))
                    self.reply(200, change_existing(payload, path.rsplit("/", 1)[1]))
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
