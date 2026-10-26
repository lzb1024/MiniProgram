// 体重追踪页自检（离线，纯 Node，不 spawn）
//   ① 模板绑定的事件都实现了
//   ② 模板引用的 data 根字段都声明了
//   ③ canvas id / 绘制方法对得上
//   ④ utils/weight.js 的口径（统计、趋势分档、BMI、归一）
//   ⑤ 内置网页版数据完整性
// 跑法：node .workbuddy/_selfcheck-weight.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const wxml = fs.readFileSync(path.join(ROOT, 'pages/weight/index.wxml'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'pages/weight/index.js'), 'utf8');
const less = fs.readFileSync(path.join(ROOT, 'pages/weight/index.less'), 'utf8');
const W = require(path.join(ROOT, 'utils/weight'));
const seed = require(path.join(ROOT, 'utils/weight-seed'));

let bad = 0;
const ok = (m) => console.log('OK   ' + m);
const no = (m) => {
  bad++;
  console.log('FAIL ' + m);
};
const eq = (a, b, m) => (a === b ? ok(m + ' = ' + b) : no(m + ' 期望 ' + b + '，实际 ' + a));

/* ---------- ① 事件处理器 ---------- */
const bound = new Set();
for (const m of wxml.matchAll(/\b(?:bind|catch)[a-z]*="([A-Za-z_$][\w$]*)"/g)) bound.add(m[1]);
const missH = [...bound].filter((h) => !new RegExp('\\b' + h + '\\s*\\(', 'm').test(js));
missH.length ? no('模板绑定但未实现: ' + missH.join(', ')) : ok(`事件处理器 ${bound.size} 个全部实现`);

/* ---------- ② data 根字段 ---------- */
const dataBlock = js.slice(js.indexOf('data: {'), js.indexOf('onLoad('));
const declared = new Set();
for (const m of dataBlock.matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*:/gm)) declared.add(m[1]);
const roots = new Set();
for (const m of wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
  const e = m[1].replace(/'[^']*'|"[^"]*"/g, ' ').replace(/\.[A-Za-z_$][\w$]*/g, ' ');
  for (const i of e.matchAll(/[A-Za-z_$][\w$]*/g)) roots.add(i[0]);
}
const kw = new Set(['true', 'false', 'null', 'undefined', 'index', 'item']);
const missD = [...roots].filter((r) => !kw.has(r) && !declared.has(r));
missD.length ? no('模板引用但 data 未声明: ' + missD.join(', ')) : ok(`data 字段引用全部有声明（${declared.size} 个键）`);

/* ---------- ③ 关键 data 键齐不齐（页面按这些键渲染） ---------- */
const NEED = ['stat', 'statLabels', 'records', 'records.length', 'analysis', 'monthLabel', 'formDate', 'editOn', 'bmiOn', 'showW', 'showF'];
const missKey = NEED.filter((k) => !declared.has(k.split('.')[0]));
missKey.length ? no('缺关键 data 键: ' + missKey.join(', ')) : ok(`关键 data 键 ${NEED.length} 个齐全`);

/* ---------- ④ canvas 与方法 ---------- */
/#wtChart/.test(js) && /id="wtChart"/.test(wxml)
  ? ok('canvas 选择器与模板 id 一致')
  : no('canvas 选择器与模板 id 不一致');
['initChart', 'drawChart'].forEach((fn) => {
  new RegExp('\\b' + fn + '\\s*\\(', 'm').test(js) ? ok('页面方法存在: ' + fn) : no('缺页面方法: ' + fn);
});
/type="2d"/.test(wxml) ? ok('canvas 用了 2d 类型') : no('canvas 缺 type="2d"');
/CH\.drawTrend\(/.test(js) ? ok('页面走 utils/weight-chart 绘制') : no('页面没调用 CH.drawTrend');

/* ---------- ⑤ 样式：类名都对得上（防写错选择器导致静默无色） ---------- */
// LESS 里子块用 &__x / &--x 嵌套写，所以除了直接类名还要收这些后缀
const clsUsed = new Set();
for (const m of wxml.matchAll(/class="([^"]*)"/g)) {
  const raw = m[1].replace(/\{\{[\s\S]*?\}\}/g, ' '); // 段内表达式整段剔掉，别把 user / === 当类名
  raw.split(/\s+/).forEach((c) => {
    if (c) clsUsed.add(c);
  });
}
const direct = new Set();
for (const m of less.matchAll(/\.([a-zA-Z][\w-]*)/g)) direct.add(m[1]);
const suffix = new Set();
for (const m of less.matchAll(/&(?:__|--|\.)([\w-]+)/g)) suffix.add(m[1]);
const tailOf = (c) => {
  const p = c.split(/__|--/);
  return p[p.length - 1];
};
const noStyle = [...clsUsed].filter(
  (c) =>
    c !== 'fg-theme' &&
    !/-$/.test(c) && // is-{{ tone }} 这种拼接类名，剔掉表达式后剩个尾巴，无意义
    !direct.has(c) &&
    !suffix.has(c) &&
    !direct.has(tailOf(c)) &&
    !suffix.has(tailOf(c)),
);
noStyle.length ? no('模板用到但 less 未定义: ' + noStyle.join(', ')) : ok(`模板类名 ${clsUsed.size} 个都有样式`);

