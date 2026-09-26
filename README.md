
# 自己的个人网站
一开始写这个网站的时候纯纯小白，用纯用html，css和js来手搓了这些网页，没想到后来维护着这么麻烦。由于慢慢增添了很多功能，很多插件，所以这里写一份文档来记录这些插件怎么用的，防止自己老年痴呆忘了。
# 目录
- [插件](#插件)
    - [语法高亮使用](##语法高亮使用)
    - [文件树](##文件树)
    - [LaTex](##LaTex)












# 插件
## 语法高亮使用<br/>
在head里嵌入语法高亮

```html
        <link rel="stylesheet" type="text/css" href="https://rlzhao.com/highlight/styles/monokai.min.css">
        <script src="https://rlzhao.com/highlight/highlight.min.js"></script>
        <script>
            hljs.highlightAll();
        </script>
```
使用时例子
```html
        <pre>
            <code class="language-python">
                  print('Hello World!')
            </code>
        </pre> 
```
## 文件树<br/>

```
tree D:\github\personalpage1.github.io > tree.txt // 生成树
```
```
        personalpage1.github.io
        ├─assets
        │  ├─css
        │  │  ├─stylesheet
        │  │  └─templates
        │  ├─images
        │  │  ├─homepageicon
        │  │  ├─icon
        │  │  ├─tl
        │  │  └─weixin
        │  └─js
        ├─highlight
        │  ├─es
        │  │  └─languages
        │  ├─languages
        │  └─styles
        │      └─base16
        └─media
            └─pages
                ├─articles
                │  ├─20210920
                │  │  └─qingyanguzhen
                │  ├─20211128
                │  │  └─huaximifen
                │  ├─20220430
                │  │  └─qianlingshan
                │  ├─20220810
                │  │  └─buildblog
                │  ├─20230207
                │  ├─20230429
                │  └─20230503
                ├─tools
                └─work
                    └─work

```

## LaTex<br/>
引入MathJax插件

```html
        <!-- latex -->
        <script src="https://cdn.bootcss.com/mathjax/3.0.5/es5/tex-mml-chtml.js"></script>
```
使用时直接使用LaTex语法即可

## 访问统计

业务页面统一通过 `/assets/js/analytics.js` 加载百度统计、51.la 和 Google Analytics；`verification.html` 不加载统计。三个服务目前都保留，外部脚本异步加载。

统计脚本来源清单：

- `https://hm.baidu.com`
- `https://sdk.51.la`
- `https://www.googletagmanager.com`

部署内容安全策略时，`script-src` 需要考虑这些来源及本站自身脚本。统计服务还可能向其他域名发送请求；设置 `connect-src`、`img-src` 前应在实际部署环境检查网络请求。站内其他页面脚本也需要单独核对。

## 发布前检查

在仓库根目录运行：

```bash
python tests/check_links.py
python -m pip install playwright==1.62.0
python -m playwright install chromium
python tests/browser_smoke.py
```

链接检查覆盖 HTML 中引用的站内页面、静态资源和页内锚点，并按文件名大小写精确检查；浏览器检查覆盖首页、文章跳转、生活记录图片预览以及两个计算器的正常样例和错误输入。GitHub Actions 在 `main` 推送和拉取请求时执行相同检查。如需阻止检查未通过的代码直接进入 `main`，还需在仓库设置中将 `Site checks / check` 设为必需状态检查。
