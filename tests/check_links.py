"""Check local links and resources in the static site without network access."""

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import posixpath
import sys


ROOT = Path(__file__).resolve().parents[1]
SITE_HOSTS = {"rlzhao.com", "www.rlzhao.com"}


class References(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.links = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"])
        if tag == "a" and values.get("name"):
            self.ids.add(values["name"])
        for attribute in ("href", "src", "poster"):
            if values.get(attribute):
                self.links.append((self.getpos()[0], attribute, values[attribute]))
        if values.get("srcset"):
            for candidate in values["srcset"].split(","):
                url = candidate.strip().split(" ", 1)[0]
                if url:
                    self.links.append((self.getpos()[0], "srcset", url))


def parse_page(path):
    parser = References()
    parser.feed(path.read_text(encoding="utf-8-sig"))
    return parser


def exact_file(path, directory_names):
    """Match every path component exactly, including on Windows."""
    try:
        parts = path.relative_to(ROOT).parts
    except ValueError:
        return False
    current = ROOT
    for part in parts:
        if current not in directory_names:
            directory_names[current] = {entry.name for entry in current.iterdir()} if current.is_dir() else set()
        if part not in directory_names[current]:
            return False
        current /= part
    return current.is_file()


def local_target(page, url):
    parsed = urlsplit(url)
    if parsed.scheme and parsed.scheme not in {"http", "https"}:
        return None
    if parsed.netloc and parsed.hostname not in SITE_HOSTS:
        return None
    if not parsed.path and not parsed.fragment and not parsed.netloc:
        return None

    if not parsed.path and not parsed.netloc:
        route = "/" + page.relative_to(ROOT).as_posix()
    elif parsed.netloc or parsed.path.startswith("/"):
        route = parsed.path or "/"
    else:
        route = "/" + posixpath.join(page.parent.relative_to(ROOT).as_posix(), parsed.path)

    route = posixpath.normpath(unquote(route))
    if not route.startswith("/") or route.startswith("//"):
        raise ValueError("path escapes the site root")
    if route == "/":
        route = "/index.html"
    target = ROOT / route.lstrip("/")
    if not target.is_file() and not target.suffix:
        target = target.with_suffix(".html")
    return target, unquote(parsed.fragment)


def main():
    pages = sorted(ROOT.rglob("*.html"))
    parsed_pages = {path: parse_page(path) for path in pages}
    directory_names = {}
    errors = []
    checked = 0
    for page, parsed in parsed_pages.items():
        for line, attribute, url in parsed.links:
            try:
                result = local_target(page, url)
            except ValueError as exc:
                errors.append(f"{page.relative_to(ROOT)}:{line}: {attribute}={url!r}: {exc}")
                continue
            if result is None:
                continue
            checked += 1
            target, fragment = result
            if not exact_file(target, directory_names):
                errors.append(f"{page.relative_to(ROOT)}:{line}: missing target {url!r}")
            elif fragment and target.suffix.lower() == ".html":
                destination = parsed_pages.get(target)
                if destination is None or fragment not in destination.ids:
                    errors.append(f"{page.relative_to(ROOT)}:{line}: missing anchor {url!r}")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"FAIL: {len(errors)} broken references", file=sys.stderr)
        return 1
    print(f"PASS: {checked} local references across {len(pages)} HTML pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
