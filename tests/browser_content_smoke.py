"""Build copied sources and verify that normal content changes remain publishable."""

from functools import partial
from datetime import date, timedelta
from http.server import ThreadingHTTPServer
from mimetypes import guess_type
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread
from unittest.mock import patch
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

from browser_smoke import QuietHandler, check_content_navigation


PROJECT = Path(__file__).resolve().parents[1]
OLDER_URL = "/life/2025-09-30-browser-older/"
sys.path.insert(0, str(PROJECT))
from scripts import article_records, new_life


def build(root):
    result = subprocess.run(
        [shutil.which("node") or "node", str(PROJECT / "node_modules/@11ty/eleventy/cmd.cjs"),
         "--output=_site"],
        cwd=root, text=True, encoding="utf-8", stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, timeout=120,
    )
    assert result.returncode == 0, result.stdout
    return root / "_site"


def check_variant(root, *, article_url, empty=False):
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(root)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            def route_request(route):
                if route.request.url.startswith(base):
                    route.continue_()
                    return
                parsed = urlsplit(route.request.url)
                if parsed.hostname in {"rlzhao.com", "www.rlzhao.com"}:
                    file = root / unquote(parsed.path).lstrip("/")
                    if file.is_file():
                        route.fulfill(path=file, content_type=guess_type(file.name)[0]
                                      or "application/octet-stream")
                        return
                route.abort()

            page.route("**/*", route_request)
            check_content_navigation(page, base)
            page.goto(base + "/articles.html", wait_until="networkidle")
            assert page.locator(".article-card-image").first.get_attribute("href") == article_url
            page.goto(base + "/work.html", wait_until="networkidle")
            if empty:
                assert not (root / "work/page/2/index.html").exists(), "removed pagination left stale output"
                assert page.locator(".stream-lr").count() == 0
                assert page.locator(".life-pager").count() > 0, "empty list lost archive navigation"
                archive = page.locator(".life-pager-direction", has_text="较早一页").first
                archive.click()
                page.wait_for_url("**/media/pages/work/work/work15.html")
                assert page.locator(".stream-lr").count() > 0
            else:
                assert page.locator(".stream-lr").count() == 10
                assert page.locator(f'.stream-lr a[href="{OLDER_URL}"]').count() == 0
                years = page.locator(".life-years").first.locator("a")
                latest_year = years.filter(has_text="2026")
                assert latest_year.get_attribute("href") == "/work/page/2/#life-year-2026"
                page.locator(".life-pager-direction", has_text="较早一页").first.click()
                page.wait_for_url("**/work/page/2/")
                assert page.locator(f'.stream-lr a[href="{OLDER_URL}"]').count() == 1
            assert not errors, "JavaScript errors: " + "; ".join(errors)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


def main():
    cache = PROJECT / ".cache"
    cache.mkdir(exist_ok=True)
    # Keep fixtures under the project so Node resolves the installed dependencies.
    # Every source, photo, cache and output written below belongs to this temp root.
    with TemporaryDirectory(prefix="content-smoke-", dir=cache) as directory:
        root = Path(directory).resolve()
        assert root.parent == cache.resolve() and root.name.startswith("content-smoke-")
        for source in ("src", "assets", "media", "highlight", "scripts"):
            shutil.copytree(PROJECT / source, root / source,
                            ignore=shutil.ignore_patterns("__pycache__"))
        for source in ("eleventy.config.js", "package.json", "verification.html"):
            shutil.copy2(PROJECT / source, root / source)
        # Use deterministic life fixtures so deleting or adding real posts never
        # changes this regression scenario's expected pagination.
        for entry in (root / "src/life").iterdir():
            if entry.is_file():
                entry.unlink()
        with patch.object(article_records, "ROOT", root), patch.object(new_life, "ROOT", root):
            newest_date = max(date.fromisoformat(item["date"]) for item in article_records.list_articles())
            article_date = max(date(2026, 10, 2), newest_date + timedelta(days=1))
            _, article = article_records.create({
                "slug": "browser-content-fixture", "date": article_date.isoformat(),
                "title": "新增文章浏览器检查", "cardTitle": "新增文章浏览器检查",
                "description": "验证新增文章不会误阻发布", "summary": "临时文章",
                "category": "测试", "cover": "", "body": "这篇文章只存在于临时目录。",
            })
            new_life.write_entry({
                "title": "较早的临时记录", "date": "2025-09-30", "slug": "browser-older",
                "body": "新增内容后应该进入第二页。", "photos": [],
            }, root)
            for number in range(1, 12):
                new_life.write_entry({
                    "title": f"新生活记录 {number}", "date": f"2026-10-{number:02}",
                    "slug": f"browser-content-{number}", "body": "临时分页记录。", "photos": [],
                }, root)
        check_variant(build(root), article_url=article["url"])
        print("PASS: a new article and 11 newer life entries retain working navigation")

        for entry in (root / "src/life").iterdir():
            if entry.is_file():
                entry.unlink()
        check_variant(build(root), article_url=article["url"], empty=True)
        print("PASS: an empty modern life list retains working historical navigation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
