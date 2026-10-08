#!/usr/bin/env node
/**
 * _slice.js — 从预览里切出任意两个锚点之间的片段，单独存成 _check.html 便于截图核对
 *
 *   用法（在 .workbuddy 目录下）：
 *     node _slice.js sec-budget sec-packing
 *
 *   产物：.workbuddy/_check.html
 *
 * 为什么需要它
 * ----------------------------------------------------------------------
 * 首页现在有 8 个区块、一万多像素高，而 msedge --headless 的 --screenshot
 * **只截窗口可视区，不会滚动**，一张图根本看不完。
 * 把要核对的两段单独切出来，再用窄窗口（如 430x2400）截，一屏一个片段。
 *
 * 切片来源优先用 preview/_screens/1-home.html（未包壳的片段），
 * 找不到就退回 preview/interface-preview.html 的「整页视图」段。
 * 输出会带上预览里的 <style> 与图标雪碧图，所以能独立渲染。
 *
 * 核对完记得删掉 _check.html 与临时 png。
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..');
const BUILT = path.join(ROOT, 'preview', 'interface-preview.html');
const FRAGMENT_HOME = path.join(ROOT, 'preview', '_screens', '1-home.html');
const OUT = path.join(HERE, '_check.html');

const [, , startAnchor, endAnchor] = process.argv;

if (!startAnchor) {
  console.error(
    '用法： node _slice.js <起始锚点> [结束锚点]\n' +
      '例：   node _slice.js sec-budget sec-packing\n' +
      '       node _slice.js sec-packing          # 只给起始锚点则切到片段末尾'
  );
  process.exit(2);
}

if (!fs.existsSync(BUILT)) {
  console.error(`找不到 ${BUILT}，先跑一次 build-preview.js 重建预览。`);
  process.exit(2);
}

const built = fs.readFileSync(BUILT, 'utf8');

/* ---- 1. 取出可复用的头部：<style> 与雪碧图 ---- */
const styleMatch = /<style>([\s\S]*?)<\/style>/.exec(built);
const spriteMatch = /(<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" style="display:none">[\s\S]*?<\/svg>)/.exec(built);

if (!styleMatch || !spriteMatch) {
  console.error('预览文件结构不符合预期（找不到 <style> 或雪碧图），先重建预览。');
  process.exit(2);
}

/* ---- 2. 决定切片来源 ---- */
let source;
let label;
if (fs.existsSync(FRAGMENT_HOME)) {
  source = fs.readFileSync(FRAGMENT_HOME, 'utf8');
  label = '1-home 片段';
} else {
  // 退回「整页视图」里的第一屏
  const fullStart = built.indexOf('<div class="stage-full">');
  const pageStart = built.indexOf('<page class="page">', fullStart);
  const pageEnd = built.indexOf('</page>', pageStart);
  source = built.slice(pageStart + '<page class="page">'.length, pageEnd);
  label = '预览整页视图第 1 屏';
}

/* ---- 3. 按锚点切 ---- */
/** 找到 id="xxx" 所在元素的起始位置（往前回退到它所属的 <div / <view 标签开头） */
function anchorStart(src, anchor) {
  const hit = src.indexOf(`id="${anchor}"`);
  if (hit === -1) return -1;
  const lt = src.lastIndexOf('<', hit);
  return lt === -1 ? hit : lt;
}

const from = anchorStart(source, startAnchor);
if (from === -1) {
  console.error(`在${label}里找不到锚点 id="${startAnchor}"。`);
  process.exit(2);
}

let to = source.length;
if (endAnchor) {
  const e = anchorStart(source, endAnchor);
  if (e === -1) {
    console.error(`在${label}里找不到结束锚点 id="${endAnchor}"。`);
    process.exit(2);
  }
  if (e <= from) {
    console.error('结束锚点在起始锚点之前，检查参数顺序。');
    process.exit(2);
  }
  to = e;
}

const slice = source.slice(from, to);

/* ---- 4. 组装独立可渲染的 _check.html ---- */
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>片段核对 · ${startAnchor}${endAnchor ? ' → ' + endAnchor : ''}</title>
<style>${styleMatch[1]}</style>
</head>
<body>
${spriteMatch[1]}
<div class="sub">${label} · ${startAnchor}${endAnchor ? ' → ' + endAnchor : ' → 末尾'}</div>
<div class="stage-full">
  <div class="full-wrap"><div class="cap">${startAnchor}</div><div class="full-frame"><page class="page">${slice}</page></div></div>
</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');

const openTags = (slice.match(/<div\b/g) || []).length;
const closeTags = (slice.match(/<\/div>/g) || []).length;
console.log(
  `WROTE ${path.relative(ROOT, OUT)}  ${Buffer.byteLength(html)} bytes  ` +
    `(${label}，${startAnchor}${endAnchor ? ' → ' + endAnchor : ''}，片段 ${Buffer.byteLength(slice)} bytes)`
);

if (openTags !== closeTags) {
  console.warn(
    `\n警告：切片里 <div> ${openTags} 个但 </div> ${closeTags} 个，不配对。\n` +
      '        多半是结束锚点落在一个嵌套 div 的中间，换成区块级的 id 再试。\n'
  );
}
