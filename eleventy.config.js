import footnote from "markdown-it-footnote";
import { createImagePipeline } from "./scripts/images.js";
import { cleanGeneratedOutput } from "./scripts/clean_output.js";
import { createLifeYearIndex, scopeFootnotes, syncLegacyLifeAnchors } from "./scripts/life_content.js";

export default function (eleventyConfig) {
  const images = createImagePipeline();
  const lifeYears = createLifeYearIndex();
  eleventyConfig.on("eleventy.before", async ({ directories }) => {
    lifeYears.reset();
    await cleanGeneratedOutput(directories.output);
    await images.prepare(directories.output);
  });
  eleventyConfig.on("eleventy.after", () => {
    const stats = images.summary();
    console.log(`[images] Optimized ${stats.optimizedTags} image tags from ${stats.optimizedSources} originals; ${stats.variants} responsive variants (${(stats.generatedBytes / 1048576).toFixed(2)} MiB).`);
  });
  eleventyConfig.addTransform("responsive-images", function (content) {
    return (this.page.outputPath || "").endsWith(".html") ? images.transform(content, this.page.url) : content;
  });
  eleventyConfig.addTransform("legacy-life-years", function (content) {
    return /^\/media\/pages\/work\/work\/work(?:1[0-5]|[1-9])\.html$/.test(this.page.url)
      ? syncLegacyLifeAnchors(content) : content;
  });
  eleventyConfig.addWatchTarget("media/**/*.{jpg,JPG,jpeg,png,webp}");
  eleventyConfig.addWatchTarget("assets/images/**/*.{jpg,JPG,jpeg,png,webp}");
  eleventyConfig.amendLibrary("md", (markdown) => scopeFootnotes(markdown.use(footnote)));
  eleventyConfig.addCollection("life", (collection) => collection.getFilteredByTag("life"));
  eleventyConfig.addFilter("formatDate", (value) => {
    const date = new Date(value);
    return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
  });
  eleventyConfig.addFilter("isoDate", (value) => new Date(value).toISOString().slice(0, 10));
  eleventyConfig.addFilter("rssDate", (value) => new Date(value).toUTCString());
  eleventyConfig.addFilter("lifeYearStart", (entries, index) =>
    index === 0 || new Date(entries[index].date).getUTCFullYear() !== new Date(entries[index - 1].date).getUTCFullYear());
  eleventyConfig.addFilter("lifeYear", (value) => new Date(value).getUTCFullYear());
  eleventyConfig.addFilter("lifeYearLinks", (entries) => lifeYears.links(entries));
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
