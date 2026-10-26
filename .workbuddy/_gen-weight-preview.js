// 生成 preview/weight-preview.html
//
// 目的：不用开微信开发者工具就能在浏览器里看这个页面的样子，并验证趋势图的绘制。
// 三份东西都是"复用真代码"，不是手抄出来的静态快照：
//   ① 样式：直接编译 pages/weight/index.less（rpx 按 375 屏折半换成 px）
//   ② 计算：内联 utils/weight.js
//   ③ 绘图：内联 utils/weight-chart.js
// 数据用 utils/weight-seed.js 里的真实历史记录。
//
// 跑法：node .workbuddy/_gen-weight-preview.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const less = require('C:/Users/LZB/.workbuddy/binaries/node/workspace/node_modules/less');
const W = require(path.join(ROOT, 'utils/weight'));
const SEED = require(path.join(ROOT, 'utils/weight-seed'));

const lessSrc = fs.readFileSync(path.join(ROOT, 'pages/weight/index.less'), 'utf8');
const modWeight = fs.readFileSync(path.join(ROOT, 'utils/weight.js'), 'utf8');
const modChart = fs.readFileSync(path.join(ROOT, 'utils/weight-chart.js'), 'utf8');

const data = W.normalize(SEED);
// 跟页面里的 appData 同形状（users.me / users.ta），预览脚本才能照抄页面的取数方式
const seedJson = JSON.stringify({ users: { me: data.me, ta: data.ta } });

