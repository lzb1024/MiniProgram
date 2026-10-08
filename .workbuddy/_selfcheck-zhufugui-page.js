// 朱富贵计算页结构自检（离线）
const fs = require('fs');
const path = require('path');

const ROOT = 'E:/3_WorkSpace/MiniProgram';
const DIR = path.join(ROOT, 'pages/zhufugui');

let bad = 0;
const ok = (m) => console.log('OK   ' + m);
const no = (m) => { bad++; console.log('FAIL ' + m); };

const wxml = fs.readFileSync(path.join(DIR, 'index.wxml'), 'utf8');
const js = fs.readFileSync(path.join(DIR, 'index.js'), 'utf8');
const json = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));

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
  let e = m[1]
    .replace(/'[^']*'|"[^"]*"/g, ' ')
    .replace(/\.[A-Za-z_$][\w$]*/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ');
  for (const i of e.matchAll(/[A-Za-z_$][\w$]*/g)) roots.add(i[0]);
}
const kw = new Set(['true', 'false', 'null', 'undefined', 'index', 'item', 'c']);
const missD = [...roots].filter((r) => !kw.has(r) && !declared.has(r));
missD.length ? no('模板引用但 data 未声明: ' + missD.join(', ')) : ok(`data 字段引用全部有声明（${declared.size} 个键）`);

/* 3. usingComponents 必须是两段写法 */
const comps = json.usingComponents || {};
const badPath = Object.entries(comps).filter(([, p]) => {
  const seg = p.replace(/^tdesign-miniprogram\//, '').split('/');
  return !p.startsWith('tdesign-miniprogram/') || seg.length < 2;
});
badPath.length
  ? no('usingComponents 不是两段写法: ' + JSON.stringify(badPath))
  : ok('usingComponents 均为两段写法（tdesign-miniprogram/x/x）');

/* 4. 标签与声明一致 */
const tags = new Set();
for (const m of wxml.matchAll(/<([a-z]+-[a-z-]+)[\s/>]/g)) tags.add(m[1]);
const undeclared = [...tags].filter((t) => !Object.keys(comps).includes(t));
undeclared.length ? no('使用未声明组件: ' + undeclared.join(', ')) : ok(`自定义组件 ${tags.size} 个均已声明`);

/* 5. 图标名存在于字体表 */
const iconCss = path.join(ROOT, 'node_modules/tdesign-miniprogram/miniprogram_dist/icon/icon.wxss');
if (fs.existsSync(iconCss)) {
  const sheet = fs.readFileSync(iconCss, 'utf8');
  const names = new Set();
  for (const m of wxml.matchAll(/name="([a-z0-9-]+)"/g)) names.add(m[1]);
  const unknown = [...names].filter((n) => !sheet.includes('.t-icon-' + n + ':'));
  unknown.length ? no('图标字体里不存在: ' + unknown.join(', ')) : ok(`图标名 ${names.size} 个均存在于 TDesign`);
}

/* 6. 工具页入口图标 / 路由 / 注册 */
const toolsJs = fs.readFileSync(path.join(ROOT, 'pages/tools/index.js'), 'utf8');
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const url = '/pages/zhufugui/index';
toolsJs.includes(`url: '${url}'`) ? ok('pages/tools 入口已挂') : no('pages/tools 未挂入口');
appJson.pages.includes(url.replace(/^\//, '')) ? ok('app.json 已注册该页面') : no('app.json 未注册');
// 工具页所有图标也要存在
if (fs.existsSync(iconCss)) {
  const sheet = fs.readFileSync(iconCss, 'utf8');
  // 只查 TOOLS 清单里的图标；wx.showToast 的 icon: 'none' 不是 TDesign 图标，别捞进来
  const toolsBlock = toolsJs.slice(toolsJs.indexOf('const TOOLS'), toolsJs.indexOf('Page({'));
  const toolIcons = [...toolsBlock.matchAll(/icon:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
  const badIcon = toolIcons.filter((n) => !sheet.includes('.t-icon-' + n + ':'));
  badIcon.length ? no('工具页图标不存在: ' + badIcon.join(', ')) : ok(`工具页 ${toolIcons.length} 个图标均存在`);
}

/* 7. 单位价格不得与 utils 里的口径漂移（抽样断言） */
const util = fs.readFileSync(path.join(ROOT, 'utils/zhufugui.js'), 'utf8');
const rate = /MEMBER_RATE = ([\d.]+)/.exec(util);
rate && rate[1] === '0.68' ? ok('会员折扣 0.68 与需求一致') : no('会员折扣常数异常: ' + (rate && rate[1]));

console.log(bad ? `\n${bad} 项失败` : '\n全部通过');
process.exit(bad ? 1 : 0);
