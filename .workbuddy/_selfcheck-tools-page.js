// 工具页结构自检（离线）
const fs = require('fs');
const ROOT = 'E:/3_WorkSpace/MiniProgram';
const wxml = fs.readFileSync(ROOT + '/pages/tools/index.wxml', 'utf8');
const js = fs.readFileSync(ROOT + '/pages/tools/index.js', 'utf8');

let bad = 0;
const ok = (m) => console.log('OK   ' + m);
const no = (m) => { bad++; console.log('FAIL ' + m); };

/* 1. 事件处理器 */
const bound = new Set();
for (const m of wxml.matchAll(/\b(?:bind|catch)[a-z]*="([A-Za-z_$][\w$]*)"/g)) bound.add(m[1]);
const missH = [...bound].filter((h) => !new RegExp('\\b' + h + '\\s*\\(', 'm').test(js));
missH.length ? no('模板绑定但未实现: ' + missH.join(', ')) : ok(`事件处理器 ${bound.size} 个全部实现`);

/* 2. data 字段根标识符 */
const dataBlock = js.slice(js.indexOf('data: {'), js.indexOf('onLoad('));
const declared = new Set();
for (const m of dataBlock.matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*:/gm)) declared.add(m[1]);
const roots = new Set();
for (const m of wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
  let e = m[1].replace(/'[^']*'|"[^"]*"/g, ' ').replace(/\.[A-Za-z_$][\w$]*/g, ' ');
  for (const i of e.matchAll(/[A-Za-z_$][\w$]*/g)) roots.add(i[0]);
}
const kw = new Set(['true', 'false', 'null', 'undefined', 'index', 'item']);
const missD = [...roots].filter((r) => !kw.has(r) && !declared.has(r));
missD.length ? no('模板引用但 data 未声明: ' + missD.join(', ')) : ok(`data 字段引用全部有声明（${declared.size} 个键）`);

/* 3. 工具条目字段齐全 */
const toolsBlock = js.slice(js.indexOf('const TOOLS'), js.indexOf('Page({'));
const items = [...toolsBlock.matchAll(/\{[^{}]*id:\s*'([a-z-]+)'[^{}]*\}/g)];
let okItems = 0;
for (const it of items) {
  if (['title', 'desc', 'icon', 'url'].every((k) => it[0].includes(k + ':'))) okItems++;
}
okItems === items.length && items.length
  ? ok(`工具条目 ${items.length} 条，字段齐全`)
  : no(`工具条目字段缺失（${okItems}/${items.length}）`);

/* 4. 入口 url 指向的页面存在且已注册 */
const appJson = JSON.parse(fs.readFileSync(ROOT + '/app.json', 'utf8'));
const urls = [...toolsBlock.matchAll(/url:\s*'([^']+)'/g)].map((m) => m[1]).filter(Boolean);
for (const u of urls) {
  const p = u.replace(/^\//, '');
  const reg = appJson.pages.includes(p);
  const exists = fs.existsSync(ROOT + '/' + p + '.json');
  reg && exists ? ok(`入口 ${u} 已注册且文件存在`) : no(`入口 ${u} 注册=${reg} 文件存在=${exists}`);
}

/* 5. 旧工具名不得再出现 */
const GONE = ['打包清单工具', '花费记账', '交通汇总', '单位换算', '时差换算', 'GROUPS', 'tgroup__head'];
const hit = GONE.filter((k) => wxml.includes(k) || js.includes(k));
hit.length ? no('残留旧工具引用: ' + hit.join(', ')) : ok('无旧工具 / 旧分组结构残留');

console.log(bad ? `\n${bad} 项失败` : '\n全部通过');
process.exit(bad ? 1 : 0);
