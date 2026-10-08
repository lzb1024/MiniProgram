// 独立校验：绕开 _check-all.js 的 spawn EBUSY，用动态 import 直接加载模块做断言
// 临时脚本，放在 .workbuddy/ 下（ESM，.mjs 扩展名）
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.').replace(/\\/g, '/');
const fails = [];
const oks = [];

function ok(msg) { oks.push(msg); }
function bad(msg) { fails.push(msg); }

// ---------- 1. JSON 可解析 + 关键结构 ----------
const jsonFiles = [
  'app.json', 'project.config.json', 'sitemap.json', 'package.json',
  'mock/trips/index.js',
  'pages/index/index.json', 'pages/home/index.json',
  'components/nav/index.json',
];
for (const f of jsonFiles) {
  if (f.endsWith('.json')) {
    try {
      JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));
      ok(`json 解析通过: ${f}`);
    } catch (e) { bad(`json 解析失败: ${f} -> ${e.message}`); }
  }
}

// ---------- 2. 动态 import 各数据模块 ----------
const mods = {};
for (const f of ['mock/trips/index.js', 'mock/trips/chuanxi.js', 'mock/trips/changsha.js']) {
  try {
    mods[f] = (await import(pathToFileURL(path.join(ROOT, f)).href)).default;
    ok(`模块加载成功: ${f}`);
  } catch (e) { bad(`模块加载失败: ${f} -> ${e.message}`); }
}

// ---------- 3. trips 清单与详情文件对齐 ----------
// 注意：mock/trips/index.js 的结构是 { path, data:{ code, data:{ trips } } }，
// trips 在 data.data.trips，不是顶层字段。
const tripsIndex = mods['mock/trips/index.js'];
const TRIPS = tripsIndex?.data?.data?.trips;
if (Array.isArray(TRIPS)) {
  const ids = TRIPS.map(t => t.id);
  ok(`trips 清单 id: ${ids.join(', ')}`);
  for (const id of ids) {
    if (!mods[`mock/trips/${id}.js`]) bad(`清单里的 ${id} 缺少详情文件 mock/trips/${id}.js`);
  }
  // 详情文件 path 里的 id 必须与清单 id 对应（mock 靠 URL 字符串做 key，错了点进详情会走真request）
  for (const id of ids) {
    const mod = mods[`mock/trips/${id}.js`];
    const p = mod?.path || '';
    if (p && !p.includes(`/trip/${id}`)) bad(`详情 ${id}.js 的 path 是 "${p}"，与 id 不符`);
  }
} else bad('mock/trips/index.js 未找到 trips 数组（期望 data.data.trips）');

// ---------- 4. 每趟行程的结构完整性 ----------
// 详情模块形状同样是 { path, data:{ code, message, data:{ ...攻略 } } }，
// 所以要取 data.data，不是顶层。
for (const id of (TRIPS || []).map(t => t.id)) {
  const mod = mods[`mock/trips/${id}.js`];
  if (!mod) continue;
  const m = mod.data?.data;
  if (!m) { bad(`${id}: 详情模块缺data.data 层（期望 { path, data:{ code, data:{...} } }）`); continue; }
  const days = m.days || [];
  if (days.length === 0) bad(`${id}: days 为空`);
  // dayTabs 与 days 必须对齐（记忆里的坑）
  if (Array.isArray(m.dayTabs) && m.dayTabs.length !== days.length) {
    bad(`${id}: dayTabs(${m.dayTabs.length}) 与 days(${days.length}) 数量不一致`);
  } else ok(`${id}: dayTabs 与 days 对齐 (${days.length})`);
  // days[].city 必填（记忆里的坑：不填天气整块不渲染）
  days.forEach((d, i) => {
    if (!d.date) bad(`${id}: days[${i}] 缺 date`);
    if (!d.city) bad(`${id}: days[${i}] 缺 city（会导致天气条不渲染）`);
    if (!Array.isArray(d.timeline) || d.timeline.length === 0) {
      bad(`${id}: days[${i}](${d.date}) timeline 为空`);
    } else {
      d.timeline.forEach((t, j) => {
        if (!t.t) bad(`${id}: days[${i}].timeline[${j}] 缺 t`);
        if (!t.c) bad(`${id}: days[${i}].timeline[${j}] 缺 c`);
      });
    }
  });
  // routes.stops 必须是 {label, hot} 对象数组（记忆里的坑：字符串数组渲染成空白方框）
  const stops = m.routes?.stops;
  if (Array.isArray(stops) && stops.length) {
    stops.forEach((s, i) => {
      if (typeof s === 'string') bad(`${id}: routes.stops[${i}] 是字符串，应为 {label,hot} 对象`);
      else if (!s || !s.label) bad(`${id}: routes.stops[${i}] 缺 label`);
    });
  }
  // 分组白名单应存在
  if (m.packing && !Array.isArray(m.packing.groups)) bad(`${id}: packing.groups 缺失`);
  // 三链配置
  if (m.costs && !Array.isArray(m.costs.categories)) bad(`${id}: costs.categories 缺失`);
  if (m.traffic && !Array.isArray(m.traffic.modes)) bad(`${id}: traffic.modes 缺失`);
}

