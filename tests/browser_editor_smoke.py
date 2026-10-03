"""Smoke-test the local life editor against temporary content only."""

import json
from datetime import datetime, timezone
from pathlib import Path
import runpy
import sys
from tempfile import TemporaryDirectory
from threading import Event, Thread
from unittest.mock import patch

from playwright.sync_api import sync_playwright
from playwright.sync_api import expect

project = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project))
from scripts import article_records, legacy_life, life_records, new_life


editor = runpy.run_path(str(project / "life_editor.pyw"), run_name="test")
server_globals = editor["start_server"].__globals__

def save_with_locked_form(page, handler, button, body, *, owner=None, loaded_body=None):
    """Hold a save/load response so typing during the request can be exercised."""
    original = getattr(owner, handler) if owner else server_globals[handler]
    started = Event()
    release = Event()

    def delayed(*args, **kwargs):
        started.set()
        if not release.wait(10):
            raise RuntimeError("Timed out waiting for the form-lock check")
        return original(*args, **kwargs)

    field = page.locator(body)
    snapshot = field.input_value()
    replacement = patch.object(owner, handler, delayed) if owner else patch.dict(server_globals, {handler: delayed})
    with replacement:
        try:
            page.locator(button).click()
            assert started.wait(5), "Save request did not reach the backend"
            expect(field).to_be_disabled()
            expect(page.locator("#view-life")).to_be_disabled()
            expect(page.locator("#view-articles")).to_be_disabled()
            expect(page.locator("#photo-input")).to_be_disabled()
            field.evaluate("field => field.focus()")
            page.keyboard.type("This input must not overwrite the saved draft")
            assert field.input_value() == snapshot
        finally:
            release.set()
        expect(field).to_be_enabled()
        expect(field).to_have_value(snapshot if loaded_body is None else loaded_body)
        expect(page.locator("#view-life")).to_be_enabled()


def check_quick_close_draft_and_local_date(browser, address, root):
    """Keep the final input even when no autosave or unload request can complete."""
    context = browser.new_context(timezone_id="Asia/Shanghai")
    try:
        context.route("**/api/draft", lambda route: route.abort() if route.request.method == "POST" else route.continue_())
        page = context.new_page()
        page.goto(address)
        page.wait_for_load_state("networkidle")
        # Chromium can dispatch a beacon after the originating page has closed,
        # bypassing that page's request routing. Reject its backend write too.
        def unavailable(_):
            raise ValueError("Draft storage temporarily unavailable")

        with patch.dict(server_globals, {"save_draft": unavailable}):
            page.locator("#title").fill("Quick close draft")
            page.locator("#body").fill("Keep the very last input")
            # No 550 ms debounce wait: exercise the original loss window directly.
            page.close()
            page = context.new_page()
            page.clock.install(time=datetime(2026, 10, 2, 16, 30, tzinfo=timezone.utc))
            page.goto(address)
            page.wait_for_load_state("networkidle")
            expect(page.locator("#title")).to_have_value("Quick close draft")
            expect(page.locator("#body")).to_have_value("Keep the very last input")
            assert page.evaluate("JSON.parse(localStorage.getItem('rlzhao-life-draft')).body") == "Keep the very last input"
        context.unroute("**/api/draft")
        page.locator("#generate").click()
        expect(page.locator("#title")).to_have_value("")
        # UTC is still October 2; in Shanghai the fresh draft must be October 3.
        expect(page.locator("#date")).to_have_value("2026-10-03")
        assert page.evaluate("localStorage.getItem('rlzhao-life-draft')") is None
        assert any("Keep the very last input" in entry.read_text(encoding="utf-8")
                   for entry in (root / "src/life").glob("*.md"))
    finally:
        context.close()


