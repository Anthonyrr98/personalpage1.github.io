"""Read the small front-matter format used by life entries for the local editor."""

from hashlib import sha256
import json
from pathlib import Path
import re

from scripts.new_life import ROOT


ENTRY_ID = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+\Z")
FIELD = re.compile(r"^([A-Za-z][A-Za-z0-9_]*):(?:\s*(.*))?$", re.MULTILINE)
MANAGED = {"layout", "permalink", "title", "description", "date", "tags", "hidden", "photos"}


def entry_path(entry_id):
    if not isinstance(entry_id, str) or not ENTRY_ID.fullmatch(entry_id):
        raise ValueError("记录编号不正确")
    path = ROOT / "src" / "life" / f"{entry_id}.md"
    if not path.is_file():
        raise ValueError("找不到这条记录")
    return path


def scalar(value):
    value = value.strip()
    if value.startswith('"'):
        return json.loads(value)
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    return value


def read_entry(entry_id):
    path = entry_path(entry_id)
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig").replace("\r\n", "\n")
    if not text.startswith("---\n") or "\n---" not in text[4:]:
        raise ValueError(f"记录格式不正确：{path.name}")
    header, _, body = text[4:].partition("\n---")
    if body and not body.startswith("\n"):
        raise ValueError(f"记录格式不正确：{path.name}")
    body = body.removeprefix("\n")
    matches = list(FIELD.finditer(header))
    blocks = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(header)
        blocks[match.group(1)] = header[match.start():end].rstrip("\n")
    def value(key, default=""):
        block = blocks.get(key)
        return scalar(block.split("\n", 1)[0].partition(":")[2]) if block else default

    photos = []
    if "photos" in blocks:
        photo = None
        for line in blocks["photos"].splitlines()[1:]:
            source = re.fullmatch(r"\s{2}- src:\s*(.*)", line)
            alt = re.fullmatch(r"\s{4}alt:\s*(.*)", line)
            if source:
                photo = {"source": scalar(source.group(1)), "alt": ""}
                photos.append(photo)
            elif alt and photo is not None:
                photo["alt"] = scalar(alt.group(1))
            elif line.strip():
                raise ValueError(f"暂不支持编辑这条记录的照片格式：{path.name}")

    hidden = value("hidden") == "true"
    extra = [block for key, block in blocks.items() if key not in MANAGED]
    return {
        "id": entry_id, "version": sha256(raw).hexdigest(),
        "title": value("title"), "date": value("date"),
        "description": value("description"), "body": body.strip(),
        "photos": photos, "hidden": hidden,
        "url": f"/life/{entry_id}/", "extra": extra,
    }


def list_entries():
    directory = ROOT / "src" / "life"
    entries = []
    for path in directory.glob("*.md"):
        if not ENTRY_ID.fullmatch(path.stem):
            continue
        entry = read_entry(path.stem)
        entries.append({key: entry[key] for key in ("id", "version", "title", "date", "hidden", "url")}
                       | {"photos": len(entry["photos"]), "excerpt": entry["body"][:100]})
    return sorted(entries, key=lambda entry: (entry["date"], entry["id"]), reverse=True)