/* ---------- ⑥ 计算口径 ---------- */
eq(W.ymd('2026-03-07').m, 3, 'ymd 解析月份');
eq(W.weekday('2026-10-23'), '周五', 'weekday');
eq(W.monthLabel(2026, 10), '2026年10月', 'monthLabel');
eq(W.fmt1(169), '169.0', 'fmt1 补小数');

const sample = [
  { id: 1, date: '2026-03-01', weight: 160, bodyFat: 28 },
  { id: 2, date: '2026-03-04', weight: 158, bodyFat: 27.4 },
  { id: 3, date: '2026-03-08', weight: 157, bodyFat: null },
];
const st = W.stat(sample);
eq(st.count, 3, 'stat.count');
eq(st.latestW, '157.0', 'stat 当前体重取最后一条');
eq(st.maxW, '160.0', 'stat 最高');
eq(st.minW, '157.0', 'stat 最低');
eq(st.spreadW, '3.0', 'stat 波动');
eq(st.latestF, '27.4', 'stat 当前体脂跳过没填的那条');
eq(st.maxF, '28.0', 'stat 体脂最高');

// 7 天 160 → 158：每周 -2 斤，应落「下降较快」
const tr = W.trend([
  { date: '2026-03-01', weight: 160, bodyFat: 28 },
  { date: '2026-03-04', weight: 159, bodyFat: 27.8 },
  { date: '2026-03-08', weight: 158, bodyFat: 27.5 },
]);
eq(tr.weekly.toFixed(2), '-2.00', 'trend 每周变化');
eq(tr.text, '下降较快', 'trend 分档文案');
tr.notes.length >= 1 ? ok('trend 至少有 1 条建议') : no('trend 没有建议文案');

// 只有 2 条时不给结论
eq(W.trend(sample.slice(0, 2)), null, 'trend 少于 3 条返回 null');

const b1 = W.bmi(170, 155);
eq(b1.ok, true, 'bmi 正常输入');
eq(b1.value, (77.5 / (1.7 * 1.7)).toFixed(1), 'bmi 数值（斤折公斤）');
eq(b1.category, '超重', 'bmi 分档');
eq(W.bmi(90, 155).ok, false, 'bmi 身高越界被拦');
eq(W.bmi(170, 20).ok, false, 'bmi 体重越界被拦');

// 归一：三种形状都认，同日期留最后一条
const n1 = W.normalize({ users: { me: sample, ta: [] } });
eq(n1.me.length, 3, 'normalize 认 {users}');
const n2 = W.normalize(sample);
eq(n2.me.length, 3, 'normalize 认裸数组');
const n3 = W.normalize({
  data: [
    { date: '2026-03-01', weight: 160 },
    { date: '2026-03-01', weight: 159 },
  ],
});
eq(n3.me.length, 1, 'normalize 同日去重');
eq(n3.me[0].weight, 159, 'normalize 同日留最后一条');
eq(W.normalize('乱七八糟').me.length, 0, 'normalize 脏输入不炸');
eq(W.normalize({ users: { me: [{ date: 'x', weight: 'y' }] } }).me.length, 0, 'normalize 丢掉脏记录');

/* ---------- ⑦ 绘图模块：拿假 ctx 跑一遍，确保不抛且有笔触 ---------- */
const CH = require(path.join(ROOT, 'utils/weight-chart'));

function fakeCtx() {
  const log = { lines: 0, arcs: 0, texts: 0, fills: 0 };
  const noop = () => {};
  return {
    log,
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: () => {
      log.lines++;
    },
    stroke: noop,
    fill: () => {
      log.fills++;
    },
    arc: () => {
      log.arcs++;
    },
    fillText: () => {
      log.texts++;
    },
    createLinearGradient: () => ({ addColorStop: noop }),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: '',
    lineCap: '',
    textAlign: '',
    textBaseline: '',
  };
}

const c1 = fakeCtx();
CH.drawTrend(c1, { w: 320, h: 200, list: [], showW: true, showF: false });
eq(c1.log.texts, 1, '空数据只画一条提示');

const c2 = fakeCtx();
try {
  CH.drawTrend(c2, { w: 320, h: 200, list: sample, showW: true, showF: true });
  ok('双线绘制不抛错');
} catch (e) {
  no('双线绘制抛错: ' + e.message);
}
c2.log.lines > 0 ? ok('折线有笔触（' + c2.log.lines + ' 段）') : no('折线没有任何笔触');
c2.log.arcs > 0 ? ok('数据点有圆点（' + c2.log.arcs + ' 次 arc）') : no('没有画出数据点');