def check_unload_beacon_to_new_editor(browser, address):
    """A fresh server port can recover the unload snapshot from the draft file."""
    context = browser.new_context()
    received = Event()
    original = server_globals["save_draft"]

    def tracked(data):
        result = original(data)
        if data.get("body") == "Beacon preserves the final input":
            received.set()
        return result

    second_server = None
    try:
        page = context.new_page()
        page.goto(address)
        page.wait_for_load_state("networkidle")
        with patch.dict(server_globals, {"save_draft": tracked}):
            page.locator("#title").fill("Beacon quick close")
            page.locator("#body").fill("Beacon preserves the final input")
            page.close()
            assert received.wait(5), "The unload snapshot did not reach the draft file"
        second_server, second_address = editor["start_server"]()
        assert second_server.server_port != int(address.split(":")[2].split("/")[0])
        second_thread = Thread(target=second_server.serve_forever, daemon=True)
        second_thread.start()
        page = context.new_page()
        page.goto(second_address)
        page.wait_for_load_state("networkidle")
        assert page.evaluate("localStorage.getItem('rlzhao-life-draft')") is None
        expect(page.locator("#title")).to_have_value("Beacon quick close")
        expect(page.locator("#body")).to_have_value("Beacon preserves the final input")
    finally:
        context.close()
        if second_server:
            second_server.shutdown()
            second_server.server_close()
            second_thread.join(timeout=2)


def check_article_autosave_failure_retry(page, root, publish=False):
    page.locator("#view-articles").click()
    page.locator("#article-new").click()
    page.route("**/api/article-draft", lambda route: route.fulfill(
        status=400, content_type="application/json", body=json.dumps({"error": "Draft save temporarily failed"})))
    slug = "retry-publish" if publish else "retry-generate"
    page.locator("#article-slug").fill(slug)
    page.locator("#article-title").fill("Recovered article")
    page.locator("#article-cardTitle").fill("Recovered article")
    page.locator("#article-date").fill("2026-10-02")
    page.locator("#article-description").fill("Recovered description")
    page.locator("#article-body").fill("Recovered article body")
    expect(page.locator("#notice")).to_have_text("Draft save temporarily failed")
    page.unroute("**/api/article-draft")
    page.locator("#article-publish" if publish else "#article-save").click()
    expect(page.locator("#article-status")).to_have_text("已推送，网站将在构建后更新" if publish else "已保存到本地")
    assert (root / f"src/articles/20261002/{slug}.md").is_file()


def check_failed_delete_preserves_new_draft(browser, root):
    """Deletion committed before a failed push must not turn the deleted record into a draft."""
    output, _, url = new_life.write_entry({"title": "Delete this record", "date": "2026-10-02",
                                          "body": "Deleted record body", "photos": []}, root)
    editor["save_draft"]({"title": "Keep this new draft", "date": "2026-10-02",
                           "body": "New draft body", "description": "", "photos": []})
    pending_path = root / "drafts/pending-publish.json"

    def ready_git(*args):
        if args == ("branch", "--show-current"):
            return "main"
        if args[0] == "rev-parse":
            return "same-commit"
        if args[0] == "ls-files":
            return str(output.relative_to(root))
        return ""

    def fail_push(*_):
        pending_path.write_text(json.dumps({"commit": "delete-commit", "path": str(output.relative_to(root)),
                                            "url": url}), encoding="utf-8")
        raise RuntimeError("Simulated failed deletion push")

    context = browser.new_context()
    server, address = editor["start_server"]()
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with patch.dict(server_globals, {"git": ready_git, "publish_paths": fail_push}):
            page = context.new_page()
            page.goto(address)
            page.wait_for_load_state("networkidle")
            page.locator("#view-manage").click()
            card = page.locator(".entry-card", has_text="Delete this record")
            card.get_by_role("button", name="编辑").click()
            expect(page.locator("#title")).to_have_value("Delete this record")
            page.once("dialog", lambda dialog: dialog.accept())
            card.get_by_role("button", name="删除").click()
            expect(page.locator("#retry-push")).to_be_visible()
            expect(page.locator("#title")).to_have_value("Keep this new draft")
            page.locator("#view-articles").click()
            assert editor["read_draft"]()["body"] == "New draft body"
            page.locator("#close-editor").click()
            expect(page.locator("#notice")).to_have_text("编辑器已关闭。现在可以关闭这个标签页。")
            assert editor["read_draft"]()["title"] == "Keep this new draft"
            assert editor["read_draft"]()["body"] == "New draft body"
            assert not output.exists()
    finally:
        context.close()
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        pending_path.unlink(missing_ok=True)


