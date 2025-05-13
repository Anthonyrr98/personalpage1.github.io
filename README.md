
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
