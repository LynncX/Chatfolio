#!/usr/bin/env bash
# gen-katex-inline.sh — build vendor/katex/katex-inline.css from katex.min.css + fonts/
#
# 背景: Chatfolio 导出的 .html 是独立文件, 打开时不能依赖扩展目录。
# 公式渲染方案: 导出时把 KaTeX CSS + 全部 woff2 字体以 data-URI 形式内联进
# 导出文件 (仅当检测到公式时)。本脚本把 katex.min.css 里的 woff/ttf 回退源
# 删掉、woff2 引用替换为 base64 data URI, 产出单文件 katex-inline.css。
#
# 用法:   ./tools/gen-katex-inline.sh
# 依赖:   node (仅标准库), vendor/katex/{katex.min.css,fonts/*.woff2}
# 输入:   vendor/katex/katex.min.css
# 输出:   vendor/katex/katex-inline.css
# 重跑时机: 升级 vendor/katex 里的 KaTeX 版本后
set -euo pipefail
cd "$(dirname "$0")/../vendor/katex"

node -e '
const fs = require("fs");
let css = fs.readFileSync("katex.min.css", "utf8");
css = css.replace(/src:url\((fonts\/[^)]+\.woff2)\) format\("woff2"[^}]*\)/g,
  (m, p) => {
    const b64 = fs.readFileSync(p).toString("base64");
    return `src:url(data:font/woff2;base64,${b64}) format("woff2")`;
  });
// drop leftover woff/ttf fallback src lists that survived (each @font-face now
// has a single data-URI src; older pattern had multiple url() in one src)
css = css.replace(/,url\(fonts\/[^)]+\) format\("(woff|truetype|opentype)"\)/g, "");
fs.writeFileSync("katex-inline.css", css);
console.log(`wrote katex-inline.css (${(css.length / 1024).toFixed(0)} KB)`);
'
