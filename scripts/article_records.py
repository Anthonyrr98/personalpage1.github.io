"""Read and update existing article pages without rewriting their custom markup."""

from datetime import date
import hashlib
import json
from pathlib import Path
import re

from scripts.new_life import ROOT


ARTICLE_ID = re.compile(r"\d{8}/[A-Za-z0-9_-]+")
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
FIELDS = ("title", "cardTitle", "description", "summary", "category", "date", "cover")
FRONT = re.compile(r"\A---\r?\n(?P<front>.*?)\r?\n---\r?\n(?P<body>.*)\Z", re.S)


def article_path(article_id):
    if not isinstance(article_id, str) or not ARTICLE_ID.fullmatch(article_id):
        raise ValueError("文章编号不正确")
    base = ROOT / "src" / "articles" / article_id
    for extension in (".njk", ".md"):
        path = base.with_suffix(extension)
        if path.is_file():
            return path
    raise ValueError("找不到这篇文章")


def parse(article_id):
    path = article_path(article_id)
    source = path.read_text(encoding="utf-8")
    match = FRONT.fullmatch(source)
    if not match:
        raise ValueError("文章缺少可识别的页面元数据")
    lines = match["front"].splitlines()
    data = {}
    for key in FIELDS:
        line = next((line for line in lines if line.startswith(key + ":")), None)
        if line is None:
            raise ValueError(f"文章缺少 {key} 字段")
        value = line.partition(":")[2].strip()
        try:
            data[key] = json.loads(value)
        except json.JSONDecodeError:
            data[key] = value.strip("'\"")
    permalink = next((line.partition(":")[2].strip() for line in lines if line.startswith("permalink:")), "")
    try:
        url = json.loads(permalink)
    except json.JSONDecodeError:
        url = permalink.strip("'\"")
    return {"id": article_id, "version": hashlib.sha256(source.encode("utf-8")).hexdigest(),
            "body": match["body"], "url": url, "format": "markdown" if path.suffix == ".md" else "html", **data}


def list_articles():
    directory = ROOT / "src" / "articles"
    if not directory.exists():
        return []
    articles = []
    for path in list(directory.glob("*/*.njk")) + list(directory.glob("*/*.md")):
        article_id = f"{path.parent.name}/{path.stem}"
        article = parse(article_id)
        articles.append({key: article[key] for key in ("id", "version", "title", "cardTitle", "date", "category")})
    return sorted(articles, key=lambda article: (article["date"], article["id"]), reverse=True)


def save(article_id, version, data):
    current = parse(article_id)
    if version != current["version"]:
        raise ValueError("这篇文章已被其他操作修改，请重新打开后再编辑")
    if not isinstance(data, dict):
        raise ValueError("文章内容格式不正确")
    for key in FIELDS:
        value = data.get(key)
        if not isinstance(value, str) or len(value) > 1000 or (key in ("title", "cardTitle", "date") and not value.strip()):
            raise ValueError(f"{key} 内容不正确")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", data["date"]):
        raise ValueError("日期格式不正确")
    try:
        date.fromisoformat(data["date"])
    except ValueError as error:
        raise ValueError("日期格式不正确") from error
    body = data.get("body")
    if not isinstance(body, str) or not body.strip():
        raise ValueError("文章正文不能为空")
    path = article_path(article_id)
    source = path.read_text(encoding="utf-8")
    match = FRONT.fullmatch(source)
    front = match["front"]
    for key in FIELDS:
        encoded = json.dumps(data[key], ensure_ascii=False)
        front, count = re.subn(rf"(?m)^{re.escape(key)}:.*$", lambda _: f"{key}: {encoded}", front, count=1)
        if count != 1:
            raise ValueError(f"文章缺少 {key} 字段")
    if data["date"] != current["date"]:
        year, month, day = (int(part) for part in data["date"].split("-"))
        label = json.dumps(f"{year}年{month}月{day}日", ensure_ascii=False)
        front = re.sub(r"(?m)^dateLabel:.*$", lambda _: f"dateLabel: {label}", front, count=1)
    updated = f"---\n{front}\n---\n{body}"
    if updated != source:
        temporary = path.with_suffix(".tmp")
        temporary.write_text(updated, encoding="utf-8")
        temporary.replace(path)
    return path, updated != source, parse(article_id)


def create(data):
    if not isinstance(data, dict):
        raise ValueError("文章内容格式不正确")
    slug = data.get("slug")
    if not isinstance(slug, str) or not SLUG.fullmatch(slug) or len(slug) > 80:
        raise ValueError("网址名称只能使用小写英文字母、数字和中划线")
    for key in FIELDS:
        value = data.get(key)
        if not isinstance(value, str) or len(value) > 1000 or (key in ("title", "cardTitle", "description", "date") and not value.strip()):
            raise ValueError(f"{key} 内容不正确")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", data["date"]):
        raise ValueError("日期格式不正确")
    try:
        article_date = date.fromisoformat(data["date"])
    except ValueError as error:
        raise ValueError("日期格式不正确") from error
    body = data.get("body")
    if not isinstance(body, str) or not body.strip():
        raise ValueError("文章正文不能为空")
    article_id = f"{article_date:%Y%m%d}/{slug}"
    base = ROOT / "src" / "articles" / article_id
    if base.with_suffix(".njk").exists() or base.with_suffix(".md").exists():
        raise ValueError("该日期和网址名称已有文章，请换一个网址名称")
    url = f"/articles/{article_date.isoformat()}-{slug}/"
    label = f"{article_date.year}年{article_date.month}月{article_date.day}日"
    front = {
        "layout": "layouts/article.njk", "permalink": url, "title": data["title"],
        "description": data["description"], "activeNav": "articles", "isArticle": True,
        "tags": ["article"], "date": data["date"], "cardTitle": data["cardTitle"],
        "summary": data["summary"], "category": data["category"], "dateLabel": label,
        "cover": data["cover"],
    }
    lines = [f"{key}: {json.dumps(value, ensure_ascii=False)}" for key, value in front.items()]
    source = "---\n" + "\n".join(lines) + "\n---\n" + body.rstrip() + "\n"
    path = base.with_suffix(".md")
    path.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents a second click or concurrent request from replacing an article.
    with path.open("x", encoding="utf-8", newline="\n") as file:
        file.write(source)
    return path, parse(article_id)
