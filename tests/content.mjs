import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";

const PROJECT = fileURLToPath(new URL("../", import.meta.url));
const CLI = path.join(PROJECT, "node_modules/@11ty/eleventy/cmd.cjs");
const CONFIG = path.join(PROJECT, "eleventy.config.js");
const DEV = path.join(PROJECT, "scripts/dev.js");
const HIDE_OPEN = "{# life-editor:hidden #}{% if false %}";
const HIDE_CLOSE = "{% endif %}{# life-editor:end #}";

function elements(node, result = []) {
  if (node.tagName) result.push(node);
  for (const child of node.childNodes || []) elements(child, result);
  return result;
}

function attrs(node) {
  return Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
}

function hasClass(node, name) {
  return (attrs(node).class || "").split(/\s+/).includes(name);
}

function yearLinks(html) {
  const navigation = elements(parse(html)).find(node => hasClass(node, "life-years"));
  return elements(navigation).filter(node => node.tagName === "a").map(node => attrs(node).href);
}

function record(year, title = "旧记录") {
  return `<div class="stream-lr"><div class="stream-meta"><span class="streamitem-date">${year}<span class="streamitem-ordinal">年</span> <a href="">3月18号</a></span></div><div class="stream-main"><h3 class="streamitem-title">${title}</h3></div></div>`;
}

async function legacyPage(root, number, body = "") {
  const source = `---\nlayout: layouts/base.njk\npermalink: /media/pages/work/work/work${number}.html\nlegacyPage: ${number}\n---\n{% include "partials/life-pager.njk" %}\n${body}\n{% include "partials/life-pager.njk" %}\n`;
  await writeFile(path.join(root, `src/legacy/work/work${number}.njk`), source);
}

async function lifeEntry(root, day, slug, { body = "", hidden = false } = {}) {
  const source = `---\nlayout: layouts/life.njk\npermalink: ${hidden ? "false" : `/life/${day}-${slug}/`}\ntitle: ${slug}\ndate: ${day}\ntags: ${hidden ? "[]" : "[life]"}\n${hidden ? "hidden: true\n" : ""}---\n${body}\n`;
  await writeFile(path.join(root, `src/life/${day}-${slug}.md`), source);
}

async function fixture(run) {
  const temporaryDirectory = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(temporaryDirectory, "site-content-"));
  try {
    for (const directory of ["src/_includes/layouts", "src/_includes/partials", "src/legacy/work", "src/life", "src/pages"]) {
      await mkdir(path.join(root, directory), { recursive: true });
    }
    await writeFile(path.join(root, "src/_includes/layouts/base.njk"), '<!doctype html><html lang="zh-CN"><body>{{ content | safe }}</body></html>');
    for (const file of ["_includes/layouts/life.njk", "_includes/partials/life-entry.njk", "_includes/partials/life-pager.njk", "pages/work.njk"]) {
      await writeFile(path.join(root, "src", file), await readFile(path.join(PROJECT, "src", file)));
    }
    for (let number = 1; number <= 15; number++) await legacyPage(root, number);
    await run(root);
  } finally {
    // Only remove the exact temporary fixture created above, never a project/output path.
    const canonicalRoot = await realpath(root);
    assert.equal(path.dirname(canonicalRoot), temporaryDirectory);
    assert.ok(path.basename(canonicalRoot).startsWith("site-content-"));
    await rm(canonicalRoot, { recursive: true, force: true });
  }
}

