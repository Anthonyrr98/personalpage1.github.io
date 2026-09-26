import footnote from "markdown-it-footnote";

export default function (eleventyConfig) {
  eleventyConfig.amendLibrary("md", (markdown) => markdown.use(footnote));
  eleventyConfig.addFilter("formatDate", (value) => {
    const date = new Date(value);
    return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
  });
  eleventyConfig.addFilter("isoDate", (value) => new Date(value).toISOString().slice(0, 10));
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
