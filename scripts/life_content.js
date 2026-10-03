import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "parse5";

const HIDDEN_RECORD = /\{# life-editor:hidden #\}\{% if false %\}[\s\S]*?\{% endif %\}\{# life-editor:end #\}/g;

function attributes(node) {
  return new Map((node.attrs || []).map(({ name, value }) => [name, value]));
}

function hasClass(node, name) {
  return (attributes(node).get("class") || "").split(/\s+/).includes(name);
}

function elements(node, result = []) {
  if (node.tagName) result.push(node);
  for (const child of node.childNodes || []) elements(child, result);
  return result;
}

function textContent(node) {
  return node.value || (node.childNodes || []).map(textContent).join("");
}

function legacyRecords(html) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const records = elements(document).filter(node => hasClass(node, "stream-lr"));
  return { document, records: records.flatMap(node => {
    const stamp = elements(node).find(child => hasClass(child, "streamitem-date"));
    const year = stamp && textContent(stamp).match(/^\s*(\d{4})\s*年/);
    return year && node.sourceCodeLocation ? [{ node, year: Number(year[1]) }] : [];
  }) };
}

/** Each rendered record supplies its own footnote ID namespace, including list views. */
export function scopeFootnotes(markdown) {
  markdown.core.ruler.before("footnote_tail", "footnote-document-id", (state) => {
    const identity = state.env.page?.inputPath || state.env.page?.url || state.src;
    state.env.docId = createHash("sha256").update(identity).digest("hex").slice(0, 20);
  });
  return markdown;
}

/** Derive anchors from the final rendered HTML, after hidden records have disappeared. */
export function syncLegacyLifeAnchors(html) {
  const { document, records } = legacyRecords(html);
  const edits = [];
  for (const node of elements(document)) {
    if (hasClass(node, "life-year-anchor") && /^life-year-\d+$/.test(attributes(node).get("id") || "")) {
      const location = node.sourceCodeLocation;
      if (location) edits.push({ start: location.startOffset, end: location.endOffset, value: "" });
    }
  }
  const years = new Set();
  for (const { node, year } of records) {
    if (years.has(year)) continue;
    years.add(year);
    edits.push({ start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.startOffset,
      value: `<span id="life-year-${year}" class="life-year-anchor"></span>\n` });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    html = html.slice(0, edit.start) + edit.value + html.slice(edit.end);
  }
  return html;
}

/** Read visible historical years once per build; the editor's hidden blocks never add links. */
export function createLifeYearIndex({ root = process.cwd() } = {}) {
  let historical;
  return {
    reset() { historical = undefined; },
    links(entries = []) {
      if (!historical) {
        historical = new Map();
        for (let number = 1; number <= 15; number++) {
          let source;
          try { source = readFileSync(path.join(root, "src", "legacy", "work", `work${number}.njk`), "utf8"); }
          catch (error) { if (error.code === "ENOENT") continue; throw error; }
          for (const { year } of legacyRecords(source.replace(HIDDEN_RECORD, "")).records) {
            if (!historical.has(year)) historical.set(year, `/media/pages/work/work/work${number}.html#life-year-${year}`);
          }
        }
      }
      const links = new Map(historical);
      const recent = entries.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
      const modernYears = new Map();
      recent.forEach((entry, index) => {
        const year = new Date(entry.date).getUTCFullYear();
        const page = Math.floor(index / 10);
        modernYears.set(year, `${page ? `/work/page/${page + 1}/` : "/work.html"}#life-year-${year}`);
      });
      for (const [year, url] of modernYears) if (!links.has(year)) links.set(year, url);
      return [...links].sort(([a], [b]) => b - a).map(([year, url]) => ({ year, url }));
    },
  };
}
