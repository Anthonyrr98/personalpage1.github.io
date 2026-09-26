import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pages = join(dirname(fileURLToPath(import.meta.url)), "..", "legacy", "work");
const hiddenMarker = "{# life-editor:hidden #}{% if false %}";

function plainText(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;?/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

export default function () {
  const records = [];
  for (let page = 1; page <= 15; page++) {
    const source = readFileSync(join(pages, `work${page}.njk`), "utf8");
    const starts = [...source.matchAll(/<div class="stream-lr">/g)];
    for (let index = 0; index < starts.length; index++) {
      const start = starts[index].index;
      if (source.slice(0, start).endsWith(hiddenMarker)) continue;
      const block = source.slice(start, starts[index + 1]?.index ?? source.length);
      const anchor = block.match(/<span id="(life-old-work\d+-\d+)" class="life-entry-anchor"><\/span>/);
      const title = block.match(/<h3 class="streamitem-title"[^>]*>([\s\S]*?)<\/h3>/);
      const date = block.match(/<span class="streamitem-date"[^>]*>([\s\S]*?<\/a>\s*<\/span>)/);
      const parts = date && plainText(date[1]).match(/(20\d{2})年\s*(\d{1,2})月\s*(?:(\d{1,2})[日号])?/);
      if (!anchor || !title || !parts) {
        throw new Error(`旧记录索引无法读取：work${page} 第 ${index + 1} 条`);
      }
      const [, year, month, day] = parts;
      records.push({
        year: Number(year), month: Number(month), day: Number(day || 0),
        date: `${Number(month)}月${day ? `${Number(day)}日` : ""}`,
        title: plainText(title[1]),
        url: `/media/pages/work/work/work${page}.html#${anchor[1]}`,
      });
    }
  }
  records.sort((a, b) => b.year - a.year || b.month - a.month || b.day - a.day);
  const years = [];
  for (const record of records) {
    let year = years.find((item) => item.year === record.year);
    if (!year) {
      year = { year: record.year, count: 0, months: [] };
      years.push(year);
    }
    year.count++;
    let month = year.months.find((item) => item.month === record.month);
    if (!month) {
      month = { month: record.month, entries: [] };
      year.months.push(month);
    }
    month.entries.push(record);
  }
  return { years, count: records.length };
}
