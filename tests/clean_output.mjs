import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { cleanGeneratedOutput } from "../scripts/clean_output.js";

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "site-clean-output-"));
  try { await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("full builds remove stale pages and derivatives while preserving source and cache", async () => {
  await fixture(async (root) => {
    for (const directory of ["src/articles", ".cache/images", "_site/old", "_site/assets/images"]) {
      await mkdir(path.join(root, directory), { recursive: true });
    }
    const source = path.join(root, "src/articles/current.md");
    const cache = path.join(root, ".cache/images/cached.webp");
    await writeFile(source, "current source");
    await writeFile(cache, "cached image");
    await writeFile(path.join(root, "_site/old/index.html"), "obsolete page");
    await writeFile(path.join(root, "_site/assets/images/old.webp"), "obsolete image");
    await cleanGeneratedOutput("_site", { root });
    assert.deepEqual(await readdir(path.join(root, "_site")), []);
    assert.equal(await readFile(source, "utf8"), "current source");
    assert.equal(await readFile(cache, "utf8"), "cached image");
    await writeFile(path.join(root, "_site/index.html"), "rebuilt page");
    await cleanGeneratedOutput(path.join(root, "_site"), { root });
    assert.deepEqual(await readdir(path.join(root, "_site")), []);
  });
});

test("a missing output directory is recreated", async () => {
  await fixture(async (root) => {
    await cleanGeneratedOutput("_site", { root });
    assert.deepEqual(await readdir(path.join(root, "_site")), []);
  });
});

test("source, project root, nested and outside directories cannot be cleaned", async () => {
  await fixture(async (root) => {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src/keep.md"), "keep");
    for (const target of [root, "src", "_site/nested", "../outside-output"]) {
      await assert.rejects(cleanGeneratedOutput(target, { root }), /Refusing to clean/);
    }
    assert.equal(await readFile(path.join(root, "src/keep.md"), "utf8"), "keep");
  });
});

test("an output junction or symlink cannot redirect cleanup to source", async () => {
  await fixture(async (root) => {
    const source = path.join(root, "src");
    await mkdir(source);
    await writeFile(path.join(source, "keep.md"), "keep");
    await symlink(source, path.join(root, "_site"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(cleanGeneratedOutput("_site", { root }), /redirected _site/);
    assert.equal(await readFile(path.join(source, "keep.md"), "utf8"), "keep");
  });
});

test("an output junction or symlink cannot redirect cleanup outside the project", async () => {
  await fixture(async (root) => {
    const project = path.join(root, "project");
    const external = path.join(root, "external");
    await mkdir(project);
    await mkdir(external);
    await writeFile(path.join(external, "keep.md"), "keep");
    await symlink(external, path.join(project, "_site"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(cleanGeneratedOutput("_site", { root: project }), /redirected _site/);
    assert.equal(await readFile(path.join(external, "keep.md"), "utf8"), "keep");
  });
});
