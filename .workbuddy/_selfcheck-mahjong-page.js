// 麻将记分页结构自检（离线）
// 目标：wxml 里绑定的事件都在 page 上实现；引用的 data 字段都在 data 里声明；
//       usingComponents 与 wxml 标签一致；只允许白名单里的图标名。
const fs = require('fs');
const path = require('path');

const ROOT = 'E:/3_WorkSpace/MiniProgram';
const DIR = path.join(ROOT, 'pages/mahjong');

let bad = 0;
const ok = (m) => console.log('OK   ' + m);
const no = (m) => {
  bad++;
  console.log('FAIL ' + m);
};

const wxml = fs.readFileSync(path.join(DIR, 'index.wxml'), 'utf8');
const js = fs.readFileSync(path.join(DIR, 'index.js'), 'utf8');
const json = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));

/* 1. 事件处理器 */
const bound = new Set();
for (const m of wxml.matchAll(/\b(?:bind|catch)[a-z]*="([A-Za-z_$][\w$]*)"/g)) bound.add(m[1]);
const missingHandlers = [...bound].filter((h) => !new RegExp('\\b' + h + '\\s*\\(', 'm').test(js));
missingHandlers.length ? no('模板绑定但页面未实现: ' + missingHandlers.join(', ')) : ok(`事件处理器 ${bound.size} 个全部实现`);

/* 2. data 字段：wxml 里 {{ ... }} 中的**根标识符**
   只看：表达式的开头，以及 `.` 之后的都不是根（那是属性访问）；
   再去掉字符串字面量里的内容与对象字面量的键。 */
const KNOWN_GLOBALS = new Set(['true', 'false', 'null', 'undefined', 'index', 'item']);
const usedRoots = new Set();
for (const m of wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
  let expr = m[1];
  // 抹掉字符串字面量（单/双引号），其中的 'setup' / '#1E6B5A' 都不算标识符
  expr = expr.replace(/'[^']*'|"[^"]*"/g, ' ');
  // 抹掉属性访问：.xxx
  expr = expr.replace(/\.[A-Za-z_$][\w$]*/g, ' ');
  // 对象字面量的键：  { key: ... }  —— 只保留值，键去掉
  expr = expr.replace(/([A-Za-z_$][\w$]*)\s*:/g, ' ');
  for (const id of expr.matchAll(/[A-Za-z_$][\w$]*/g)) usedRoots.add(id[0]);
}
// data 段里的键
const dataBlock = js.slice(js.indexOf('data: {'), js.indexOf('onLoad('));
const declared = new Set();
for (const m of dataBlock.matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*:/gm)) declared.add(m[1]);
const localAliases = new Set(['tool', 'p', 'r', 'x', 't']);
const missingData = [...usedRoots].filter(
  (r) => !KNOWN_GLOBALS.has(r) && !declared.has(r) && !localAliases.has(r),
);
missingData.length ? no('模板引用但 data 未声明: ' + missingData.join(', ')) : ok(`data 字段引用全部有声明（data 键 ${declared.size} 个）`);

/* 3. usingComponents 与标签一致 */
const tags = new Set();
for (const m of wxml.matchAll(/<([a-z]+-[a-z-]+)[\s/>]/g)) tags.add(m[1]);
const comps = Object.keys(json.usingComponents || {});
const undeclared = [...tags].filter((t) => !comps.includes(t));
undeclared.length ? no('使用了未声明的自定义组件: ' + undeclared.join(', ')) : ok(`自定义组件 ${tags.size} 个均已声明`);

/* 4. 图标名白名单（TDesign v1 单段路径下 miniprogram_dist/icon/icon.wxss 定义） */
const iconCss = path.join(ROOT, 'node_modules/tdesign-miniprogram/miniprogram_dist/icon/icon.wxss');
if (fs.existsSync(iconCss)) {
  const sheet = fs.readFileSync(iconCss, 'utf8');
  const iconNames = new Set();
  for (const m of wxml.matchAll(/name="([a-z0-9-]+)"/g)) iconNames.add(m[1]);
  // t-icon 的 name 也可能来自 js（tools 页的 GROUPS），这里只查本页字面量
  const unknown = [...iconNames].filter((n) => n !== '{{' && !sheet.includes('.t-icon-' + n + ':'));
  unknown.length ? no('图标字体里不存在: ' + unknown.join(', ')) : ok(`图标名 ${iconNames.size} 个均存在于 TDesign`);
} else {
  console.log('SKIP 未找到 TDesign 图标字体（未构建 npm），跳过图标名校验');
}

/* 5. 路由注册 */
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
appJson.pages.includes('pages/mahjong/index') ? ok('app.json 已注册 pages/mahjong/index') : no('app.json 未注册该页面');

/* 6. 工具页入口指向本页 */
const toolsJs = fs.readFileSync(path.join(ROOT, 'pages/tools/index.js'), 'utf8');
/url:\s*'\/pages\/mahjong\/index'/.test(toolsJs) ? ok('pages/tools 入口已指向本页') : no('pages/tools 未挂入口');

console.log(bad ? `\n${bad} 项失败` : '\n全部通过');
process.exit(bad ? 1 : 0);
