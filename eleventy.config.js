export default function (eleventyConfig) {
  eleventyConfig.addFilter("formatDate", (value) => {
    const date = new Date(value);
    return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
  });
  eleventyConfig.addFilter("isoDate", (value) => new Date(value).toISOString().slice(0, 10));
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
