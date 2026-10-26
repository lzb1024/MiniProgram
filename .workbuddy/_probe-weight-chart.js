// pages/weight/chart.js 冒烟测试（离线：假 wx / 假 Page / 假 canvas，不联网不 spawn）
//
// 这个页面最容易错的是「参数没接住」和「canvas 尺寸没按横屏重算」，
// 所以这里把 onLoad 的 query 解析、筛选、切换、绘制调用都跑一遍。
// 跑法：node .workbuddy/_probe-weight-chart.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const W = require(path.join(ROOT, 'utils', 'weight'));
const CH = require(path.join(ROOT, 'utils', 'weight-chart'));

let bad = 0;
const ok = (m) => console.log('OK   ' + m);
const no = (m) => {
  bad++;
  console.log('FAIL ' + m);
};
const eq = (a, b, m) => (String(a) === String(b) ? ok(m + ' = ' + b) : no(m + ' 期望 ' + b + '，实际 ' + a));

/* ---------------- 假数据：两个月 + 两个人 ---------------- */
const rec = (date, weight, bodyFat) => ({ id: 'x' + date, date, weight, bodyFat });
const FIXTURE = {
  me: [
    rec('2026-09-10', 150.0, 23.0),
    rec('2026-10-01', 154.0, 24.0),
    rec('2026-10-15', 153.0, 23.5),
    rec('2026-10-20', 152.0, 23.2),
  ],
  ta: [rec('2026-10-05', 106.0, 28.0), rec('2026-10-18', 106.5, 28.4)],
};

/* ---------------- 假 canvas ---------------- */
function makeCtx(log) {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 12 });
      // 渐变对象要能被 addColorStop，否则 drawTrend 会炸
      if (k === 'createLinearGradient' || k === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      if (Object.prototype.hasOwnProperty.call(t, k)) return t[k];
      return function () {
        log.push(String(k));
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

function makeEnv(o) {
  o = o || {};
  const calls = [];
  const nav = [];
  const ctx = makeCtx(calls);
  const canvas = { width: 0, height: 0, getContext: () => ctx };

  const wx = {
    createSelectorQuery() {
      const q = {
        select: () => q,
        fields: () => q,
        node: () => q,
        exec(cb) {
          // 模拟横屏尺寸：宽 > 高
          cb([{ node: canvas, width: 780, height: 300 }]);
        },
      };
      return q;
    },
    getWindowInfo: () => o.win || { pixelRatio: 2, windowWidth: 780, windowHeight: 360 },
    navigateBack: (o) => nav.push('back'),
    reLaunch: (o) => nav.push('relaunch'),
    getStorageSync: () => '',
    setStorageSync: () => {},
  };

  const api = {
    loadLocal: () => ({ currentUser: 'me', users: FIXTURE }),
    fetchUsers: () => Promise.resolve({ users: FIXTURE, online: true }),
  };

  let cfg = null;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require(p) {
      if (/utils\/weight-chart$/.test(p)) return CH;
      if (/utils\/weight$/.test(p)) return W;
      if (/api\/weight$/.test(p)) return api;
      throw new Error('unexpected require: ' + p);
    },
    Page: (o) => {
      cfg = o;
    },
    wx,
    console,
    Date,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Promise,
    Error,
    setTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'pages', 'weight', 'chart.js'), 'utf8'), sandbox, {
    filename: 'pages/weight/chart.js',
  });

  // 极简的 Page 实例：setData 合并 + 回调
  const inst = Object.assign({}, cfg);
  inst.data = JSON.parse(JSON.stringify(cfg.data));
  inst.setData = function (patch, cb) {
    Object.keys(patch || {}).forEach((k) => {
      inst.data[k] = patch[k];
    });
    if (typeof cb === 'function') cb();
  };
  return { inst, calls, nav, canvas };
}

const ev = (dataset) => ({ currentTarget: { dataset } });

