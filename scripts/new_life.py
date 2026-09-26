"""Create one life entry from a TOML draft and copy any local photos."""

import argparse
from datetime import date, datetime
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sys
import tomllib
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
DRAFT = ROOT / "drafts" / "life.toml"
EXAMPLE = ROOT / "drafts" / "life.example.toml"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
MAX_IMAGE_BYTES = 20 * 1024 * 1024


def required_text(data, key):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} 必须填写文字")
    return value.strip()


def yaml_string(value):
    return json.dumps(value, ensure_ascii=False)


def prepare_data(data, photo_base, existing_name=None, extra_frontmatter=()):
    title = required_text(data, "title")
    day = required_text(data, "date")
    try:
        parsed_day = date.fromisoformat(day)
    except ValueError as error:
        raise ValueError("date 应为 YYYY-MM-DD 格式的真实日期") from error
    if parsed_day.isoformat() != day:
        raise ValueError("date 应为 YYYY-MM-DD 格式")

    slug = data.get("slug", "")
    if not isinstance(slug, str):
        raise ValueError("slug 必须是文字或留空")
    slug = slug.strip() or f"{datetime.now():%H%M%S}-{secrets.token_hex(2)}"
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("slug 只能使用小写英文字母、数字和中间的连字符")
    name = existing_name or f"{day}-{slug}"
    output = ROOT / "src" / "life" / f"{name}.md"
    if output.exists() and not existing_name:
        raise ValueError(f"记录已存在，不会覆盖：{output}")
    if existing_name and (not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+", existing_name)
                          or not output.is_file()):
        raise ValueError("要修改的记录不存在")

    description = data.get("description", "")
    body = data.get("body", "")
    if not isinstance(description, str) or not isinstance(body, str):
        raise ValueError("description 和 body 必须是文字")
    description = description.strip() or f"{title}的生活记录。"
    body = body.strip()

    raw_photos = data.get("photos", [])
    if not isinstance(raw_photos, list):
        raise ValueError("photos 应为 [[photos]] 列表")

    photos = []
    copies = []
    reserved = set()
    for number, photo in enumerate(raw_photos, start=1):
        if not isinstance(photo, dict):
            raise ValueError(f"第 {number} 张照片格式不正确")
        source = required_text(photo, "source")
        alt = photo.get("alt", "")
        if not isinstance(alt, str):
            raise ValueError(f"第 {number} 张照片的 alt 必须是文字")
        alt = alt.strip() or f"{title}（第{number}张）"

        if source.startswith("/assets/images/life/"):
            filename = source.removeprefix("/assets/images/life/")
            local_image = ROOT / "assets" / "images" / "life" / filename
            if Path(filename).name != filename or not local_image.is_file():
                raise ValueError(f"第 {number} 张已发布照片不存在")
            published_source = source
        elif source.startswith(("http://", "https://")):
            url = urlsplit(source)
            if url.scheme != "https" or not url.netloc:
                raise ValueError(f"第 {number} 张照片请使用 HTTPS 直链")
            published_source = source
        else:
            if "://" in source:
                raise ValueError(f"第 {number} 张照片的链接格式不支持")
            local = Path(source).expanduser()
            if not local.is_absolute():
                local = photo_base / local
            local = local.resolve()
            if not local.is_file():
                raise ValueError(f"找不到第 {number} 张本地照片：{local}")
            extension = local.suffix.lower()
            if extension not in IMAGE_EXTENSIONS:
                raise ValueError(f"第 {number} 张照片只支持 JPG、PNG、WebP、GIF 或 AVIF")
            if local.stat().st_size > MAX_IMAGE_BYTES:
                raise ValueError(f"第 {number} 张照片超过 20 MB，请压缩或改用 OSS 直链")
            photo_number = number
            destination = ROOT / "assets" / "images" / "life" / f"{name}-{photo_number:02}{extension}"
            while destination.exists() or destination in reserved:
                photo_number += 1
                destination = ROOT / "assets" / "images" / "life" / f"{name}-{photo_number:02}{extension}"
            reserved.add(destination)
            copies.append((local, destination))
            published_source = f"/assets/images/life/{destination.name}"
        photos.append((published_source, alt))

    hidden = data.get("hidden", False)
    if not isinstance(hidden, bool):
        raise ValueError("hidden 必须是布尔值")
    lines = [
        "---",
        "layout: layouts/life.njk",
        "permalink: false" if hidden else f"permalink: /life/{name}/",
        f"title: {yaml_string(title)}",
        f"description: {yaml_string(description)}",
        f"date: {day}",
        "tags: []" if hidden else "tags: [life]",
    ]
    if hidden:
        lines.append("hidden: true")
    lines.extend(extra_frontmatter)
    if photos:
        lines.append("photos:")
        for source, alt in photos:
            lines.extend((f"  - src: {yaml_string(source)}", f"    alt: {yaml_string(alt)}"))
    lines.extend(("---", "", body, ""))
    return output, copies, "\n".join(lines), f"/life/{name}/"


def write_entry(data, photo_base, existing_name=None, extra_frontmatter=()):
    output, copies, markdown, url = prepare_data(data, photo_base, existing_name, extra_frontmatter)
    created = []
    try:
        for source, destination in copies:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with source.open("rb") as original, destination.open("xb") as target:
                created.append(destination)
                shutil.copyfileobj(original, target)
        output.parent.mkdir(parents=True, exist_ok=True)
        if existing_name:
            temporary = output.with_name(f".{output.name}.{secrets.token_hex(4)}.tmp")
            try:
                temporary.write_text(markdown, encoding="utf-8", newline="\n")
                os.replace(temporary, output)
            finally:
                temporary.unlink(missing_ok=True)
        else:
            with output.open("x", encoding="utf-8", newline="\n") as file:
                created.append(output)
                file.write(markdown)
    except Exception:
        for path in reversed(created):
            path.unlink(missing_ok=True)
        raise

    return output, [destination for _, destination in copies], url


def create(draft_path):
    with draft_path.open("rb") as file:
        data = tomllib.load(file)
    output, images, url = write_entry(data, draft_path.parent)

    print(f"已生成：{output.relative_to(ROOT)}")
    for destination in images:
        print(f"已复制照片：{destination.relative_to(ROOT)}")
    print(f"发布后地址：{url}")
    print("检查生成内容后，提交并推送到 main，GitHub Actions 会自动发布。")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("draft", nargs="?", type=Path, default=DRAFT, help="TOML 模板路径")
    parser.add_argument("--init", action="store_true", help="创建可编辑的 drafts/life.toml")
    args = parser.parse_args()
    try:
        if args.init:
            DRAFT.parent.mkdir(parents=True, exist_ok=True)
            with EXAMPLE.open("rb") as source, DRAFT.open("xb") as target:
                shutil.copyfileobj(source, target)
            print(f"已创建模板：{DRAFT.relative_to(ROOT)}")
            return 0
        draft = args.draft.expanduser().resolve()
        if not draft.is_file():
            raise ValueError(f"找不到模板：{draft}；首次使用请运行 npm run life:init")
        create(draft)
        return 0
    except (FileExistsError, OSError, ValueError, tomllib.TOMLDecodeError) as error:
        print(f"未生成记录：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
