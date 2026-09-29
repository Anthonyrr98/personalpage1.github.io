import footnote from "markdown-it-footnote";
import { readFileSync } from "node:fs";

export default function (eleventyConfig) {
  eleventyConfig.amendLibrary("md", (markdown) => markdown.use(footnote));
  eleventyConfig.addFilter("formatDate", (value) => {
    const date = new Date(value);
    return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
  });
  eleventyConfig.addFilter("isoDate", (value) => new Date(value).toISOString().slice(0, 10));
  eleventyConfig.addFilter("rssDate", (value) => new Date(value).toUTCString());
  eleventyConfig.addFilter("lifeYearStart", (entries, index) =>
    index === 0 || new Date(entries[index].date).getUTCFullYear() !== new Date(entries[index - 1].date).getUTCFullYear());
  eleventyConfig.addFilter("lifeYear", (value) => new Date(value).getUTCFullYear());
  eleventyConfig.addFilter("lifeYearLinks", (entries) => {
    const links = new Map();
    for (let number = 1; number <= 15; number++) {
      const page = readFileSync(new URL(`./src/legacy/work/work${number}.njk`, import.meta.url), "utf8");
      for (const match of page.matchAll(/<span class="streamitem-date">\s*(20\d{2})/g)) {
        const year = Number(match[1]);
        if (!links.has(year)) links.set(year, `/media/pages/work/work/work${number}.html#life-year-${year}`);
      }
    }
    const recent = entries.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const modernYears = new Map();
    recent.forEach((entry, index) => {
      const year = new Date(entry.date).getUTCFullYear();
      const page = Math.floor(index / 10);
      modernYears.set(year, `${page ? `/work/page/${page + 1}/` : "/work.html"}#life-year-${year}`);
    });
    for (const [year, url] of modernYears) if (!links.has(year)) links.set(year, url);
    return [...links].sort(([a], [b]) => b - a).map(([year, url]) => ({ year, url }));
  });
  eleventyConfig.addFilter("lifePager", (entryCount, legacyPage = 0, newPageIndex = 0) => {
    const total = 15 + Math.max(1, Math.ceil(Number(entryCount) / 10));
    const current = Number(legacyPage) || total - Number(newPageIndex);
    const url = (number) => number <= 15
      ? `/media/pages/work/work/work${number}.html`
      : number === total ? "/work.html" : `/work/page/${total - number + 1}/`;
    const page = (number) => ({ number, url: url(number), current: number === current });
    return {
      current, total,
      older: current > 1 ? page(current - 1) : null,
      newer: current < total ? page(current + 1) : null,
      nearby: [current - 1, current, current + 1].filter((number) => number >= 1 && number <= total).map(page),
      all: Array.from({ length: total }, (_, index) => page(index + 1)),
    };
  });
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("highlight");
  eleventyConfig.addPassthroughCopy("media/**/*.{jpg,JPG,png}");
  eleventyConfig.addPassthroughCopy("verification.html");

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site"
    },
    templateFormats: ["njk", "md"],
    markdownTemplateEngine: false,
    htmlTemplateEngine: false
  };
}
