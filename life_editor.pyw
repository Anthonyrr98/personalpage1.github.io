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
from urllib.parse import parse_qs, unquote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, getproxies
import webbrowser

from scripts.new_life import IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, ROOT, write_entry
from scripts import article_records, life_records, legacy_life


EDITOR = ROOT / "editor"
DRAFT = ROOT / "drafts" / "life-form.json"
ARTICLE_DRAFT = ROOT / "drafts" / "article-form.json"
UPLOADS = ROOT / "drafts" / "life-uploads"
PENDING_PUBLISH = ROOT / "drafts" / "pending-publish.json"
MAX_JSON_BYTES = 1024 * 1024
IMAGE_TYPES = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
    "image/gif": ".gif", "image/avif": ".avif",
}
PROXY_FAKE_IP_RANGE = ipaddress.ip_network("198.18.0.0/15")
RECORD_LOCK = Lock()
DRAFT_LOCK = Lock()


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
    if PENDING_PUBLISH.exists():
        raise RuntimeError("上一次发布已有待推送的提交，请先继续推送。")
    if git("branch", "--show-current") != "main":
        raise RuntimeError("当前不在 main 分支。请先合并并同步项目，再从 main 发布。")
    if git("diff", "--cached", "--name-only"):
        raise RuntimeError("暂存区已有其他改动，请先处理这些改动，以免一起提交。")
    git("fetch", "origin", "main")
    if git("rev-parse", "HEAD") != git("rev-parse", "origin/main"):
        raise RuntimeError("本地 main 与 GitHub 不一致，请先同步项目。")


LOCAL_LIFE_IMAGE = re.compile(
    r'''(?:\b(?:src|href)\s*=\s*|\b(?:src|cover):\s*)(?P<quote>["'])'''
    r'''(?P<quoted>/assets/images/life/[^\r\n]*?)(?P=quote)'''
    r'''|(?:\]\(|\burl\()\s*(?P<link>/assets/images/life/[^\s"'<>\[\]()]+)''',
    re.I,
)


def publication_paths(paths):
    """Include photos referenced by the final files, including earlier local saves."""
    selected = list(dict.fromkeys(paths))
    for path in list(selected):
        if path.suffix.lower() not in (".md", ".njk") or not path.is_file():
            continue
        for match in LOCAL_LIFE_IMAGE.finditer(path.read_text(encoding="utf-8")):
            source = match["quoted"] or match["link"]
            name = unquote(urlsplit(source).path.removeprefix("/assets/images/life/"))
            image = ROOT / "assets" / "images" / "life" / name
            if Path(name).name != name or image.suffix.lower() not in IMAGE_EXTENSIONS:
                raise ValueError("记录引用的本地照片路径不正确")
            if not image.is_file():
                raise ValueError(f"记录引用的本地照片不存在：{name}")
            if image not in selected:
                selected.append(image)
    return [str(path.relative_to(ROOT)) for path in selected]


