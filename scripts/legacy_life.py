"""Manage entries embedded in the original paginated life pages without changing their URLs."""

from datetime import date
from hashlib import sha256
from html import unescape
from html.parser import HTMLParser
import os
from pathlib import Path
import re
import secrets

from scripts.new_life import ROOT


ENTRY_ID = re.compile(r"legacy-work(1[0-5]|[1-9])-(\d{1,2})\Z")
START = re.compile(r'<div\s+class="stream-lr"\s*>', re.I)
DIV = re.compile(r"<div\b[^>]*>|</div\s*>", re.I)
TITLE = re.compile(r'(<h3\s+class="streamitem-title"[^>]*>)(.*?)(</h3>)', re.I | re.S)
DESCRIPTION = re.compile(r'<p\s+class="life-editor-description"[^>]*>(.*?)</p>', re.I | re.S)
DATE = re.compile(r'(<span\s+class="streamitem-date"[^>]*>)(.*?</a>\s*)(</span>)', re.I | re.S)
IMAGE = re.compile(r'<img\b', re.I)
HIDE_OPEN = "{# life-editor:hidden #}{% if false %}"
HIDE_CLOSE = "{% endif %}{# life-editor:end #}"


class DateTextParser(HTMLParser):
    """Read the outer date span, including its nested ordinal and link."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == "span":
            if self.depth or "streamitem-date" in (dict(attrs).get("class") or "").split():
                self.depth += 1

    def handle_endtag(self, tag):
        if tag == "span" and self.depth:
            self.depth -= 1

    def handle_data(self, value):
        if self.depth:
            self.parts.append(value)


def date_text(html):
    parser = DateTextParser()
    parser.feed(html)
    return re.sub(r"\s+", "", "".join(parser.parts))


def validate_changed_date(original, updated):
    before, after = date_text(original), date_text(updated)
    # Keep incomplete historical dates when editing unrelated content. Advanced
    # HTML editing can also deliberately remove the date altogether.
    if after == before or not after:
        return
    match = re.fullmatch(r"(\d{4})年(\d{1,2})月(\d{1,2})[日号]", after)
    try:
        if not match:
            raise ValueError
        date(*(int(part) for part in match.groups()))
    except ValueError as error:
        raise ValueError("修改后的日期必须是真实的年月日；不确定时请保留原日期") from error


def page_path(number):
    return ROOT / "src" / "legacy" / "work" / f"work{number}.njk"


def spans(text):
    result = []
    for start in START.finditer(text):
        depth = 0
        end = None
        for token in DIV.finditer(text, start.start()):
            depth += -1 if token.group().lower().startswith("</") else 1
            if depth == 0:
                end = token.end()
                break
        if end is None:
            raise ValueError("旧版生活页的 HTML 结构不完整")
        result.append((start.start(), end))
    return result


def parse(entry_id):
    match = ENTRY_ID.fullmatch(entry_id) if isinstance(entry_id, str) else None
    if not match:
        raise ValueError("记录编号不正确")
    number, index = map(int, match.groups())
    path = page_path(number)
    text = path.read_bytes().decode("utf-8")
    items = spans(text)
    if index < 1 or index > len(items):
        raise ValueError("找不到这条记录")
    start, end = items[index - 1]
    html = text[start:end]
    title = TITLE.search(html)
    if not title:
        raise ValueError("旧记录缺少标题")
    stamp = date_text(html)
    year = re.search(r"(\d{4})年", stamp)
    month = re.search(r"(\d{1,2})月", stamp)
    day = re.search(r"(\d{1,2})(?:日|号)", stamp)
    day_value = f"{year.group(1)}-{int(month.group(1)):02}-{int(day.group(1)):02}" if year and month and day else stamp
    prefix = text[:start]
    suffix = text[end:]
    hidden = prefix.endswith(HIDE_OPEN) and suffix.startswith(HIDE_CLOSE)
    description = DESCRIPTION.search(html)
    description_text = unescape(re.sub(r"<[^>]+>", "", description.group(1))).strip() if description else ""
    photo_count = len(IMAGE.findall(html))
    return {
        "id": entry_id, "kind": "legacy", "version": sha256(text.encode("utf-8")).hexdigest(),
        "title": unescape(re.sub(r"<[^>]+>", "", title.group(2))).strip(),
        "date": day_value, "html": html.replace("\r\n", "\n"), "hidden": hidden,
        "photos": photo_count, "excerpt": description_text or f"旧版分页 · {photo_count} 张照片",
        "url": f"/media/pages/work/work/work{number}.html", "_path": path,
        "_text": text, "_start": start, "_end": end,
    }


def public(entry):
    return {key: value for key, value in entry.items() if not key.startswith("_")}


def list_entries():
    records = []
    for number in range(1, 16):
        path = page_path(number)
        if not path.is_file():
            continue
        count = len(spans(path.read_bytes().decode("utf-8")))
        for index in range(1, count + 1):
            records.append(public(parse(f"legacy-work{number}-{index}")))
    return sorted(records, key=lambda item: (item["date"], item["id"]), reverse=True)


def change(entry_id, version, action, html=None):
    entry = parse(entry_id)
    if entry["version"] != version:
        raise ValueError("这条记录已被修改，请重新打开")
    text, start, end = entry["_text"], entry["_start"], entry["_end"]
    if action == "visibility":
        if entry["hidden"]:
            updated = text[:start - len(HIDE_OPEN)] + text[start:end] + text[end + len(HIDE_CLOSE):]
        else:
            updated = text[:start] + HIDE_OPEN + text[start:end] + HIDE_CLOSE + text[end:]
    elif action == "delete":
        if entry["hidden"]:
            start -= len(HIDE_OPEN)
            end += len(HIDE_CLOSE)
        updated = text[:start] + text[end:]
    elif action == "save":
        if not isinstance(html, str) or len(html) > 500_000 or not START.match(html.strip()):
            raise ValueError("旧记录 HTML 必须从 <div class=\"stream-lr\"> 开始")
        html = html.strip().replace("\n", "\r\n" if "\r\n" in text else "\n")
        if len(spans(html)) != 1 or spans(html)[0] != (0, len(html)):
            raise ValueError("旧记录 HTML 必须只包含一个完整的 stream-lr 区块")
        validate_changed_date(entry["html"], html)
        updated = text[:start] + html + text[end:]
    else:
        raise ValueError("未知操作")
    if updated == text:
        return entry["_path"], False
    temporary = entry["_path"].with_name(f".{entry['_path'].name}.{secrets.token_hex(4)}.tmp")
    try:
        temporary.write_bytes(updated.encode("utf-8"))
        os.replace(temporary, entry["_path"])
    finally:
        temporary.unlink(missing_ok=True)
    return entry["_path"], True