less.render(lessSrc, { filename: path.join(ROOT, 'pages/weight/index.less') }).then((out) => {
  const css = out.css.replace(/(-?\d*\.?\d+)rpx/g, (m, n) => parseFloat(n) / 2 + 'px');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>体重追踪 · 预览 · 综合版小程序</title>
<style>
/* ===== 预览外壳（不属于小程序） ===== */
html, body { margin: 0; padding: 0; background: #e9e6db; }
body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
.phone { width: 390px; margin: 26px auto 60px; background: #F7F5EF; box-shadow: 0 18px 60px rgba(34,48,46,.16); border-radius: 20px; overflow: hidden; }
.ph-bar { position: sticky; top: 0; z-index: 99; display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; font-size: 11px; color: #8C9A94; background: rgba(247,245,239,.92); backdrop-filter: blur(8px); border-bottom: 1px solid #EEECE2; }
.ph-bar b { color: #5A6B66; font-weight: 600; }
.ph-tip { max-width: 390px; margin: 0 auto; padding: 10px 6px 0; font-size: 12px; line-height: 1.7; color: #7d8a83; text-align: center; }

/* ===== 以下为 pages/weight/index.less 的编译产物（rpx 已折半） ===== */
${css}
</style>
</head>
<body>
<div class="ph-tip">静态预览：可直接点「我 / TA」「月份箭头」「体重 / 体脂 / 全部」看变化，用真实历史数据渲染。</div>

<div class="phone">
  <div class="ph-bar"><b>体重追踪</b><span id="phState"></span></div>

  <div class="wt fg-theme" id="app">
    <div class="wt__top" style="height:20px"></div>

    <div class="wt__nav">
      <div class="wt__back" hover-class="is-hover">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22302E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
      </div>
    </div>

    <div class="wt__head">
      <div class="wt__kicker"><div class="wt__dot"></div><span>常用工具</span><div class="wsync is-on"><span>已同步</span></div></div>
      <div class="wt__title">体重追踪</div>
      <div class="wt__sub">体重与体脂一起记，看得到趋势才算数</div>
    </div>

    <div class="wseg">
      <div class="wseg__it is-on" data-user="me">我</div>
      <div class="wseg__it" data-user="ta">TA</div>
    </div>

    <div class="wmonth">
      <div class="wmonth__btn" data-nav="-1">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5A6B66" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
      </div>
      <div class="wmonth__mid">
        <div class="wmonth__label" id="monthLabel"></div>
        <div class="wmonth__meta"><span class="wmonth__now" id="monthNow">本月</span><span id="monthCount"></span></div>
      </div>
      <div class="wmonth__btn" data-nav="1">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5A6B66" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
      </div>
    </div>

    <div class="wcard">
      <div class="wcard__title">添加记录</div>
      <div class="wcard__hint">同一天再存一次就覆盖，不会留两条</div>
      <div class="wcell wcell--pick">
        <span class="wcell__k">日期</span>
        <div class="wcell__r"><span class="wcell__v">2026-10-23</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8C9A94" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
        </div>
      </div>
      <div class="wrow">
        <div class="wfield"><span class="wfield__k">体重（斤）</span><div class="wfield__in" style="color:#8C9A94;font-size:13px;font-weight:400;display:flex;align-items:center;">如 155.0</div></div>
        <div class="wfield"><span class="wfield__k">体脂率（%）</span><div class="wfield__in" style="color:#8C9A94;font-size:13px;font-weight:400;display:flex;align-items:center;">可留空</div></div>
      </div>
      <div class="wbtn wbtn--main">保存</div>
    </div>

    <div class="wsec">
      <div class="wsec__title">体重</div>
      <div class="wgrid">
        <div class="wstat"><span class="wstat__k">当前体重</span><div class="wstat__v is-w" id="stLatestW"></div></div>
        <div class="wstat"><span class="wstat__k" id="lblMax">本月最高</span><div class="wstat__v" id="stMaxW"></div></div>
        <div class="wstat"><span class="wstat__k" id="lblMin">本月最低</span><div class="wstat__v" id="stMinW"></div></div>
        <div class="wstat"><span class="wstat__k" id="lblSpread">月波动</span><div class="wstat__v" id="stSpreadW"></div></div>
      </div>
    </div>

    <div class="wsec">
      <div class="wsec__title">体脂</div>
      <div class="wgrid">
        <div class="wstat"><span class="wstat__k">当前体脂</span><div class="wstat__v is-f" id="stLatestF"></div></div>
        <div class="wstat"><span class="wstat__k" id="lblMaxF">本月最高体脂</span><div class="wstat__v" id="stMaxF"></div></div>
        <div class="wstat"><span class="wstat__k" id="lblMinF">本月最低体脂</span><div class="wstat__v" id="stMinF"></div></div>
        <div class="wstat"><span class="wstat__k" id="lblSpreadF">体脂波动</span><div class="wstat__v" id="stSpreadF"></div></div>
      </div>
    </div>

    <div class="wcard">
      <div class="wcard__bar">
        <div class="wcard__title">趋势</div>
        <div class="wseg wseg--sm">
          <div class="wseg__it is-on" data-mode="weight">体重</div>
          <div class="wseg__it" data-mode="fat">体脂</div>
          <div class="wseg__it" data-mode="all">全部</div>
        </div>
      </div>
      <div class="wchart"><canvas id="wtChart" class="wchart__cv"></canvas></div>
      <div class="wlegend" id="legend"></div>
      <div class="wcard__hint" id="allHint" style="display:none;">「全部」下图表与上方统计都按历史全部记录算</div>
    </div>

    <div class="wcard">
      <div class="wcard__bar">
        <div class="wcard__title">本月记录</div>
        <span class="wcard__side">点一行改</span>
      </div>
      <div id="recList"></div>
    </div>

    <div class="wcard wcard--ana" id="anaCard" style="display:none;">
      <div class="wcard__bar">
        <div class="wcard__title">智能分析</div>
        <span class="wcard__side" id="anaSide"></span>
      </div>
      <div class="ana">
        <div class="ana__lead" id="anaLead"></div>
        <div id="anaNotes"></div>
        <div class="ana__foot" id="anaFoot"></div>
      </div>
    </div>

    <div class="wcard">
      <div class="wcard__title">BMI 计算器</div>
      <div class="wcard__hint">体重按斤填，内部会先折成公斤</div>
      <div class="wrow">
        <div class="wfield"><span class="wfield__k">身高（cm）</span><div class="wfield__in" style="display:flex;align-items:center;">170</div></div>
        <div class="wfield"><span class="wfield__k">体重（斤）</span><div class="wfield__in" style="display:flex;align-items:center;">155</div></div>
      </div>
      <div class="wbtn wbtn--ghost">计算</div>
      <div class="bmi">
        <div class="bmi__l"><span class="bmi__k">BMI 指数</span><div class="bmi__v">26.8</div></div>
        <div class="bmi__r"><div class="bmi__cat is-warn">超重</div><span class="bmi__range">24 ≤ BMI &lt; 28</span></div>
      </div>
    </div>

    <div class="wcard">
      <div class="wcard__title">数据管理</div>
      <div class="wbtns">
        <div class="wbtn wbtn--sm">导出</div>
        <div class="wbtn wbtn--sm">从剪贴板导入</div>
        <div class="wbtn wbtn--sm">BMI</div>
        <div class="wbtn wbtn--sm wbtn--danger">清空</div>
      </div>
      <div class="wbtn wbtn--sm wbtn--seed">导入网页版历史数据</div>
      <div class="wcard__hint">记一条就自动同步云端，同账号换手机能拿回来</div>
    </div>

    <div class="wt__bottom"></div>
  </div>
</div>

<script>
/* ---- CJS 垫片：把 utils/*.js 原样内联进来用 ---- */
var __m = {};
function __def(name, fn) { var mod = { exports: {} }; fn(mod, mod.exports); __m[name] = mod.exports; }

__def('weight', function (module, exports) {
${modWeight}
});

__def('chart', function (module, exports) {
${modChart}
});

var W = __m.weight;
var CH = __m.chart;
var SEED = ${seedJson};

var state = { user: 'me', y: 2026, m: 6, mode: 'weight' };
var view = null;

function listAll() {
  return (SEED.users[state.user] || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
}

function withUnit(v, unit) {
  return v ? v + '<span class="wstat__u">' + unit + '</span>' : '-';
}

function fitCanvas() {
  var cv = document.getElementById('wtChart');
  var rect = cv.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(rect.width * dpr);
  cv.height = Math.round(rect.height * dpr);
  var ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  return { ctx: ctx, w: rect.width, h: rect.height };
}

function refresh() {
  var all = listAll();
  var month = all.filter(function (r) { var t = W.ymd(r.date); return t && t.y === state.y && t.m === state.m; });
  var hist = state.mode === 'all';
  var scope = hist ? all : month;

  var st = W.stat(scope);
  document.getElementById('monthLabel').textContent = W.monthLabel(state.y, state.m);
  document.getElementById('monthCount').textContent = month.length ? month.length + ' 条记录' : '还没有记录';
  var now = new Date();
  document.getElementById('monthNow').style.display = (state.y === now.getFullYear() && state.m === now.getMonth() + 1) ? '' : 'none';

  document.getElementById('lblMax').textContent = hist ? '历史最高' : '本月最高';
  document.getElementById('lblMin').textContent = hist ? '历史最低' : '本月最低';
  document.getElementById('lblSpread').textContent = hist ? '历史波动' : '月波动';
  document.getElementById('lblMaxF').textContent = hist ? '历史最高体脂' : '本月最高体脂';
  document.getElementById('lblMinF').textContent = hist ? '历史最低体脂' : '本月最低体脂';
  document.getElementById('lblSpreadF').textContent = hist ? '历史体脂波动' : '体脂波动';

  document.getElementById('stLatestW').innerHTML = withUnit(st.latestW, '斤');
  document.getElementById('stMaxW').innerHTML = withUnit(st.maxW, '斤');
  document.getElementById('stMinW').innerHTML = withUnit(st.minW, '斤');
  document.getElementById('stSpreadW').innerHTML = withUnit(st.spreadW, '斤');
  document.getElementById('stLatestF').innerHTML = withUnit(st.latestF, '%');
  document.getElementById('stMaxF').innerHTML = withUnit(st.maxF, '%');
  document.getElementById('stMinF').innerHTML = withUnit(st.minF, '%');
  document.getElementById('stSpreadF').innerHTML = withUnit(st.spreadF, '%');

  /* 记录行（倒序，最高/最低打标） */
  var top = month.length ? Math.max.apply(null, month.map(function (r) { return r.weight; })) : null;
  var bot = month.length ? Math.min.apply(null, month.map(function (r) { return r.weight; })) : null;
  var box = document.getElementById('recList');
  if (!month.length) {
    box.innerHTML = '<div class="wempty">本期还没有记录，上面加一条</div>';
  } else {
    box.innerHTML = month.slice().reverse().map(function (r) {
      var t = W.ymd(r.date);
      var badge = '';
      if (month.length > 1 && top !== bot) {
        if (r.weight === top) badge = '<span class="wrec__badge is-hi">最高</span>';
        else if (r.weight === bot) badge = '<span class="wrec__badge is-lo">最低</span>';
      }
      return '<div class="wrec">'
        + '<div class="wrec__date"><span class="wrec__md">' + t.m + '月' + t.d + '日</span><span class="wrec__wd">' + W.weekday(r.date) + '</span></div>'
        + '<div class="wrec__w">' + W.fmt1(r.weight) + '<span class="wrec__u">斤</span></div>'
        + '<div class="wrec__f">' + (r.bodyFat === null ? '-' : W.fmt1(r.bodyFat) + '%') + '</div>'
        + badge
        + '<div class="wrec__pen"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8C9A94" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16v4z"/></svg></div>'
        + '</div>';
    }).join('');
  }

  /* 智能分析（不足 3 条不出） */
  var ana = W.trend(month);
  var card = document.getElementById('anaCard');
  if (!ana) {
    card.style.display = 'none';
  } else {
    card.style.display = '';
    document.getElementById('anaSide').textContent = '按本月 ' + ana.count + ' 条';
    document.getElementById('anaLead').innerHTML = '本月体重趋势<span class="ana__tag is-' + ana.tone + '">' + ana.text + '</span>，平均每周变化 ' + ana.weeklyAbs + ' 斤。';
    document.getElementById('anaNotes').innerHTML = ana.notes.map(function (n) { return '<div class="ana__p">' + n + '</div>'; }).join('');
    document.getElementById('anaFoot').textContent = '跨度 ' + ana.days + ' 天，按首尾两条记录折算，仅供参考';
  }

  /* 图例 */
  var showW = state.mode !== 'fat';
  var showF = state.mode === 'fat' || state.mode === 'all';
  var lg = '';
  if (showW) lg += '<div class="wlegend__it"><div class="wlegend__dot is-w"></div><span>体重（斤）</span></div>';
  if (showF) lg += '<div class="wlegend__it"><div class="wlegend__dot is-f"></div><span>体脂（%）</span></div>';
  lg += '<span class="wlegend__hint">' + (hist ? '含全部历史' : '只看本月') + '</span>';
  document.getElementById('legend').innerHTML = lg;
  document.getElementById('allHint').style.display = hist ? '' : 'none';

  /* 画图 */
  view = fitCanvas();
  CH.drawTrend(view.ctx, { w: view.w, h: view.h, list: hist ? all : month, showW: showW, showF: showF });

  document.getElementById('phState').textContent =
    (state.user === 'me' ? '我' : 'TA') + ' · ' + W.monthLabel(state.y, state.m) + ' · ' + st.count + ' 条';
}

/* ---- 交互 ---- */
Array.prototype.forEach.call(document.querySelectorAll('.wseg__it[data-user]'), function (el) {
  el.addEventListener('click', function () {
    state.user = el.getAttribute('data-user');
    Array.prototype.forEach.call(document.querySelectorAll('.wseg__it[data-user]'), function (o) { o.classList.toggle('is-on', o === el); });
    refresh();
  });
});

Array.prototype.forEach.call(document.querySelectorAll('.wseg__it[data-mode]'), function (el) {
  el.addEventListener('click', function () {
    state.mode = el.getAttribute('data-mode');
    Array.prototype.forEach.call(document.querySelectorAll('.wseg__it[data-mode]'), function (o) { o.classList.toggle('is-on', o === el); });
    refresh();
  });
});

Array.prototype.forEach.call(document.querySelectorAll('.wmonth__btn'), function (el) {
  el.addEventListener('click', function () {
    var d = parseInt(el.getAttribute('data-nav'), 10);
    state.m += d;
    if (state.m < 1) { state.m = 12; state.y -= 1; }
    if (state.m > 12) { state.m = 1; state.y += 1; }
    refresh();
  });
});

window.addEventListener('resize', refresh);
refresh();
</script>
</body>
</html>
`;

  const outFile = path.join(ROOT, 'preview', 'weight-preview.html');
  fs.writeFileSync(outFile, html, 'utf8');
  console.log('wrote', outFile, html.length + ' bytes');
}).catch((e) => {
  console.error('LESS 编译失败:', e && e.message);
  process.exit(1);
});