with TemporaryDirectory() as directory:
    root = Path(directory)
    legacy = root / "src/legacy/work/work1.njk"
    legacy.parent.mkdir(parents=True)
    legacy.write_text('---\nlayout: layouts/base.njk\n---\n<div class="stream-lr"><div class="stream-meta"><span class="streamitem-date">2024<span>年</span> <a href="">1月2号</a></span></div><div class="stream-main"><h3 class="streamitem-title">旧记录</h3><p>原来的正文</p><figure class="stream"><img src="https://example.com/old.jpg" alt="旧照片"></figure></div></div>', encoding="utf-8")
    article = root / "src/articles/20240102/example.njk"
    article.parent.mkdir(parents=True)
    article.write_text('''---
layout: "layouts/base.njk"
permalink: "/media/pages/articles/20240102/example.html"
title: "示例文章｜赵荣力"
description: "介绍"
date: "2024-01-02"
cardTitle: "示例文章"
summary: "摘要"
category: "编程"
dateLabel: "2024年1月2日"
cover: "https://example.com/cover.jpg"
---
<article><h1>示例文章</h1></article>
''', encoding="utf-8")
    with patch.dict(server_globals, {
        "ROOT": root,
        "EDITOR": project / "editor",
        "DRAFT": root / "drafts/life-form.json",
        "ARTICLE_DRAFT": root / "drafts/article-form.json",
        "UPLOADS": root / "drafts/life-uploads",
        "PENDING_PUBLISH": root / "drafts/pending-publish.json",
        "git": lambda *_: "feature",
    }), patch.object(new_life, "ROOT", root), patch.object(life_records, "ROOT", root), \
            patch.object(legacy_life, "ROOT", root), patch.object(article_records, "ROOT", root):
        new_life.write_entry({"title": "新记录", "date": "2026-09-26", "body": "初始正文", "photos": []}, root)
        server, address = editor["start_server"]()
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                page = browser.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(address)
                page.wait_for_load_state("networkidle")
                expect(page.locator("#view-life")).to_have_attribute("aria-pressed", "true")
                expect(page.locator("#life-actions")).to_be_visible()
                expect(page.locator("#article-actions")).to_be_hidden()
                expect(page.locator("#view-publish")).to_have_attribute("aria-pressed", "true")
                expect(page.locator("#workspace")).to_be_visible()
                expect(page.locator("#manage-library")).to_be_hidden()
                page.locator("#view-manage").click()
                expect(page.locator("#view-manage")).to_have_attribute("aria-pressed", "true")
                expect(page.locator("#manage-library")).to_be_visible()
                expect(page.locator("#workspace")).to_be_hidden()
                assert page.locator("#entry-count").inner_text() == "02"
                assert page.locator(".entry-year-heading").all_inner_texts() == ["2026 年", "2024 年"]
                assert page.locator(".entry-month-heading").all_inner_texts() == ["9 月", "1 月"]
                page.get_by_role("button", name="2024 · 1").click()
                assert page.locator(".entry-card").count() == 1
                page.get_by_role("button", name="全部年份").click()
                card = page.locator(".entry-card", has_text="新记录")
                card.get_by_role("button", name="编辑").click()
                expect(page.locator("#title")).to_have_value("新记录")
                page.locator("#title").fill("修改的新记录")
                save_with_locked_form(page, "change_existing", "#generate", "#body")
                page.get_by_text("修改已保存到本地文件", exact=False).wait_for()
                assert page.locator(".entry-card", has_text="修改的新记录").count() == 1
                card = page.locator(".entry-card", has_text="修改的新记录")
                page.once("dialog", lambda dialog: dialog.accept())
                card.get_by_role("button", name="隐藏").click()
                page.get_by_text("已隐藏「修改的新记录」", exact=False).wait_for()
                page.get_by_role("button", name="已隐藏", exact=True).first.click()
                assert page.locator(".entry-card").count() == 1
                page.get_by_role("button", name="全部", exact=True).click()
                card = page.locator(".entry-card", has_text="旧记录")
                save_with_locked_form(page, "parse", '.entry-card:has-text("旧记录") button:has-text("编辑")',
                                      "#body", owner=legacy_life, loaded_body="原来的正文")
                expect(page.locator("#legacy-editor")).to_be_visible()
                expect(page.locator("#title")).to_have_value("旧记录")
                expect(page.locator("#body")).to_have_value("原来的正文")
                expect(page.locator(".photo-card")).to_have_count(1)
                expect(page.locator("#date-hint")).to_have_text("留空会保留旧记录的原日期。")
                page.locator("#date").fill("")
                page.locator("#generate").click()
                expect(page.locator("#date")).to_have_value("2024-01-02")
                assert legacy_life.parse("legacy-work1-1")["date"] == "2024-01-02"
                page.locator("#title").fill("旧记录已改")
                page.locator("#description").fill("一句简介")
                page.locator("#body").fill("更新后的正文")
                page.locator(".photo-alt").fill("更新后的照片说明")
                page.locator("#oss-url").fill("https://example.com/new.jpg")
                page.locator("#add-oss").click()
                expect(page.locator(".photo-card")).to_have_count(2)
                page.once("dialog", lambda dialog: dialog.dismiss())
                page.locator("#view-publish").click()
                expect(page.locator("#view-manage")).to_have_attribute("aria-pressed", "true")
                save_with_locked_form(page, "change_existing", "#generate", "#body")
                page.get_by_text("修改已保存到本地文件", exact=False).wait_for()
                expect(page.locator(".entry-card", has_text="旧记录已改").locator(".entry-excerpt")).to_have_text("一句简介")
                saved = legacy.read_text(encoding="utf-8")
                for value in ("旧记录已改", "一句简介", "更新后的正文", "更新后的照片说明", "https://example.com/old.jpg", "https://example.com/new.jpg"):
                    assert value in saved, value
                page.locator("#legacy-editor summary").click()
                page.locator("#legacy-html").fill(page.locator("#legacy-html").input_value().replace("旧记录已改", "原始 HTML 已改"))
                page.locator("#generate").click()
                page.get_by_text("修改已保存到本地文件", exact=False).wait_for()
                assert "原始 HTML 已改" in legacy.read_text(encoding="utf-8")
                page.locator("#view-publish").click()
                expect(page.locator("#view-publish")).to_have_attribute("aria-pressed", "true")
                expect(page.locator("#manage-library")).to_be_hidden()
                expect(page.locator("#workspace")).to_be_visible()
                page.locator("#view-manage").click()
                expect(page.locator("#workspace")).to_be_hidden()
                page.locator("#new-entry").click()
                expect(page.locator("#view-publish")).to_have_attribute("aria-pressed", "true")
                page.locator("#view-articles").click()
                expect(page.locator("#article-actions")).to_be_visible()
                expect(page.locator("#life-actions")).to_be_hidden()
                expect(page.locator("#article-workspace")).to_be_visible()
                page.locator(".article-item").click()
                expect(page.locator("#article-cardTitle")).to_have_value("示例文章")
                page.locator("#article-cardTitle").fill("更新后的文章")
                page.locator("#article-body").fill("<article><h1>更新后的正文</h1></article>\n")
                save_with_locked_form(page, "change_article", "#article-save", "#article-body")
                expect(page.locator("#article-status")).to_have_text("已保存到本地")
                assert "更新后的正文" in article.read_text(encoding="utf-8")
                expect(page.locator(".article-item")).to_contain_text("更新后的文章")
                page.locator("#article-new").click()
                expect(page.locator("#article-list-panel")).to_be_hidden()
                expect(page.locator("#article-new")).to_have_attribute("aria-pressed", "true")
                page.locator("#article-slug").fill("new-story")
                page.locator("#article-title").fill("新文章｜赵荣力")
                page.locator("#article-cardTitle").fill("新文章")
                page.locator("#article-date").fill("2026-09-29")
                page.locator("#article-description").fill("页面简介")
                page.locator("#article-summary").fill("列表摘要")
                page.locator("#article-body").fill("## 正文标题\n\n文章内容。")
                save_with_locked_form(page, "handle_new_article", "#article-save", "#article-body")
                expect(page.locator("#article-status")).to_have_text("已保存到本地")
                created = root / "src/articles/20260929/new-story.md"
                assert created.is_file()
                assert "/articles/2026-09-29-new-story/" in created.read_text(encoding="utf-8")
                expect(page.locator("#article-list-panel")).to_be_visible()
                previous_article_body = article_records.parse("20240102/example")["body"]
                save_with_locked_form(page, "parse", '.article-item:has-text("更新后的文章")', "#article-body",
                                      owner=article_records, loaded_body=previous_article_body)
                page.locator("#view-life").click()
                expect(page.locator("#life-actions")).to_be_visible()

                def ready_git(*args):
                    if args == ("branch", "--show-current"): return "main"
                    if args[0] == "rev-parse": return "same-commit"
                    return ""

                # Backend Git behavior has separate temporary-repository tests. Here
                # verify published takes precedence over unchanged in the UI response.
                with patch.dict(server_globals, {"git": ready_git, "publish_paths": lambda *_: True}):
                    page.reload()
                    page.locator("#view-manage").click()
                    page.locator(".entry-card", has_text="修改的新记录").get_by_role("button", name="编辑").click()
                    page.locator("#publish").click()
                    page.get_by_text("修改已推送到 GitHub", exact=False).wait_for()
                    expect(page.locator("#save-status")).to_have_text("已推送")
                    page.locator("#view-articles").click()
                    page.locator(".article-item", has_text="新文章").click()
                    page.locator("#article-publish").click()
                    expect(page.locator("#article-status")).to_have_text("已推送，网站将在构建后更新")
                with patch.dict(server_globals, {"git": ready_git, "publish_paths": lambda *_: False}):
                    page.locator("#article-publish").click()
                    expect(page.locator("#article-status")).to_have_text("没有待发布的本地修改")

                pending = root / "drafts/pending-publish.json"
                pending.parent.mkdir(parents=True, exist_ok=True)
                pending.write_text(json.dumps({"commit": "new-commit", "path": "src/life/pending.md",
                                               "url": "/life/pending/"}), encoding="utf-8")
                def retry_git(*args):
                    if args == ("branch", "--show-current"): return "main"
                    if args == ("rev-parse", "HEAD"): return "new-commit"
                    if args == ("rev-parse", "HEAD^"): return "old-commit"
                    if args == ("rev-parse", "origin/main"): return "old-commit"
                    return ""
                with patch.dict(server_globals, {"git": retry_git}):
                    page.reload()
                    expect(page.locator("#retry-push")).to_be_visible()
                    expect(page.locator("#publish")).to_be_disabled()
                    page.locator("#retry-push").click()
                    page.get_by_text("本次提交已推送到 GitHub", exact=False).wait_for()
                    expect(page.locator("#retry-push")).to_be_hidden()
                    assert not pending.exists()
                check_article_autosave_failure_retry(page, root)
                with patch.dict(server_globals, {"git": ready_git, "publish_paths": lambda *_: True}):
                    page.reload()
                    check_article_autosave_failure_retry(page, root, publish=True)
                check_failed_delete_preserves_new_draft(browser, root)
                check_quick_close_draft_and_local_date(browser, address, root)
                check_unload_beacon_to_new_editor(browser, address)
                assert not errors, errors
                browser.close()
                print("PASS: editor drafts, quick-close recovery, local dates, locked saves, article retries and legacy dates")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
