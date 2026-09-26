"""Smoke-test the local life editor against temporary content only."""

import json
from pathlib import Path
import runpy
import sys
from tempfile import TemporaryDirectory
from threading import Thread
from unittest.mock import patch

from playwright.sync_api import sync_playwright
from playwright.sync_api import expect

project = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project))
from scripts import legacy_life, life_records, new_life


editor = runpy.run_path(str(project / "life_editor.pyw"), run_name="test")
server_globals = editor["start_server"].__globals__

with TemporaryDirectory() as directory:
    root = Path(directory)
    legacy = root / "src/legacy/work/work1.njk"
    legacy.parent.mkdir(parents=True)
    legacy.write_text('---\nlayout: layouts/base.njk\n---\n<div class="stream-lr"><div class="stream-meta"><span class="streamitem-date">2024<span>年</span> <a href="">1月2号</a></span></div><div class="stream-main"><h3 class="streamitem-title">旧记录</h3><p>原来的正文</p><figure class="stream"><img src="https://example.com/old.jpg" alt="旧照片"></figure></div></div>', encoding="utf-8")
    with patch.dict(server_globals, {
        "ROOT": root,
        "EDITOR": project / "editor",
        "DRAFT": root / "drafts/life-form.json",
        "UPLOADS": root / "drafts/life-uploads",
        "git": lambda *_: "feature",
    }), patch.object(new_life, "ROOT", root), patch.object(life_records, "ROOT", root), \
            patch.object(legacy_life, "ROOT", root):
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
                page.locator("#generate").click()
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
                card.get_by_role("button", name="编辑").click()
                expect(page.locator("#legacy-editor")).to_be_visible()
                expect(page.locator("#title")).to_have_value("旧记录")
                expect(page.locator("#body")).to_have_value("原来的正文")
                expect(page.locator(".photo-card")).to_have_count(1)
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
                page.locator("#generate").click()
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
                assert not errors, errors
                browser.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