function build(root) {
  const result = spawnSync(process.execPath, [CLI, `--config=${CONFIG}`, "--quiet"], { cwd: root, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.error?.message || `${result.stdout}\n${result.stderr}`);
}

async function output(root, url) {
  return readFile(path.join(root, "_site", url.replace(/^\//, "").replace(/\/$/, "/index.html")), "utf8");
}

test("an empty modern collection keeps the life landing page and historical navigation", async () => {
  await fixture(async root => {
    await legacyPage(root, 15, record(2025));
    build(root);
    const landing = await output(root, "/work.html");
    assert.match(landing, /class="life-empty"/);
    assert.match(landing, /暂时没有新的生活记录/);
    assert.match(landing, /href="\/media\/pages\/work\/work\/work15.html"/);
    assert.match(await output(root, "/media/pages/work/work/work15.html"), /href="\/work.html"/);
  });
});

test("hiding every modern record keeps an empty landing page without hidden year links", async () => {
  await fixture(async root => {
    await lifeEntry(root, "2026-10-01", "hidden-one", { hidden: true });
    await lifeEntry(root, "2027-10-01", "hidden-two", { hidden: true });
    build(root);
    const landing = await output(root, "/work.html");
    assert.match(landing, /class="life-empty"/);
    assert.deepEqual(yearLinks(landing), []);
    assert.doesNotMatch(landing, /hidden-one|hidden-two/);
    await assert.rejects(output(root, "/life/2026-10-01-hidden-one/"), { code: "ENOENT" });
  });
});

test("several life posts keep unique footnote IDs, references and backlinks on list and standalone pages", async () => {
  await fixture(async root => {
    for (const [day, slug] of [["2026-10-01", "first"], ["2026-10-02", "second"]]) {
      await lifeEntry(root, day, slug, { body: "正文[^note]，再次引用[^note]。\n\n[^note]: 对应文章的注释" });
    }
    build(root);
    const landing = await output(root, "/work.html");
    const posts = elements(parse(landing)).filter(node => node.tagName === "article" && hasClass(node, "stream-lr"));
    assert.equal(posts.length, 2);
    const ids = elements(parse(landing)).map(node => attrs(node).id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, "list page has duplicate IDs");
    for (const post of posts) {
      const descendants = elements(post);
      const localIds = new Set(descendants.map(node => attrs(node).id).filter(Boolean));
      const links = descendants.filter(node => node.tagName === "a").map(node => attrs(node).href).filter(href => href?.startsWith("#fn"));
      assert.equal(links.length, 4, "both references and both backlinks must exist");
      assert.ok(links.every(href => localIds.has(href.slice(1))), "footnote links must resolve within their own post");
      const entryUrl = descendants.find(node => node.tagName === "h2").childNodes.find(node => node.tagName === "a");
      const standalone = await output(root, attrs(entryUrl).href);
      for (const id of localIds) assert.ok(standalone.includes(`id="${id}"`), "footnote IDs stay stable on the standalone page");
    }
  });
});

test("changing a historical date year rebuilds its anchor and its year navigation", async () => {
  await fixture(async root => {
    const staleAnchor = '<span id="life-year-2025" class="life-year-anchor"></span>';
    await legacyPage(root, 15, staleAnchor + record(2025));
    build(root);
    await legacyPage(root, 15, staleAnchor + record(2026));
    build(root);
    const historical = await output(root, "/media/pages/work/work/work15.html");
    assert.equal((historical.match(/id="life-year-2026"/g) || []).length, 1);
    assert.doesNotMatch(historical, /id="life-year-2025"/);
    assert.deepEqual(yearLinks(await output(root, "/work.html")), ["/media/pages/work/work/work15.html#life-year-2026"]);
  });
});

test("hidden and deleted historical entries leave no stale anchors or dead year links", async () => {
  await fixture(async root => {
    const staleAnchor = '<span id="life-year-2021" class="life-year-anchor"></span>';
    const hidden = HIDE_OPEN + record(2099, "隐藏记录") + HIDE_CLOSE;
    await legacyPage(root, 1, staleAnchor + HIDE_OPEN + record(2021) + HIDE_CLOSE + record(2022) + hidden);
    await legacyPage(root, 2, record(2021, "仍然可见"));
    build(root);
    const first = await output(root, "/media/pages/work/work/work1.html");
    assert.doesNotMatch(first, /id="life-year-2021"|2099|隐藏记录/);
    assert.match(first, /id="life-year-2022"/);
    assert.deepEqual(yearLinks(await output(root, "/work.html")), [
      "/media/pages/work/work/work1.html#life-year-2022", "/media/pages/work/work/work2.html#life-year-2021",
    ]);
    await legacyPage(root, 2, staleAnchor); // Delete the last visible 2021 entry, retaining its old hand-written anchor.
    build(root);
    assert.doesNotMatch(await output(root, "/media/pages/work/work/work2.html"), /id="life-year-2021"/);
    assert.deepEqual(yearLinks(await output(root, "/work.html")), ["/media/pages/work/work/work1.html#life-year-2022"]);
  });
});

test("modern year links take over when the historical records for that year are hidden", async () => {
  await fixture(async root => {
    await legacyPage(root, 15, HIDE_OPEN + record(2025) + HIDE_CLOSE);
    await lifeEntry(root, "2025-05-01", "visible");
    build(root);
    const landing = await output(root, "/work.html");
    assert.deepEqual(yearLinks(landing), ["/work.html#life-year-2025"]);
    assert.equal((landing.match(/id="life-year-2025"/g) || []).length, 1);
  });
});

test("successive real builds remove deleted and renamed source pages from the output", async () => {
  await fixture(async root => {
    const oldSource = path.join(root, "src/pages/old.md");
    const newSource = path.join(root, "src/pages/new.md");
    await writeFile(oldSource, "旧页面正文\n");
    build(root);
    assert.match(await output(root, "/pages/old/index.html"), /旧页面正文/);
    await rename(oldSource, newSource);
    build(root);
    await assert.rejects(output(root, "/pages/old/index.html"), { code: "ENOENT" });
    assert.match(await output(root, "/pages/new/index.html"), /旧页面正文/);
    await unlink(newSource);
    build(root);
    await assert.rejects(output(root, "/pages/new/index.html"), { code: "ENOENT" });
    assert.match(await output(root, "/work.html"), /class="life-empty"/);
  });
});

test("serve/watch rebuilds remove old pages and retain all pages, assets and responsive images", { timeout: 30_000 }, async () => {
  await fixture(async root => {
    for (const directory of ["assets/css", "assets/js", "assets/images"]) await mkdir(path.join(root, directory), { recursive: true });
    await writeFile(path.join(root, "assets/css/fixture.css"), "body { color: #123456; }\n");
    await writeFile(path.join(root, "assets/js/fixture.js"), "window.fixture = true;\n");
    await sharp({ create: { width: 100, height: 80, channels: 3, background: "#557744" } }).png().toFile(path.join(root, "assets/images/fixture.png"));
    const keptSource = '---\nlayout: layouts/base.njk\npermalink: /kept.html\n---\n<link rel="stylesheet" href="/assets/css/fixture.css"><script src="/assets/js/fixture.js"></script><img src="/assets/images/fixture.png" alt="照片">';
    // Start with a broken layout to verify that even an initial build failure can recover.
    await writeFile(path.join(root, "src/pages/kept.njk"), keptSource.replace("layouts/base.njk", "layouts/missing.njk"));
    await writeFile(path.join(root, "src/pages/watch-old.md"), "保持可用的页面\n");
    await legacyPage(root, 15, record(2025));

    const portReservation = net.createServer();
    await new Promise(resolve => portReservation.listen(0, "127.0.0.1", resolve));
    const port = portReservation.address().port;
    await new Promise(resolve => portReservation.close(resolve));
    const child = spawn(process.execPath, [DEV, `--config=${CONFIG}`, `--port=${port}`], { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let log = "";
    child.stdout.on("data", data => { log += data; });
    child.stderr.on("data", data => { log += data; });
    const builds = () => (log.match(/\[dev\] Build complete/g) || []).length;
    const exists = async url => {
      try { return (await stat(path.join(root, "_site", url))).isFile(); }
      catch (error) { if (error.code === "ENOENT") return false; throw error; }
    };
    const waitFor = async condition => {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        assert.equal(child.exitCode, null, log);
        if (await condition()) return;
        await delay(100);
      }
      assert.fail(`watch did not produce the expected rebuild:\n${log}`);
    };
    const assertAvailable = async () => {
      const html = await output(root, "/kept.html");
      const responsive = attrs(elements(parse(html)).find(node => node.tagName === "img")).src;
      assert.match(responsive, /^\/assets\/images\/responsive\/.+\.webp$/);
      for (const url of ["/kept.html", "/work.html", "/assets/css/fixture.css", "/assets/js/fixture.js", "/assets/images/fixture.png", responsive]) {
        assert.ok(await exists(url), `missing generated output after watch rebuild: ${url}`);
        const response = await fetch(`http://127.0.0.1:${port}${url}`);
        assert.equal(response.status, 200, url);
        assert.ok((await response.arrayBuffer()).byteLength > 0, `empty response: ${url}`);
      }
    };
    try {
      await waitFor(() => /\[dev\] Build failed/.test(log) && /Watching/.test(log));
      await writeFile(path.join(root, "src/pages/kept.njk"), keptSource);
      await waitFor(() => builds() >= 1);
      await assertAvailable();
      let previous = builds();
      await rename(path.join(root, "src/pages/watch-old.md"), path.join(root, "src/pages/watch-new.md"));
      await waitFor(async () => builds() > previous && await exists("pages/watch-new/index.html") && !await exists("pages/watch-old/index.html"));
      await assertAvailable();
      previous = builds();
      await unlink(path.join(root, "src/pages/watch-new.md"));
      await waitFor(async () => builds() > previous && !await exists("pages/watch-new/index.html") && await exists("kept.html"));
      await assertAvailable();
      previous = builds();
      await legacyPage(root, 15, record(2026));
      await waitFor(async () => builds() > previous && (await output(root, "/media/pages/work/work/work15.html")).includes('id="life-year-2026"'));
      assert.deepEqual(yearLinks(await output(root, "/work.html")), ["/media/pages/work/work/work15.html#life-year-2026"]);
      await assertAvailable();
    } finally {
      if (child.exitCode === null) {
        child.kill();
        await new Promise(resolve => child.once("exit", resolve));
      }
    }
  });
});
