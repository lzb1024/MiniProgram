// 长沙攻略接入后的端到端自检（不 spawn，绕开 EBUSY）。
// 验证：注册表能加载、端点路径按行程分、页面注入后的字段形状可用。
const R = { ok: [], bad: [] };
const pass = (m) => R.ok.push(m);
const fail = (m) => R.bad.push(m);

// 1. mock 注册表：用静态文本检查（项目里 mock 互相 import 都省略扩展名，
//    Node 原生 ESM 不认，但小程序打包器认 —— 所以别真去 import，改查源码）
const fs = await import('node:fs/promises');
const regSrc = await fs.readFile(new URL('../mock/home/index.js', import.meta.url), 'utf8');
{
  const required = ['tripsRegistry', 'chuanxi', 'changsha', 'getTrip'];
  required.forEach((n) => {
    if (regSrc.includes(n)) pass('注册表已登记 ' + n);
    else fail('注册表缺少 ' + n);
  });
  ['trips/index', 'trips/chuanxi', 'trips/changsha'].forEach((p) => {
    if (regSrc.includes(p)) pass('注册表路径指向 ' + p);
    else fail('注册表路径没指向 ' + p);
  });
}

// 端点路径：直接读三个 mock 文件确认 path，且不能带 query
const files = {
  '/home/trips': '../mock/trips/index.js',
  '/home/trip/chuanxi': '../mock/trips/chuanxi.js',
  '/home/trip/changsha': '../mock/trips/changsha.js',
  '/home/trip': '../mock/home/getTrip.js',
};
for (const [want, rel] of Object.entries(files)) {
  const src = await fs.readFile(new URL(rel, import.meta.url), 'utf8');
  const m = /path:\s*'([^']+)'/.exec(src);
  if (!m) fail(rel + ' 里找不到 path');
  else if (m[1] !== want) fail(`${rel} 的 path 是 ${m[1]}，期望 ${want}`);
  else if (m[1].includes('?')) fail(`path ${m[1]} 带 query，WxMock 会匹配不上`);
  else pass('端点 ' + m[1]);
}

// 2. 倒计时按「打开当天」实时算：直接复刻 pages/home 的算法验证边界
function buildCountdown(list, now) {
  const CLOCK = 12;
  const parse = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d, CLOCK, 0, 0);
  };
  return list.map((c) => {
    const open = parse(c.open);
    const left = Math.round((open - now) / 86400000);
    let state = 'idle';
    if (left <= 0) state = 'now';
    else if (left <= 3) state = 'soon';
    return { item: c.item, state, left };
  });
}

const cs2 = (await import('../mock/trips/changsha.js')).default.data.data;
const noonOn = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

// 期望值照pages/home/index.js buildCountdown 的真实口径：diff > 0 且 diff <= 3 判 soon。
// 11/2 距博物院开票（11/3）1 天 -> soon；距岳麓山（11/4）2 天 -> soon，都对。
const cases = [
  ['2026-10-07', '今天', ['idle', 'idle', 'idle', 'idle']],
  ['2026-11-02', '距博物院开票 1 天 / 距岳麓山 2 天', ['soon', 'soon', 'soon', 'soon']],
  ['2026-11-03', '博物院放票当天', ['now', 'soon', 'soon', 'soon']],
  ['2026-11-04', '岳麓山与橘子洲开抢', ['now', 'now', 'now', 'now']],
  ['2026-11-07', '使用当天', ['now', 'now', 'now', 'now']],
];
cases.forEach(([d, label, want]) => {
  const got = buildCountdown(cs2.booking.countdown, noonOn(d));
  const states = got.map((g) => g.state);
  if (JSON.stringify(states) === JSON.stringify(want)) pass(`倒计时 ${d}（${label}）状态正确`);
  else fail(`倒计时 ${d}（${label}）状态错误：得到 ${states.join(',')}`);
});

// 3. 页面注入后的字段形状（照 pages/home/index.js loadData 的映射复刻）
const injected = cs2.days.map((item, i) => ({
  index: i,
  tag: item.tag || '',
  alt: item.alt || '',
  cardTitle: item.cardTitle || item.title || '',
  brief: item.brief || '',
  weather: item.weather || [],
  timeline: (item.timeline || []).map((step, si) => ({ ...step, k: `p-${si}` })),
  tips: item.tips || [],
  stayGeo: item.stayGeo || null,
}));
injected.forEach((d, i) => {
  if (!d.timeline.length) fail(`注入后 DAY${i + 1} 时间线为空`);
  const dup = d.timeline.map((t) => t.k);
  if (new Set(dup).size !== dup.length) fail(`注入后 DAY${i + 1} wx:key 重复`);
});
if (injected.every((d) => d.timeline.length)) pass('注入后 3 天时间线均有内容且 wx:key 唯一');

// 4. 有住宿坐标的两天才出「地图」入口
if (injected[0].stayGeo && injected[1].stayGeo && !injected[2].stayGeo)
  pass('stayGeo：前两天有、返程日无（符合预期）');
else fail('stayGeo 配置不符预期');

// 5. 天气城市全部可查
const CITY_POINTS = ['成都', '四姑娘山', '九寨沟', '长沙'];
cs2.days.forEach((d, i) => {
  if (!CITY_POINTS.includes(d.city)) fail(`DAY${i + 1} city「${d.city}」不在 CITY_POINTS 里`);
});
if (cs2.days.every((d) => CITY_POINTS.includes(d.city))) pass('三天 city 均能在 CITY_POINTS 查到');

console.log('--- 通过 ---');
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log('--- 失败 ---');
if (!R.bad.length) console.log('  无');
R.bad.forEach((m) => console.log('  FAIL ' + m));
console.log(`\n共 ${R.bad.length} 项失败 / ${R.ok.length + R.bad.length} 项检查`);