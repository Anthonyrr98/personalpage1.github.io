"""Exercise the main pages and published calculator examples in Chromium."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from mimetypes import guess_type
from pathlib import Path
from threading import Thread
from urllib.parse import unquote, urljoin, urlsplit
from xml.etree import ElementTree
import sys

from playwright.sync_api import sync_playwright


ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def check_close(actual, expected, tolerance, label):
    assert abs(float(actual) - expected) <= tolerance, f"{label}: {actual} differs from {expected}"


def check_lightbox(page, photo):
    original = photo.get_attribute("data-lightbox-src") or photo.get_attribute("src")
    description = photo.get_attribute("alt")
    photo.focus()
    page.keyboard.press("Enter")
    preview = page.locator("dialog.image-lightbox[open]")
    assert preview.count() == 1
    assert preview.locator("img").get_attribute("src") == original
    assert preview.locator("img").get_attribute("alt") == description
    page.keyboard.press("Escape")
    assert page.locator("dialog.image-lightbox[open]").count() == 0
    assert photo.evaluate("img => document.activeElement === img")


def check_content_navigation(page, base):
    """Check the content currently visible, including short or empty life lists."""
    response = page.request.get(base + "/feed.xml")
    assert response.ok, "article RSS feed is missing"
    items = ElementTree.fromstring(response.text()).findall("./channel/item")
    feed_links = [item.findtext("link") for item in items]
    assert all(link.startswith("https://www.rlzhao.com/") for link in feed_links)
    page.goto(base + "/articles.html", wait_until="networkidle")
    cards = page.locator(".article-card")
    assert cards.count() > 0, "article list unexpectedly empty"
    assert cards.count() == len(feed_links), "article list and RSS feed disagree"
    article_dates = cards.locator("time").evaluate_all(
        "items => items.map(item => item.getAttribute('datetime'))")
    assert len(article_dates) == cards.count()
    assert article_dates == sorted(article_dates, reverse=True), article_dates
    article_links = cards.locator(".article-card-image")
    urls = article_links.evaluate_all("links => links.map(link => link.getAttribute('href'))")
    assert {urljoin("https://www.rlzhao.com", url) for url in urls} == set(feed_links)
    target = urljoin(base, article_links.first.get_attribute("href"))
    article_links.first.click()
    page.wait_for_url(target)
    assert page.locator("h1").count() >= 1
    assert page.title(), "article destination has no page title"

    page.goto(base + "/work.html", wait_until="networkidle")
    entries = page.locator(".stream-lr")
    dates = entries.locator("time.streamitem-date").evaluate_all(
        "items => items.map(item => item.getAttribute('datetime'))")
    assert len(dates) == entries.count() <= 10, dates
    assert dates == sorted(dates), f"life entries are not oldest first: {dates}"
    years = page.locator(".life-years").first.locator("a")
    year_labels = [int(label) for label in years.all_text_contents()]
    assert year_labels == sorted(set(year_labels), reverse=True), year_labels
    if years.count():
        href = years.first.get_attribute("href")
        fragment = urlsplit(href).fragment
        assert fragment == f"life-year-{year_labels[0]}", href
        years.first.click()
        page.wait_for_url(urljoin(base, href))
        assert page.locator(f"#{fragment}").count() == 1, href

    page.goto(base + "/work.html", wait_until="networkidle")
    links = page.locator(".stream-lr .streamitem-title a")
    if entries.count():
        assert links.count() == entries.count()
        title = links.first.inner_text()
        target = urljoin(base, links.first.get_attribute("href"))
        links.first.click()
        page.wait_for_url(target)
        assert page.locator("h1").inner_text() == title
        page.goto(base + "/work.html", wait_until="networkidle")
        photos = page.locator(".stream-lr img[data-lightbox]")
        if photos.count():
            check_lightbox(page, photos.first)
    print("PASS: current article, life-entry and year navigation")


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
                original = f'/assets/images/tl/{filename}'
                photo = page.locator(f'ul.tl img[data-original-src="{original}"], ul.tl img[src="{original}"]')
                photo.scroll_into_view_if_needed()
                photo.evaluate("img => img.decode()")
                ratio_error = photo.evaluate("""img => {
                    const style = getComputedStyle(img);
                    return Math.abs(parseFloat(style.width) / parseFloat(style.height) - img.naturalWidth / img.naturalHeight);
                }""")
                assert ratio_error < 0.01, f"timeline image distorted: {filename}"
            check_content_navigation(page, base)
            visit("/media/pages/articles/20230207/qinghai1.html")
            article_image = page.locator("img[data-lightbox]").first
            check_lightbox(page, article_image)
            print("PASS: homepage and article navigation")

            visit("/media/pages/work/work/work1.html")
            assert page.locator("img[data-lightbox]").count() > 0
            check_lightbox(page, page.locator("img[data-lightbox]").first)
            print("PASS: life-record image preview")

            for path in (
                "/tools.html",
                "/media/pages/tools/CCT.html",
                "/media/pages/tools/jingtichangqiang.html",
                "/media/pages/articles/20230503/ms.html",
                "/media/pages/articles/20230429/vaspintro.html",
            ):
                visit(path)
                if path.endswith("/ms.html"):
                    assert "Materials Studio" in page.title()
                assert page.locator("main").count() == 1, f"missing or nested main on {path}"
                footer = page.locator(".footer")
                assert footer.evaluate("footer => !footer.closest('main, article, i')"), path
                nesting = footer.evaluate("""footer => {
                    let count = 0;
                    for (let node = footer.parentElement; node; node = node.parentElement) {
                        if (node.classList.contains('main-content')) count++;
                    }
                    return count;
                }""")
                assert nesting == 1, f"nested footer container on {path}"
                assert footer.evaluate("footer => getComputedStyle(footer).fontStyle") == "normal", path
                if page.locator("pre code").count():
                    assert page.locator("pre code").first.evaluate(
                        "code => getComputedStyle(code).whiteSpace") in {"pre", "pre-wrap"}, path
            print("PASS: tool and tutorial HTML structure, footer and code whitespace")

            mobile = browser.new_page(viewport={"width": 375, "height": 812})
            mobile.on("pageerror", lambda error: errors.append("mobile: " + str(error)))
            mobile.route("**/*", route_request)
            for viewport_width in (320, 375, 414):
                mobile.set_viewport_size({"width": viewport_width, "height": 812})
                mobile.goto(base + "/index.html", wait_until="networkidle")
                links = mobile.locator("nav .menu-item-link").evaluate_all("""links => links.map(link => {
                    const rect = link.getBoundingClientRect();
                    return {left: rect.left, right: rect.right, top: Math.round(rect.top), height: rect.height};
                })""")
                assert len(links) == 6 and all(link["height"] >= 44 for link in links), links
                assert len({link["top"] for link in links}) == 2, links
                assert all(0 <= link["left"] and link["right"] <= viewport_width for link in links), links
                assert mobile.locator(".tl-text-item").first.evaluate(
                    "item => parseFloat(getComputedStyle(item).fontSize)") >= 14
            mobile.set_viewport_size({"width": 375, "height": 812})
            for path in ("/index.html", "/tools.html", "/work.html",
                         "/media/pages/tools/CCT.html", "/media/pages/tools/jingtichangqiang.html"):
                mobile.goto(base + path, wait_until="networkidle")
                assert mobile.evaluate("document.documentElement.scrollWidth") <= 375, path
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
            print("PASS: mobile navigation, timeline text and key pages fit small screens")

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
