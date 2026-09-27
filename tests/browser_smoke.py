"""Exercise the main pages and published calculator examples in Chromium."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from mimetypes import guess_type
from pathlib import Path
from threading import Thread
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree
import sys

from playwright.sync_api import sync_playwright


ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def check_close(actual, expected, tolerance, label):
    assert abs(float(actual) - expected) <= tolerance, f"{label}: {actual} differs from {expected}"


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            def route_request(route):
                url = route.request.url
                if url.startswith(base):
                    route.continue_()
                    return
                parsed = urlsplit(url)
                if parsed.hostname in {"rlzhao.com", "www.rlzhao.com"}:
                    file = ROOT / unquote(parsed.path).lstrip("/")
                    if file.is_file():
                        route.fulfill(path=file, content_type=guess_type(file.name)[0] or "application/octet-stream")
                        return
                route.abort()

            page.route("**/*", route_request)

            def visit(path):
                page.goto(base + path, wait_until="networkidle")
                assert page.locator("html").get_attribute("lang") == "zh-CN", path
                assert page.locator("h1").count() >= 1, path

            visit("/index.html")
            assert page.title() == "赵荣力｜个人主页"
            assert page.locator('link[rel="canonical"]').get_attribute("href") == "https://www.rlzhao.com/"
            assert page.locator('link[type="application/rss+xml"]').get_attribute("href") == "https://www.rlzhao.com/feed.xml"
            for filename in ("2004.png", "2013.png"):
                photo = page.locator(f'ul.tl img[src="/assets/images/tl/{filename}"]')
                photo.scroll_into_view_if_needed()
                photo.evaluate("img => img.decode()")
                ratio_error = photo.evaluate("""img => {
                    const style = getComputedStyle(img);
                    return Math.abs(parseFloat(style.width) / parseFloat(style.height) - img.naturalWidth / img.naturalHeight);
                }""")
                assert ratio_error < 0.01, f"timeline image distorted: {filename}"
            feed = ElementTree.parse(ROOT / "feed.xml")
            items = feed.findall("./channel/item")
            assert len(items) >= 7
            assert all(item.findtext("link").startswith("https://www.rlzhao.com/") for item in items)
            visit("/articles.html")
            assert page.locator(".blog-box").count() >= 7
            page.locator(".blog-box a:has(img)").first.click()
            page.wait_for_url("**/media/pages/articles/20230503/ms.html")
            assert "Materials Studio" in page.title()
            visit("/media/pages/articles/20230207/qinghai1.html")
            article_image = page.locator("img[data-lightbox]").first
            article_image.focus()
            page.keyboard.press("Enter")
            assert page.locator("dialog.image-lightbox[open]").count() == 1
            page.keyboard.press("Escape")
            assert article_image.evaluate("img => document.activeElement === img")
            print("PASS: homepage and article navigation")

            visit("/work.html")
            assert page.locator(".stream-lr").count() >= 3
            year = page.locator('.life-years a', has_text="2023").first
            year.click()
            page.wait_for_url("**/media/pages/work/work/work7.html#life-year-2023")
            assert page.locator("#life-year-2023").count() == 1
            visit("/work.html")
            page.locator('.stream-lr a[href="/life/2025-05-10-matching-outfits/"]').click()
            page.wait_for_url("**/life/2025-05-10-matching-outfits/")
            assert "情侣装匹配成功" in page.title()
            visit("/work.html")
            thumbnail = page.locator('.stream-lr').filter(
                has=page.locator('a[href="/life/2025-05-10-matching-outfits/"]')
            ).locator("img[data-lightbox]").first
            thumbnail.focus()
            page.keyboard.press("Enter")
            assert page.locator("dialog.image-lightbox[open]").count() == 1
            assert page.locator("dialog.image-lightbox img").get_attribute("alt") == thumbnail.get_attribute("alt")
            page.keyboard.press("Escape")
            assert page.locator("dialog.image-lightbox[open]").count() == 0
            assert thumbnail.evaluate("img => document.activeElement === img")
            visit("/media/pages/work/work/work1.html")
            assert page.locator("img[data-lightbox]").count() > 0
            print("PASS: life-record image preview")

            mobile = browser.new_page(viewport={"width": 375, "height": 812})
            mobile.route("**/*", route_request)
            for article in (
                "/media/pages/articles/20210920/qingyanguzhen.html",
                "/media/pages/articles/20220430/qianlingshan.html",
                "/media/pages/articles/20220810/buildblog.html",
                "/media/pages/articles/20230207/qinghai1.html",
            ):
                mobile.goto(base + article, wait_until="networkidle")
                width = mobile.evaluate("document.documentElement.scrollWidth")
                assert width <= 375, f"mobile overflow on {article}: {width}px"
            mobile.close()
            print("PASS: article images fit mobile screens")

            visit("/media/pages/tools/CCT.html")
            page.locator("#a").fill("0.3127")
            page.locator("#b").fill("0.3290")
            # D65 is about 6504 K; McCamy's approximation gives about 6507 K.
            check_close(page.locator("#z").input_value(), 6504, 20, "D65 CCT")
            page.locator("#b").fill("0.186")
            assert page.locator("#z").input_value() == ""
            assert page.locator("#calculation-error").inner_text()
            print("PASS: correlated colour temperature sample and invalid input")

            visit("/media/pages/tools/jingtichangqiang.html")
            # Published Mn4+ example: T2=20876, T1=28571, 2E=14124 cm^-1.
            page.locator("#a").fill(str(1e7 / 20876))
            page.locator("#b").fill(str(1e7 / 28571))
            page.locator("#c").fill(str(1e7 / 14124))
            check_close(page.locator("#d").input_value(), 2088, 1, "Dq")
            check_close(page.locator("#B").input_value(), 746, 10, "Racah B")
            check_close(page.locator("#C").input_value(), 2856, 20, "Racah C")
            check_close(page.locator("#E1").input_value(), 0.924, 0.01, "Mn4+ beta")
            page.locator("#b").fill("600")
            assert page.locator("#d").input_value() == ""
            assert page.locator("#calculation-error").inner_text()
            print("PASS: crystal-field literature sample and invalid input")

            assert not errors, "JavaScript errors: " + "; ".join(errors)
            browser.close()
        return 0
    finally:
        server.shutdown()


if __name__ == "__main__":
    raise SystemExit(main())
