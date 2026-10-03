import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parse } from "parse5";
import sharp from "sharp";
import { createImagePipeline, imagePath } from "../scripts/images.js";

function imageAttributes(html) {
  function find(node) {
    if (node.tagName === "img") return Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
    for (const child of node.childNodes || []) { const result = find(child); if (result) return result; }
  }
  return find(parse(html));
}

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "site-images-"));
  try {
    const relative = "media/pages/work/20220625.JPG";
    await mkdir(path.join(root, "media/pages/work"), { recursive: true });
    await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#557744" } }).jpeg().toFile(path.join(root, relative));
    await run(root, relative);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("known OSS paths resolve exactly, unrelated hosts and ambiguous filenames stay external", () => {
  assert.equal(imagePath("https://websiteanthony.oss-cn-beijing.aliyuncs.com/rlzhao/media/pages/articles/a/Fan.JPG"), "media/pages/articles/a/Fan.JPG");
  assert.equal(imagePath("https://websiteanthony.oss-cn-beijing.aliyuncs.com/rlzhao/work/2022/20220625.JPG"), "media/pages/work/20220625.JPG");
  assert.equal(imagePath("https://websiteanthony.oss-cn-beijing.aliyuncs.com/rlzhao/work/2023/20220625.JPG"), null);
  assert.equal(imagePath("https://websiteanthony.oss-cn-beijing.aliyuncs.com/rlzhao/work/2022/1.JPG"), null);
  assert.equal(imagePath("https://example.com/media/pages/work/20220625.JPG"), null);
  assert.equal(imagePath("https://websiteanthony.oss-cn-beijing.aliyuncs.com/rlzhao/work/2022/20220625.JPG?signature=1"), null);
  assert.equal(imagePath("/assets/%2e%2e%5cprivate.jpg"), null);
  assert.equal(imagePath("/assets/images/icon/test.svg"), null);
});

test("HTML receives working width candidates and dimensions, while preview retains its original OSS URL", async () => {
  await fixture(async (root, relative) => {
    const images = createImagePipeline({ root });
    await images.prepare();
    const original = "https://websiteanthony.oss-cn-beijing.aliyuncs.com/rlzhao/work/2022/20220625.JPG";
    const script = '<script>const example = \'<img src="/media/pages/work/20220625.JPG">\';</script>';
    const comment = '<!-- <img src="/media/pages/work/20220625.JPG"> -->';
    const html = await images.transform(`${comment}${script}<figure><img src="${original}" alt="A &amp; B" width="600px" height="450px" loading="lazy" data-lightbox></figure>`);
    assert.ok(html.includes(script));
    assert.ok(html.includes(comment));
    const attrs = imageAttributes(html);
    assert.equal(attrs["data-original-src"], original);
    assert.equal(attrs["data-lightbox-src"], original);
    assert.equal(attrs.alt, "A & B");
    assert.equal(attrs.width, "600");
    assert.equal(attrs.height, "450");
    assert.equal(attrs.decoding, "async");
    assert.ok(attrs.src.startsWith("/assets/images/responsive/"));
    const candidates = attrs.srcset.split(", ");
    assert.deepEqual(candidates.map(value => Number(value.split(" ")[1].slice(0, -1))), [320, 640, 960, 1440]);
    for (const candidate of candidates) {
      const [url, descriptor] = candidate.split(" ");
      const file = path.join(root, "_site", url.slice(1));
      const metadata = await sharp(await readFile(file)).metadata();
      assert.equal(metadata.width, Number(descriptor.slice(0, -1)));
      assert.equal(metadata.format, "webp");
    }
    assert.equal(images.summary().optimizedSources, 1);
    assert.equal(images.summary().optimizedTags, 1);
    assert.equal(await stat(path.join(root, relative)).then(info => info.isFile()), true);
    await assert.rejects(stat(path.join(root, "_site", relative)), { code: "ENOENT" });
  });
});

test("same-origin media links and CSS retain their original paths; unknown external images stay untouched", async () => {
  await fixture(async (root, relative) => {
    await mkdir(path.join(root, "assets/css"), { recursive: true });
    await writeFile(path.join(root, "assets/css/test.css"), `body{background:url('/${relative}')}`);
    const images = createImagePipeline({ root });
    await images.prepare();
    const external = '<img src="https://example.com/remote.jpg" width="70%" alt="external">';
    assert.equal(await images.transform(external), external);
    const source = `<a href="/${relative}">Original</a><img src="/${relative}" width="70%" data-lightbox>`;
    const html = await images.transform(source);
    assert.ok(html.includes(`<a href="/${relative}">Original</a>`));
    const attrs = imageAttributes(html);
    assert.equal(attrs["data-lightbox-src"], `/${relative}`);
    assert.equal(attrs.width, "2000");
    assert.equal(attrs.height, "1500");
    assert.match(attrs.style, /width:70%;height:auto/);
    assert.deepEqual(await readFile(path.join(root, "_site", relative)), await readFile(path.join(root, relative)));
  });
});

test("watch rebuilds recopy cached variants and changes in original bytes produce new URLs", async () => {
  await fixture(async (root, relative) => {
    const images = createImagePipeline({ root });
    const source = `<img src="/${relative}">`;
    await images.prepare("first-output");
    const first = imageAttributes(await images.transform(source));
    const cachedBefore = await readdir(path.join(root, ".cache/images"));
    await writeFile(path.join(root, "first-output/media/pages/work/obsolete.jpg"), "old passthrough backup");
    await images.prepare("first-output");
    await assert.rejects(stat(path.join(root, "first-output/media/pages/work/obsolete.jpg")), { code: "ENOENT" });
    await assert.rejects(stat(path.join(root, "first-output", first.src.slice(1))), { code: "ENOENT" });
    assert.equal(imageAttributes(await images.transform(source)).src, first.src);
    await images.prepare("second-output");
    const second = imageAttributes(await images.transform(source));
    assert.equal(second.src, first.src);
    assert.deepEqual(await readdir(path.join(root, ".cache/images")), cachedBefore);
    assert.ok((await stat(path.join(root, "second-output", second.src.slice(1)))).size > 0);
    await sharp({ create: { width: 800, height: 600, channels: 3, background: "#eeeeff" } }).jpeg().toFile(path.join(root, relative));
    await images.prepare("third-output");
    const third = imageAttributes(await images.transform(source));
    assert.notEqual(third.src, first.src);
    assert.equal(third.width, "800");
    assert.equal(third.height, "600");
    assert.deepEqual(third.srcset.split(", ").map(value => value.split(" ")[1]), ["320w", "640w", "800w"]);
  });
});

test("EXIF orientation is applied before measuring and resizing portraits", async () => {
  await fixture(async (root, relative) => {
    await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#776655" } }).withMetadata({ orientation: 6 }).jpeg().toFile(path.join(root, relative));
    const images = createImagePipeline({ root });
    await images.prepare();
    const attrs = imageAttributes(await images.transform(`<img src="/${relative}">`));
    assert.equal(attrs.width, "600");
    assert.equal(attrs.height, "1200");
    const output = await sharp(await readFile(path.join(root, "_site", attrs.src.slice(1)))).metadata();
    assert.equal(output.width, 600);
    assert.equal(output.height, 1200);
    assert.deepEqual(attrs.srcset.split(", ").map(value => value.split(" ")[1]), ["320w", "600w"]);
  });
});

test("existing picture sources, explicit srcset and data-no-optimize are preserved", async () => {
  await fixture(async (root, relative) => {
    const images = createImagePipeline({ root });
    await images.prepare();
    for (const html of [
      `<picture><source srcset="/${relative}"><img src="/${relative}"></picture>`,
      `<img src="/${relative}" srcset="/${relative} 2000w">`,
      `<img src="/${relative}" data-no-optimize>`,
    ]) assert.equal(await images.transform(html), html);
    assert.equal(images.summary().optimizedSources, 0);
  });
});

test("cleanup rejects the project root, source directories and outputs outside the project", async () => {
  await fixture(async (root, relative) => {
    const images = createImagePipeline({ root });
    for (const output of [".", "..", "src", "assets/output", "media", ".cache/output"]) {
      await assert.rejects(images.prepare(output), /generated directory inside the project/);
    }
    assert.ok((await stat(path.join(root, relative))).isFile());
  });
});