(async () => {
  const { inst, calls, nav, canvas } = makeEnv();

  /* ① 参数解析 + 本机先出图 */
  inst.onLoad({ user: 'ta', mode: 'all', scope: 'all', y: '2026', m: '10' });
  eq(inst.data.user, 'ta', 'query user');
  eq(inst.data.mode, 'all', 'query mode');
  eq(inst.data.scope, 'all', 'query scope');
  eq(inst.data.monthM, 10, 'query 月份');
  eq(inst.data.count, 2, '全期 TA 条数');
  eq(inst.data.who, 'TA', '标题人称');
  eq(inst.data.showW && inst.data.showF, true, '双轴都开');

  /* ② onReady 后 canvas 按横屏尺寸初始化并画了一次 */
  inst.onReady();
  eq(canvas.width, 780 * 2, 'canvas 位图宽 = 屏宽×dpr');
  eq(canvas.height, 360 * 2, 'canvas 位图高 = 屏高×dpr');
  ok('画布有绘制调用 = ' + (calls.length > 0));
  if (!calls.length) no('画布没有任何绘制调用');
  ok('调用了 clearRect = ' + (calls.indexOf('clearRect') >= 0));

  /* ③ 参数不同 → 结果不同（切换控件已按需求去掉，靠 query 区分视图） */
  const cases = [
    { q: { user: 'me', mode: 'weight', scope: 'month', y: '2026', m: '10' }, count: 3, w: true, f: false, name: '我/体重/本月' },
    { q: { user: 'me', mode: 'fat', scope: 'month', y: '2026', m: '10' }, count: 3, w: false, f: true, name: '我/体脂/本月' },
    { q: { user: 'me', mode: 'all', scope: 'all', y: '2026', m: '10' }, count: 4, w: true, f: true, name: '我/双轴/全期' },
    { q: { user: 'me', mode: 'weight', scope: 'month', y: '2026', m: '9' }, count: 1, w: true, f: false, name: '我/9 月' },
    { q: { user: 'ta', mode: 'weight', scope: 'month', y: '2026', m: '10' }, count: 2, w: true, f: false, name: 'TA/本月' },
  ];
  cases.forEach((c) => {
    const fresh = makeEnv();
    fresh.inst.onLoad(c.q);
    eq(fresh.inst.data.count, c.count, c.name + ' 条数');
    eq(fresh.inst.data.showW, c.w, c.name + ' showW');
    eq(fresh.inst.data.showF, c.f, c.name + ' showF');
  });

  /* ④ 页面里只该有「图 + 关闭」，不该有顶栏/图例/切换控件 */
  const wxmlSrc = fs.readFileSync(path.join(ROOT, 'pages', 'weight', 'chart.wxml'), 'utf8');
  ok('横屏页没有切换控件 = ' + !/bindtap="on(User|Mode|Scope)"/.test(wxmlSrc));
  ok('横屏页有关闭按钮 = ' + /bindtap="onBack"/.test(wxmlSrc));
  ok('横屏页没有顶栏 = ' + !/wc__bar|wc__title/.test(wxmlSrc));
  ok('横屏页没有底部图例 = ' + !/wc__foot|wlegend/.test(wxmlSrc));
  ok('横屏页没有死掉的样式类 = ' + !/wc__group|wc__it\b/.test(wxmlSrc));
  eq((wxmlSrc.match(/<canvas/g) || []).length, 1, '画布只有一个');

  const chartJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'pages', 'weight', 'chart.json'), 'utf8'));
  ok('页面不强制横屏 = ' + !chartJson.pageOrientation);

  const chartJs = fs.readFileSync(path.join(ROOT, 'pages', 'weight', 'chart.js'), 'utf8');
  const lessSrc = fs.readFileSync(path.join(ROOT, 'pages', 'weight', 'chart.less'), 'utf8');
  eq(/ctx\.rotate\(Math\.PI \/ 2\)/.test(chartJs), true, '旋转在 canvas 坐标系里做');
  eq(/transform\s*:/.test(lessSrc), false, 'CSS 里不给画布套 transform');
  eq(/mountChart\(n \+ 1\)/.test(chartJs), true, '有拿不到节点时的重试');

  /* ⑤ 云端回来后再刷新一次（不应报错，条数不变）—— inst 是 TA/全期，2 条 */
  await new Promise((r) => setTimeout(r, 20));
  eq(inst.data.count, 2, '云端回填后条数');

  /* ⑧ 竖屏时要把坐标系转 90°，横屏时不许转（模拟器停在横屏时会歪） */
  {
    const p = makeEnv({ win: { pixelRatio: 2, windowWidth: 390, windowHeight: 780 } });
    p.inst.onLoad({ user: 'me', mode: 'all', scope: 'all', y: '2026', m: '10' });
    p.inst.onReady();
    eq(p.canvas.width, 390 * 2, '竖屏 位图宽 = 屏宽×dpr');
    eq(p.canvas.height, 780 * 2, '竖屏 位图高 = 屏高×dpr');
    eq(p.calls.indexOf('rotate') >= 0, true, '竖屏 旋转了坐标系');

    const l = makeEnv({ win: { pixelRatio: 2, windowWidth: 780, windowHeight: 390 } });
    l.inst.onLoad({ user: 'me', mode: 'all', scope: 'all', y: '2026', m: '10' });
    l.inst.onReady();
    eq(l.calls.indexOf('rotate') >= 0, false, '横屏 不许再转');
    ok('横屏 也画了图 = ' + (l.calls.indexOf('clearRect') >= 0));
  }

  /* ⑨ 关闭 */
  inst.onBack();
  eq(nav[0], 'back', '关闭走 navigateBack');

  /* ⑦ 再 refresh 一次：会重画，但数据不变 */
  const before = calls.length;
  inst.refresh();
  ok('refresh 后确实重绘了 = ' + (calls.length > before));
  eq(inst.data.count, 2, 'refresh 后条数不变');

  console.log(bad ? '\n' + bad + ' 项失败' : '\n全部通过');
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error('冒烟测试抛错:', e && e.stack);
  process.exit(1);
});