const c3 = fakeCtx();
CH.drawTrend(c3, { w: 320, h: 200, list: [{ date: '2026-03-01', weight: 160, bodyFat: null }], showW: false, showF: true });
eq(c3.log.texts, 1, '只有体重没体脂时给体脂提示');

/* ---------- ⑧ 内置网页版数据 ---------- */const sn = W.normalize(seed);
eq(sn.me.length, 164, '内置 me 条数');
eq(sn.ta.length, 115, '内置 ta 条数');
const allSeed = sn.me.concat(sn.ta);
const badRec = allSeed.filter((r) => !W.ymd(r.date) || !(r.weight > 0));
badRec.length ? no('内置数据有脏记录: ' + badRec.length) : ok('内置记录日期 / 体重都合法');
const outOfOrder = sn.me.some((r, i) => i > 0 && r.date < sn.me[i - 1].date);
outOfOrder ? no('内置 me 未按日期升序') : ok('内置数据已按日期升序');

/* ---------- ⑨ WXML 标签闭合（少个闭合标签就是整页白屏） ---------- */
function checkTags(src, label) {
  // 先去掉注释：注释里被「藏起来」的标签不该参与配对统计
  const body = String(src).replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let m = null;
  let brk = false;
  while ((m = re.exec(body))) {
    if (m[4] === '/') continue; // 自闭合
    const name = m[2].toLowerCase();
    if (m[1] === '/') {
      const last = stack.pop();
      if (last !== name) {
        no(label + ' 标签不匹配：</' + name + '> 前的开标签是 <' + last + '>');
        brk = true;
        break;
      }
    } else {
      stack.push(name);
    }
  }
  if (!brk && !stack.length) ok(label + ' 标签全部闭合');
  else if (!brk) no(label + ' 有未闭合的标签: ' + stack.join(', '));
}

checkTags(wxml, 'index.wxml');
checkTags(fs.readFileSync(path.join(ROOT, 'pages/weight/chart.wxml'), 'utf8'), 'chart.wxml');

/* ---------- ⑨b 横屏页的配置（页面必须保持竖屏，转的是图不是页） ---------- */
{
  const chartJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'pages/weight/chart.json'), 'utf8'));
  ok('chart.json 不设 pageOrientation = ' + !chartJson.pageOrientation);
  eq(chartJson.navigationStyle, 'custom', 'chart.json 自定义导航');
  eq(chartJson.disableScroll, true, 'chart.json 禁止滚动');

  // 全项目任何页面都不许设 pageOrientation —— 一设就会整页转（连状态栏和胶囊）
  const jsonFiles = ['app.json', 'pages/index/index.json', 'pages/tools/index.json',
    'pages/mahjong/index.json', 'pages/zhufugui/index.json', 'pages/weight/index.json',
    'pages/weight/chart.json', 'pages/home/index.json'];
  const withOrientation = jsonFiles.filter((f) => {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) return false;
    return !!JSON.parse(fs.readFileSync(p, 'utf8')).pageOrientation;
  });
  ok('没有任何页面强制转屏 = ' + (withOrientation.length === 0 ? 'true' : 'false → ' + withOrientation.join(',')));

  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  ok('chart 页已在 app.json 注册 = ' + (appJson.pages.indexOf('pages/weight/chart') >= 0));

  const idxJs = fs.readFileSync(path.join(ROOT, 'pages/weight/index.js'), 'utf8');
  const idxWxml = fs.readFileSync(path.join(ROOT, 'pages/weight/index.wxml'), 'utf8');
  eq(/onFullscreen\s*\(/.test(idxJs), true, '主页面有 onFullscreen 入口');
  eq(idxJs.indexOf('/pages/weight/chart?user=') >= 0, true, '主页面跳转地址正确');
  // 切「全部」只换图表内容，不能自动跳横屏；横屏只能靠点趋势图
  const onModeBody = (idxJs.match(/onMode\s*\([^)]*\)\s*\{[\s\S]*?\n  \},/) || [''])[0];
  eq(onModeBody.indexOf('onFullscreen') < 0, true, '切模式不会自动进横屏');
  eq(/class="wchart"[^>]*bindtap="onFullscreen"/.test(idxWxml), true, '趋势图是点击入口');
  // 返回后必须解锁，否则第二次点图没反应
  const onShowBody = (idxJs.match(/onShow\s*\([^)]*\)\s*\{[\s\S]*?\n  \},/) || [''])[0];
  eq(/_navLock\s*=\s*false/.test(onShowBody), true, 'onShow 会解导航锁');
}

/* ---------- ⑩ 文案禁区（只看会显示出来的文字，注释不算） ---------- */const copyWxml = wxml.replace(/<!--[\s\S]*?-->/g, '');
const copyJs = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
['—', '😀'].forEach((t) => {
  const hit = copyWxml.includes(t) || copyJs.includes(t);
  hit ? no('出现禁用字符: ' + t) : ok('未出现禁用字符: ' + t);
});

console.log(bad ? `\n${bad} 项失败` : '\n全部通过');
process.exit(bad ? 1 : 0);