// ---------- 5. pages/home 的 TRIPS 白名单必须包含所有行程 ----------
// pages/home/index.js 里 TRIPS 是**对象**（chuanxi: {name}），所以要匹配对象键写法，
// 不能只搜引号串，否则 DEFAULT_TRIP = 'chuanxi' 这类地方会假通过。
try {
  const homeJs = readFileSync(path.join(ROOT, 'pages/home/index.js'), 'utf8');
  const block = homeJs.match(/const TRIPS\s*=\s*\{([\s\S]*?)\n\}/);
  if (!block) bad('pages/home/index.js 里找不到 TRIPS 对象声明');
  else {
    const keys = [...block[1].matchAll(/^\s*([A-Za-z0-9_$-]+)\s*:/gm)].map(m => m[1]);
    ok(`pages/home TRIPS 白名单键: ${keys.join(', ')}`);
    for (const id of (TRIPS || []).map(t => t.id)) {
      if (!keys.includes(id)) bad(`TRIPS 白名单缺少 ${id}（会静默回落默认行程）`);
    }
  }
} catch (e) { bad(`读取 pages/home/index.js 失败: ${e.message}`); }

// ---------- 6. app.json 页面路径与磁盘一致 ----------
try {
  const app = JSON.parse(readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const pages = app.pages || [];
  ok(`app.json pages: ${pages.join(', ')}`);
  for (const p of pages) {
    for (const ext of ['.js', '.wxml']) {
      if (!readFileSync(path.join(ROOT, p + ext), 'utf8')) bad(`app.json 声明的 ${p + ext} 不存在`);
    }
  }
  // 反向：磁盘上的 pages/*/index 页若未在 app.json 声明，容易被漏
} catch (e) { bad(`app.json 处理失败: ${e.message}`); }

// ---------- 7. usingComponents 与 wxml 标签一致（抽查 components/nav + pages）----------
const wcFiles = ['pages/home/index.wxml', 'pages/index/index.wxml'];
for (const w of wcFiles) {
  let wxml; try { wxml = readFileSync(path.join(ROOT, w), 'utf8'); } catch { continue; }
  let json;
  try { json = JSON.parse(readFileSync(path.join(ROOT, w.replace(/\.wxml$/, '.json')), 'utf8')); }
  catch { bad(`${w} 对应 json 缺失/解析失败`); continue; }
  const declared = new Set(Object.keys(json.usingComponents || {}));
  for (const m of wxml.matchAll(/<(t-[a-z-]+)/g)) {
    const tag = m[1];
    if (!declared.has(tag)) bad(`${w} 用了 <${tag}> 但 usingComponents 未声明`);
  }
  ok(`${w} 组件声明核对完成`);
}

// ---------- 8. 禁项扫描：em-dash / 硬编码 rgba(255,255,255,..) ----------
// 必须先剥掉注释，否则会命中「别再写死 rgba(255,255,255,x)」这类**提醒文字本身**，
// 以及 less 注释里作为解释用的破折号。这是实测踩过的坑。
const scanFiles = ['app.less', 'variable.less', 'pages/home/index.less', 'pages/index/index.less'];
for (const f of scanFiles) {
  let src; try { src = readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
  // 去掉 /* */ 和 // 行注释
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  if (/—|–/.test(code)) {
    const ln = code.split('\n').findIndex(l => /—|–/.test(l)) + 1;
    bad(`${f} 代码（非注释）第 ${ln} 行含 em/en dash，项目禁用`);
  }
  if (/rgba\(\s*255\s*,\s*255\s*,\s*255/.test(code)) {
    // variable.less 里的**令牌定义本身**不算残留，它是白名单的源头
    const lines = code.split('\n');
    const hit = lines
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /rgba\(\s*255\s*,\s*255\s*,\s*255/.test(l))
      .filter(([, l]) => !/^\s*@[\w-]+\s*:/.test(l)); // 排除 @xxx: rgba(...) 形式的令牌定义
    if (hit.length) {
      bad(`${f} 第 ${hit.map(x => x[0]).join(', ')} 行含 rgba(255,255,255,..) 硬编码`);
    }
  }
}
ok('样式禁项扫描完成（已剥离注释）');

// ---------- 输出 ----------
console.log('========== 通过 (' + oks.length + ') ==========');
for (const m of oks) console.log('  ok  ' + m);
if (fails.length) {
  console.log('\n========== 失败 (' + fails.length + ') ==========');
  for (const m of fails) console.log('  FAIL  ' + m);
  process.exitCode = 1;
} else {
  console.log('\n全部通过，无失败项');
}