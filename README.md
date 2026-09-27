# 赵荣力的个人网站

个人介绍、文章、生活记录、工具资源和两个科研计算器。网站由 Eleventy 生成静态 HTML，计算器与图片预览使用原生 JavaScript，发布到 GitHub Pages。

**网站地址：** [www.rlzhao.com](https://www.rlzhao.com/)

## 本地开发

使用 Node.js 24（见 `.nvmrc`）和 Python 3.11 或更新版本。首次安装及预览：

```bash
npm ci
npm run dev
```

`npm run dev` 会启动本地预览服务。发布前运行：

```bash
npm run build
python tests/check_links.py _site
python tests/browser_smoke.py _site
```

浏览器检查需要 Playwright 和 Chromium；CI 使用 Python 3.12 与 Playwright 1.62.0。首次本地运行前安装：

```bash
python -m pip install playwright==1.62.0
python -m playwright install chromium
```

`_site/` 是生成结果，不提交到 Git。所有页面改动应在源码中完成。`check_links.py` 校验生成结果中的站内页面、资源、页内锚点和文件名大小写；`browser_smoke.py` 校验主要页面、文章跳转、图片预览与两个计算器。两项检查都不验证外部网址或远程图片是否在线。

## 源码位置

| 路径 | 用途 |
| --- | --- |
| `src/_includes/layouts/base.njk` | 全站 HTML、meta、导航和页脚的入口 |
| `src/_includes/partials/` | 导航、页脚与生活记录展示 |
| `src/pages/` | 首页、文章列表、生活记录列表、关于和工具页 |
| `src/articles/` | 旧文章；保留原有 URL，新文章也可放在这里 |
| `src/life/` | 每篇一文件的生活记录 |
| `src/legacy/work/` | 保留原 URL 的 15 个历史生活记录分页 |
| `src/calculators/` | 两个计算器页面与公式 |
| `assets/`、`highlight/`、`media/` | 静态样式、脚本和图片；构建时复制到输出目录 |
| `eleventy.config.js` | 静态文件复制、日期格式等少量构建配置 |

### 新增文章

在 `src/articles/` 新建 Markdown 文件。文件开头包含以下元信息，正文接在第二个 `---` 后；文章列表会自动更新：

```yaml
---
layout: layouts/base.njk
permalink: /articles/example/
title: 示例文章｜赵荣力
description: 页面描述和分享摘要。
cardTitle: 示例文章
summary: 列表中的一句介绍。
category: 编程
cover: /assets/images/example.jpg
date: 2026-09-26
tags: [article]
activeNav: articles
isArticle: true
---
```

`permalink` 一经发布应保持稳定。旧文章继续输出原有 `/media/pages/articles/.../*.html` 地址。文章有可放大的图片时，在图片上加 `data-lightbox`，并在元信息中加 `hasLightbox: true`；代码高亮只在需要时加 `hasHighlight: true`。

### 新增生活记录

Windows 上可以直接双击仓库根目录的 `life_editor.pyw`，它会在浏览器里打开一个仅供本机访问的编辑页面。在页面里填写标题、日期、正文，选择本地照片或粘贴 OSS 链接，然后点击 **只生成文件** 或 **发布到网站**。HTTP 图片会先导入本地草稿，再随记录上传到网站；HTTPS 直链保持原样。输入会自动保存，关闭页面后下次打开可继续；草稿及暂存的照片保存在 `drafts/`，不会提交到 Git。页面只监听 `127.0.0.1`，30 分钟没有操作会自动退出，也可点击页面底部的“关闭编辑器”。发布按钮只在本地 `main` 与 GitHub 最新 `main` 一致、暂存区为空时工作；它会只提交本条记录和复制的照片，并推送到 GitHub。如果文件已提交但推送失败，编辑器会保留这次提交的状态，重新打开后可点击 **继续推送本次提交**，无需重新生成记录。GitHub Actions 构建完成后网站才会更新。

如果习惯编辑文件，也可先运行一次 `npm run life:init`，编辑 `drafts/life.toml` 中的标题、日期、正文和照片，再运行 `npm run life:new`。两个入口共用同一套生成逻辑。模板文件已加入 `.gitignore`，草稿不会被提交。生成器会在 `src/life/` 新建 Markdown 记录，不会覆盖已有记录；本地照片会复制到 `assets/images/life/`，OSS HTTPS 直链会直接保留，不会下载到仓库。图片可混用两种来源。

```bash
npm run life:init
# 编辑 drafts/life.toml
npm run life:new
npm run build
python tests/check_links.py _site
git add src/life
# 如果复制了本地照片，再运行：git add assets/images/life
git commit -m "Add life entry"
git push origin main
```

如果本地不在 `main` 分支，请先通过拉取请求合并，不要直接推送当前分支。推送到 `main` 后 GitHub Actions 自动发布。生成器只负责在本地创建文件和复制照片；它不会替你提交或推送。为避免仓库和页面过大，本地单张照片限制为 20 MB，较大的图片建议先压缩或使用 OSS。OSS 请使用长期有效的公开 HTTPS 直链，不要使用会过期的签名 URL。

也可以直接在 `src/life/` 新建 Markdown 文件。`date` 决定列表顺序，`photos` 是可选图片列表；新记录自动出现在 `work.html`，满 10 条后生成下一页。每条记录也有稳定的独立地址。

```yaml
---
layout: layouts/life.njk
permalink: /life/2026-09-26-example/
title: 今天的记录
description: 一句话简介。
date: 2026-09-26
tags: [life]
photos:
  - src: /assets/images/example.jpg
    alt: 描述图片内容
---
```

历史 `work1.html` 至 `work15.html` 保留原地址和内容。新记录不需要改这些历史页。

## 发布

`.github/workflows/site-check.yml` 在拉取请求中构建并检查；在 `main` 分支上检查通过后，上传 `_site/` 并部署到 GitHub Pages。首次切换时，需在仓库的 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**，并确认自定义域名设置仍为预期值。自定义 Actions 发布不依赖仓库根目录的 `CNAME` 文件；此文件保留用于原有发布方式的回退。切换前应先核对生成的旧页面 URL 和线上域名。

业务页面目前仍通过 `assets/js/analytics.js` 加载百度统计、51.la 和 Google Analytics；`verification.html` 不加载统计。外部图片、MathJax 和统计脚本的可用性不在离线检查范围内。

仓库根目录没有单独的项目许可证；`highlight/` 保留了第三方资源的许可证。