def publish_paths(paths, message, url=""):
    paths = publication_paths(paths)
    git("add", "--", *paths)
    if not git("diff", "--cached", "--name-only", "--", *paths):
        return False
    git("commit", "-m", message)
    pending = {"commit": git("rev-parse", "HEAD"), "path": paths[0], "url": url}
    # Keep the commit identity on disk before pushing, including across editor restarts.
    PENDING_PUBLISH.parent.mkdir(parents=True, exist_ok=True)
    temporary = PENDING_PUBLISH.with_suffix(".tmp")
    temporary.write_text(json.dumps(pending, ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, PENDING_PUBLISH)
    git("push", "origin", "main")
    PENDING_PUBLISH.unlink()
    return True


def publish_files(output, images, title, url):
    return publish_paths([output, *images], f"Add life entry: {title}", url)


def retry_publish():
    if not PENDING_PUBLISH.is_file():
        raise ValueError("没有待推送的记录")
    pending = json.loads(PENDING_PUBLISH.read_text(encoding="utf-8"))
    if git("branch", "--show-current") != "main" or git("rev-parse", "HEAD") != pending["commit"]:
        raise RuntimeError("本地提交已变化，请先检查 Git 状态，不能自动重试。")
    if git("diff", "--cached", "--name-only"):
        raise RuntimeError("暂存区有其他改动，请先处理后再重试。")
    git("fetch", "origin", "main")
    remote = git("rev-parse", "origin/main")
    if remote != pending["commit"]:
        if git("rev-parse", "HEAD^") != remote:
            raise RuntimeError("GitHub 上的 main 已变化，请先手动同步。")
        git("push", "origin", "main")
    PENDING_PUBLISH.unlink()
    return {"published": True, "path": pending["path"], "url": pending["url"]}


def save_draft(data):
    if not isinstance(data, dict) or not isinstance(data.get("photos"), list):
        raise ValueError("草稿格式不正确")
    allowed = {key: data.get(key, default) for key, default in empty_draft().items()}
    revision = data.get("_revision")
    if revision is not None and (type(revision) is not int or not 0 <= revision <= 9007199254740991):
        raise ValueError("草稿版本不正确")
    with DRAFT_LOCK:
        previous = read_draft()
        previous_revision = previous.get("_revision", 0)
        if revision is not None and revision <= previous_revision:
            # A late autosave must not overwrite the newer pagehide snapshot.
            return previous
        allowed["_revision"] = revision if revision is not None else previous_revision + 1
        DRAFT.parent.mkdir(parents=True, exist_ok=True)
        temporary = DRAFT.with_name(f".{DRAFT.name}.{secrets.token_hex(4)}.tmp")
        try:
            temporary.write_text(json.dumps(allowed, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(temporary, DRAFT)
        finally:
            temporary.unlink(missing_ok=True)
        return allowed


def read_draft():
    if not DRAFT.exists():
        return {**empty_draft(), "_revision": 0}
    return json.loads(DRAFT.read_text(encoding="utf-8"))


def handle_entry(data, publish):
    data = save_draft(data)
    if publish:
        check_publish_ready()
    output = None
    published = False
    try:
        output, images, url = write_entry(data, DRAFT.parent)
        if publish:
            published = publish_files(output, images, data["title"].strip(), url)
    except Exception as error:
        if publish and PENDING_PUBLISH.is_file():
            pending = json.loads(PENDING_PUBLISH.read_text(encoding="utf-8"))
            if output and pending["path"] == str(output.relative_to(ROOT)):
                remove_used_uploads(data["photos"])
                save_draft(empty_draft())
                return 409, {"error": f"文件已生成并提交，但尚未推送：{error}",
                             "state": "committed", "pending": pending,
                             "generated": str(output.relative_to(ROOT))}
        return 400, {"error": str(error), "state": "generated" if output else "failed",
                     "generated": str(output.relative_to(ROOT)) if output else None}
    for photo in data["photos"]:
        source = photo.get("source", "")
        if source.startswith("life-uploads/"):
            (DRAFT.parent / source).unlink(missing_ok=True)
    cleared = save_draft(empty_draft())
    return 200, {"path": str(output.relative_to(ROOT)), "url": url, "images": len(images),
                 "published": published, "draftRevision": cleared["_revision"]}


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
            published = False
            if publish:
                try:
                    published = publish_paths([path, *images], f"{action.capitalize()} legacy life entry: {entry['title']}", entry["url"])
                except RuntimeError as error:
                    raise RuntimeError(f"已在本地修改，但推送失败：{error}") from error
            for upload in used:
                upload.unlink(missing_ok=True)
            updated = None if action == "delete" else legacy_life.public(legacy_life.parse(entry["id"]))
            return {"deleted": action == "delete", "published": published,
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
            published = False
            if tracked:
                try:
                    published = publish_paths([path], f"Delete life entry: {entry['title']}", entry["url"])
                except RuntimeError as error:
                    raise RuntimeError(f"已在本地删除，但推送失败：{error}") from error
            return {"deleted": True, "published": published}
        data = payload.get("data") if action == "save" else entry
        if not isinstance(data, dict):
            raise ValueError("记录内容格式不正确")
        data = dict(data)
        data["hidden"] = not entry["hidden"] if action == "visibility" else entry["hidden"]
        output, images, url = write_entry(data, DRAFT.parent, existing_name=entry["id"],
                                          extra_frontmatter=entry["extra"])
        updated = life_records.read_entry(entry["id"])
        changed = updated["version"] != entry["version"] or bool(images)
        published = False
        if publish:
            verb = "Hide" if data["hidden"] and action == "visibility" else \
                   "Show" if action == "visibility" else "Update"
            try:
                published = publish_paths([output, *images], f"{verb} life entry: {data['title'].strip()}", url)
            except RuntimeError as error:
                raise RuntimeError(f"已在本地修改，但推送失败：{error}") from error
        remove_used_uploads(data.get("photos", []))
        return {"id": entry["id"], "version": updated["version"], "url": url,
                "hidden": updated["hidden"], "published": published, "unchanged": not changed}


def change_article(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("publish"), bool):
        raise ValueError("请求格式不正确")
    with RECORD_LOCK:
        if payload["publish"]:
            check_publish_ready()
        path, changed, article = article_records.save(payload.get("id"), payload.get("version"), payload.get("data"))
        published = False
        if payload["publish"]:
            published = publish_paths([path], f"Update article: {article['cardTitle']}", article["url"])
        return {"article": article, "unchanged": not changed, "published": published}


def empty_article_draft():
    return {"slug": "", "title": "", "cardTitle": "", "date": date.today().isoformat(),
            "category": "", "description": "", "summary": "", "cover": "", "body": ""}


def save_article_draft(data):
    if not isinstance(data, dict):
        raise ValueError("文章草稿格式不正确")
    allowed = {}
    for key, default in empty_article_draft().items():
        value = data.get(key, default)
        if not isinstance(value, str) or len(value) > MAX_JSON_BYTES:
            raise ValueError("文章草稿格式不正确")
        allowed[key] = value
    ARTICLE_DRAFT.parent.mkdir(parents=True, exist_ok=True)
    temporary = ARTICLE_DRAFT.with_suffix(".tmp")
    temporary.write_text(json.dumps(allowed, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, ARTICLE_DRAFT)
    return allowed


def read_article_draft():
    return json.loads(ARTICLE_DRAFT.read_text(encoding="utf-8")) if ARTICLE_DRAFT.is_file() else empty_article_draft()


def handle_new_article(data, publish):
    data = save_article_draft(data)
    if publish:
        check_publish_ready()
    path = None
    article = None
    published = False
    try:
        path, article = article_records.create(data)
        if publish:
            published = publish_paths([path], f"Add article: {article['cardTitle']}", article["url"])
    except Exception as error:
        pending = json.loads(PENDING_PUBLISH.read_text(encoding="utf-8")) if PENDING_PUBLISH.is_file() else None
        if pending and path and pending["path"] == str(path.relative_to(ROOT)):
            save_article_draft(empty_article_draft())
            return 409, {"error": f"文章已提交，但尚未推送：{error}", "state": "committed",
                         "pending": pending, "article": article}
        if path:
            save_article_draft(empty_article_draft())
        return 400, {"error": str(error), "state": "generated" if path else "failed",
                     "article": article}
    save_article_draft(empty_article_draft())
    return 200, {"article": article, "published": published}


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
            if path == "/api/articles":
                try:
                    self.reply(200, article_records.list_articles())
                except (OSError, ValueError) as error:
                    self.reply(500, {"error": f"文章列表无法读取：{error}"})
                return
            if path == "/api/article-draft":
                try:
                    self.reply(200, read_article_draft())
                except (OSError, ValueError) as error:
                    self.reply(500, {"error": f"文章草稿无法读取：{error}"})
                return
            if path == "/api/article":
                try:
                    article_id = parse_qs(urlsplit(self.path).query).get("id", [""])[0]
                    self.reply(200, article_records.parse(article_id))
                except (OSError, ValueError) as error:
                    self.reply(404, {"error": str(error)})
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
                    pending = json.loads(PENDING_PUBLISH.read_text(encoding="utf-8")) if PENDING_PUBLISH.is_file() else None
                    self.reply(200, {"branch": branch, "canPublish": branch == "main" and pending is None,
                                     "pending": pending})
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
                elif path == "/api/retry-push":
                    self.reply(200, retry_publish())
                elif path in ("/api/draft", "/api/generate", "/api/publish"):
                    data = json.loads(self.body(MAX_JSON_BYTES))
                    if path == "/api/draft":
                        saved = save_draft(data)
                        matches = all(saved.get(key) == data.get(key, default)
                                      for key, default in empty_draft().items())
                        self.reply(200, {"saved": matches, "revision": saved.get("_revision", 0)})
                    else:
                        status, result = handle_entry(data, path == "/api/publish")
                        self.reply(status, result)
                elif path in ("/api/entry/save", "/api/entry/visibility", "/api/entry/delete"):
                    payload = json.loads(self.body(MAX_JSON_BYTES))
                    self.reply(200, change_existing(payload, path.rsplit("/", 1)[1]))
                elif path == "/api/article/save":
                    self.reply(200, change_article(json.loads(self.body(MAX_JSON_BYTES))))
                elif path == "/api/article-draft":
                    save_article_draft(json.loads(self.body(MAX_JSON_BYTES)))
                    self.reply(200, {"saved": True})
                elif path in ("/api/article/generate", "/api/article/publish"):
                    status, result = handle_new_article(json.loads(self.body(MAX_JSON_BYTES)), path.endswith("publish"))
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
                pending = json.loads(PENDING_PUBLISH.read_text(encoding="utf-8")) if PENDING_PUBLISH.is_file() else None
                self.reply(409 if pending else 400,
                           {"error": str(error), "state": "committed" if pending else "failed", "pending": pending})

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
