import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, realpath, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";
import sharp from "sharp";

const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp)$/i;
const OSS_HOST = "websiteanthony.oss-cn-beijing.aliyuncs.com";
const SITE_HOSTS = new Set(["rlzhao.com", "www.rlzhao.com", "local.invalid"]);
const WIDTHS = [320, 640, 960, 1440];
const OUTPUT_PATH = "assets/images/responsive";
const ENCODING = { quality: 82, alphaQuality: 100, effort: 4 };
const SOURCE_DIRECTORIES = new Set(["src", "assets", "media", "scripts", "tests", "editor", "highlight", "drafts", "node_modules", ".git", ".cache"]);

function isGeneratedDirectory(root, directory) {
  const relative = path.relative(root, directory);
  return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    && !SOURCE_DIRECTORIES.has(relative.split(path.sep)[0].toLowerCase());
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function elements(node, result = []) {
  if (node.tagName) result.push(node);
  for (const child of node.childNodes || []) elements(child, result);
  // Deliberately leave inert <template> contents alone.
  return result;
}

function attributes(node) {
  return new Map(node.attrs.map(({ name, value }) => [name, value]));
}

async function exists(file) {
  try { return (await stat(file)).isFile(); } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

/** Resolve only known site paths. Never download images or match arbitrary basenames. */
export function imagePath(source, pageUrl = "/") {
  let url;
  try { url = new URL(source, new URL(pageUrl, "https://local.invalid")); } catch { return null; }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  let relative;
  if (SITE_HOSTS.has(url.hostname)) {
    relative = url.pathname.slice(1);
  } else if (url.hostname === OSS_HOST && !url.search) {
    if (url.pathname.startsWith("/rlzhao/media/")) {
      relative = url.pathname.slice("/rlzhao/".length);
    } else {
      // The old work/YYYY folders were migrated into media/pages/work. Only date-named
      // images establish an unambiguous year match; generic 1.JPG/2.JPG stay remote.
      const match = url.pathname.match(/^\/rlzhao\/work\/(\d{4})\/([^/]+)$/);
      if (match && match[2].startsWith(match[1])) relative = `media/pages/work/${match[2]}`;
    }
  }
  if (!relative) return null;
  try { relative = decodeURIComponent(relative); } catch { return null; }
  if (!relative.startsWith("assets/") && !relative.startsWith("media/")) return null;
  if (relative.split("/").some(part => !part || part === "." || part === ".." || part.includes("\\"))) return null;
  return IMAGE_EXTENSION.test(relative) ? relative : null;
}

function isSameOrigin(source, pageUrl) {
  try { return SITE_HOSTS.has(new URL(source, new URL(pageUrl, "https://local.invalid")).hostname); }
  catch { return false; }
}

function imageSizes(node, attrs) {
  if (attrs.get("sizes")) return attrs.get("sizes");
  if (attributes(node.parentNode || { attrs: [] }).get("class")?.split(/\s+/).includes("article-card-image")) {
    return "(max-width: 600px) 86vw, (max-width: 1000px) 42vw, 360px";
  }
  const width = attrs.get("width")?.match(/^(\d+)(?:px)?$/)?.[1];
  return width ? `(max-width: ${Math.ceil(Number(width) / 0.86)}px) 86vw, ${width}px`
    : "(max-width: 720px) 86vw, 900px";
}

function reserveDimensions(attrs, width, height) {
  const oldWidth = attrs.get("width");
  const pixelWidth = oldWidth?.match(/^(\d+)(?:px)?$/)?.[1];
  if (pixelWidth) {
    attrs.set("width", pixelWidth);
    const oldHeight = attrs.get("height")?.match(/^(\d+)(?:px)?$/)?.[1];
    attrs.set("height", oldHeight || String(Math.round(Number(pixelWidth) * height / width)));
  } else {
    attrs.set("width", String(width));
    attrs.set("height", String(height));
    if (/^\d+(?:\.\d+)?%$/.test(oldWidth || "")) {
      attrs.set("style", `${attrs.get("style") || ""};width:${oldWidth};height:auto`);
    }
  }
}

/** One instance per Eleventy configuration; reset on each build, including --serve. */
export function createImagePipeline({ root = process.cwd(), cacheDir = ".cache/images" } = {}) {
  root = path.resolve(root);
  cacheDir = path.resolve(root, cacheDir);
  let outputDir;
  let inventory;
  let generated;
  let copied;
  let active = 0;
  const waiting = [];
  let summary;

  async function limited(task) {
    if (active >= 3) await new Promise(resolve => waiting.push(resolve));
    active++;
    try { return await task(); } finally { active--; waiting.shift()?.(); }
  }

  async function prepare(directory = "_site") {
    outputDir = path.resolve(root, directory);
    if (!isGeneratedDirectory(root, outputDir)) {
      throw new Error("Image output must be a generated directory inside the project.");
    }
    await mkdir(outputDir, { recursive: true });
    const canonicalRoot = await realpath(root);
    const canonicalOutput = await realpath(outputDir);
    if (!isGeneratedDirectory(canonicalRoot, canonicalOutput)) throw new Error("Image output cannot point to project source directories.");
    // Eleventy leaves previous passthrough files on disk. Remove only generated media
    // copies and derivatives, then repopulate required files on this build/watch run.
    // The project source assets, originals and cache are never removed.
    for (const directory of [path.join(outputDir, "media"), path.join(outputDir, OUTPUT_PATH)]) {
      let entries = [];
      try {
        const canonicalDirectory = await realpath(directory);
        const relative = path.relative(canonicalOutput, canonicalDirectory);
        if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw new Error("Generated image directories cannot point outside the output directory.");
        }
        entries = await readdir(directory, { recursive: true, withFileTypes: true });
      }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      for (const entry of entries) {
        if (entry.isFile() && IMAGE_EXTENSION.test(entry.name)) await unlink(path.join(entry.parentPath, entry.name));
      }
    }
    inventory = new Map();
    generated = new Map();
    copied = new Map();
    summary = { optimizedSources: 0, optimizedTags: 0, originalBytes: 0, generatedBytes: 0, variants: 0 };
    for (const base of ["assets", "media"]) {
      const directory = path.join(root, base);
      let entries;
      try { entries = await readdir(directory, { recursive: true, withFileTypes: true }); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      for (const entry of entries) {
        if (!entry.isFile() || !IMAGE_EXTENSION.test(entry.name)) continue;
        const file = path.join(entry.parentPath, entry.name);
        inventory.set(path.relative(root, file).split(path.sep).join("/"), file);
      }
    }
    // CSS continues using its original assets. Copy any explicitly referenced media
    // image too, without shipping the entire historical backup directory.
    const cssDir = path.join(root, "assets/css");
    let cssFiles = [];
    try { cssFiles = await readdir(cssDir, { recursive: true }); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    for (const file of cssFiles.filter(file => file.endsWith(".css"))) {
      const css = await readFile(path.join(cssDir, file), "utf8");
      const url = `/assets/css/${file.split(path.sep).join("/")}`;
      for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) await preserveMedia(match[1], url);
    }
  }

  async function preserveMedia(source, pageUrl) {
    const relative = imagePath(source, pageUrl);
    if (!relative?.startsWith("media/") || !isSameOrigin(source, pageUrl) || !inventory.has(relative)) return;
    if (!copied.has(relative)) copied.set(relative, (async () => {
      const destination = path.join(outputDir, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(inventory.get(relative), destination);
    })());
    await copied.get(relative);
  }

  async function generate(relative) {
    if (!generated.has(relative)) generated.set(relative, limited(async () => {
      const bytes = await readFile(inventory.get(relative));
      const metadata = await sharp(bytes).metadata();
      if ((metadata.pages || 1) > 1) return null; // Keep animations intact.
      const rotated = metadata.orientation >= 5 && metadata.orientation <= 8;
      const width = rotated ? metadata.height : metadata.width;
      const height = rotated ? metadata.width : metadata.height;
      const widths = [...new Set([...WIDTHS.filter(size => size < width), Math.min(width, WIDTHS.at(-1))])];
      const hash = createHash("sha256").update(bytes).update(JSON.stringify({ WIDTHS, ENCODING, sharp: sharp.versions.sharp, vips: sharp.versions.vips })).digest("hex").slice(0, 20);
      const variants = [];
      for (const size of widths) {
        const filename = `${hash}-${size}.webp`;
        const cached = path.join(cacheDir, filename);
        await mkdir(cacheDir, { recursive: true });
        if (!(await exists(cached))) {
          await sharp(bytes).rotate().resize({ width: size, withoutEnlargement: true }).webp(ENCODING).toFile(cached);
        }
        const destination = path.join(outputDir, OUTPUT_PATH, filename);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(cached, destination);
        const byteLength = (await stat(cached)).size;
        variants.push({ width: size, url: `/${OUTPUT_PATH}/${filename}`, bytes: byteLength });
        summary.generatedBytes += byteLength;
        summary.variants++;
      }
      summary.optimizedSources++;
      summary.originalBytes += bytes.length;
      return { width, height, variants };
    }));
    return generated.get(relative);
  }

  async function transform(content, pageUrl = "/") {
    if (!inventory) throw new Error("Image pipeline must be prepared before transforming HTML.");
    const nodes = elements(parse(content, { sourceCodeLocationInfo: true }));
    const changes = [];
    for (const node of nodes) {
      const attrs = attributes(node);
      for (const name of ["src", "href", "poster", "data-lightbox-src"]) {
        if (attrs.has(name)) await preserveMedia(attrs.get(name), pageUrl);
      }
      if (attrs.get("srcset")) {
        for (const candidate of attrs.get("srcset").split(",")) await preserveMedia(candidate.trim().split(/\s+/)[0], pageUrl);
      }
      if (node.tagName !== "img" || !attrs.get("src") || attrs.has("data-no-optimize") || attrs.get("srcset") || node.parentNode?.tagName === "picture") continue;
      const original = attrs.get("src");
      const relative = imagePath(original, pageUrl);
      if (!relative || !inventory.has(relative)) continue;
      const result = await generate(relative);
      if (!result) continue;
      const fallback = result.variants.find(variant => variant.width >= 640) || result.variants.at(-1);
      attrs.set("src", fallback.url);
      attrs.set("srcset", result.variants.map(variant => `${variant.url} ${variant.width}w`).join(", "));
      attrs.set("sizes", imageSizes(node, attrs));
      attrs.set("data-original-src", original);
      if (attrs.has("data-lightbox") && !attrs.has("data-lightbox-src")) attrs.set("data-lightbox-src", original);
      if (!attrs.has("decoding")) attrs.set("decoding", "async");
      reserveDimensions(attrs, result.width, result.height);
      const location = node.sourceCodeLocation?.startTag;
      if (!location) continue;
      const tag = `<img${[...attrs].map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join("")}>`;
      changes.push({ start: location.startOffset, end: location.endOffset, tag });
      summary.optimizedTags++;
    }
    for (const change of changes.sort((a, b) => b.start - a.start)) content = content.slice(0, change.start) + change.tag + content.slice(change.end);
    return content;
  }

  return { prepare, transform, summary: () => ({ ...summary }) };
}
