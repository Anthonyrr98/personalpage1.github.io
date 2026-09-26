"""Manage entries embedded in the original paginated life pages without changing their URLs."""

from hashlib import sha256
from html import unescape
import os
from pathlib import Path
import re
import secrets

from scripts.new_life import ROOT


ENTRY_ID = re.compile(r"legacy-work(1[0-5]|[1-9])-(\d{1,2})\Z")
START = re.compile(r'<div\s+class="stream-lr"\s*>', re.I)
DIV = re.compile(r"<div\b[^>]*>|</div\s*>", re.I)
TITLE = re.compile(r'(<h3\s+class="streamitem-title"[^>]*>)(.*?)(</h3>)', re.I | re.S)
DATE = re.compile(r'(<span\s+class="streamitem-date"[^>]*>)(.*?</a>\s*)(</span>)', re.I | re.S)
IMAGE = re.compile(r'<img\b', re.I)
HIDE_OPEN = "{# life-editor:hidden #}{% if false %}"
HIDE_CLOSE = "{% endif %}{# life-editor:end #}"


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
    date = DATE.search(html)
    date_text = re.sub(r"<[^>]+>", "", date.group(2)) if date else ""
    date_text = re.sub(r"\s+", "", unescape(date_text))
    year = re.search(r"(20\d{2})年", date_text)
    month = re.search(r"(\d{1,2})月", date_text)
    day = re.search(r"(\d{1,2})(?:日|号)", date_text)
    day_value = f"{year.group(1)}-{int(month.group(1)):02}-{int(day.group(1)):02}" if year and month and day else date_text
    prefix = text[:start]
    suffix = text[end:]
    hidden = prefix.endswith(HIDE_OPEN) and suffix.startswith(HIDE_CLOSE)
    return {
        "id": entry_id, "kind": "legacy", "version": sha256(text.encode("utf-8")).hexdigest(),
        "title": unescape(re.sub(r"<[^>]+>", "", title.group(2))).strip(),
        "date": day_value, "html": html.replace("\r\n", "\n"), "hidden": hidden,
        "photos": len(IMAGE.findall(html)), "excerpt": "旧版记录 · HTML 内容",
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
