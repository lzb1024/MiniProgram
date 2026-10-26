// utils/weight-chart.js — 体重趋势图绘制（canvas 2d，纯函数，不碰 wx API）
//
// 单独拎出来两个原因：
//   ① pages/weight 的 JS 已经够长，绘图细节不该占满一屏；
//   ② preview/weight-preview.html 可以内联同一份代码，网页预览和小程序里长得一致。
//
// 用法：drawTrend(ctx, { w, h, list, showW, showF })
//   ctx  已经按 dpr 缩放过的 2d context
//   w/h  逻辑像素（CSS 像素），不是 canvas.width
//   list 升序记录 [{ date: 'YYYY-MM-DD', weight, bodyFat }]
//   showW/showF 画哪条线；bodyFat 为 null 的那天体脂线断开

/* 配色对着 variable.less 的令牌抄（canvas 拿不到 CSS 变量，改主题要同步这里） */
const COLORS = {
  sky: '#2E6E95', // 体重：雪峰蓝（信息色）
  skyFill: 'rgba(46, 110, 149, 0.16)',
  skyFade: 'rgba(46, 110, 149, 0)',
  clay: '#B4552D', // 体脂：陶土棕（第二量）
  grid: '#EEECE2',
  tick: '#8C9A94',
};

/** 值域 → 画布范围（单点时上下各撑 1，避免除零） */
function rangeOf(values) {
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.14;
  return { min: min - pad, max: max + pad };
}

/** 'YYYY-MM-DD' → { y, m, d }，只切字符串，不碰时区 */
function ymd(s) {
  const p = String(s == null ? '' : s).slice(0, 10).split('-');
  if (p.length !== 3) return null;
  const y = Number(p[0]);
  const m = Number(p[1]);
  const d = Number(p[2]);
  return y && m && d ? { y, m, d } : null;
}

/** 圆点：白圈 + 实心，压在线上不会糊成一团 */
function dot(ctx, x, y, color, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r - 1, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawHint(ctx, w, h, text) {
  ctx.font = '12px sans-serif';
  ctx.fillStyle = COLORS.tick;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
  ctx.textAlign = 'left';
}

function drawTrend(ctx, opt) {
  const w = opt.w;
  const h = opt.h;
  const list = opt.list || [];
  const wantFat = !!opt.showF;

  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '10px sans-serif';

  if (!list.length) return drawHint(ctx, w, h, '本期还没有记录');

  // 只看体脂时，没填体脂的那天直接不画
  const pts = [];
  list.forEach((r) => {
    const fat = typeof r.bodyFat === 'number' ? r.bodyFat : null;
    if (!opt.showW && wantFat && fat === null) return;
    pts.push({ date: r.date, w: r.weight, f: fat });
  });
  // 只有这一种情况会让 pts 变空：只看体脂，而这期一条体脂都没填
  if (!pts.length) return drawHint(ctx, w, h, '本期还没有体脂数据');

  const wVals = opt.showW ? pts.map((p) => p.w) : [];
  const fVals = wantFat ? pts.filter((p) => p.f !== null).map((p) => p.f) : [];

  const padL = 30;
  const both = opt.showW && wantFat;
  const padR = both ? 32 : 10;
  const padT = 16;
  const padB = 24;
  const iw = w - padL - padR;
  const ih = h - padT - padB;

  const sw = wVals.length ? rangeOf(wVals) : null;
  const sf = fVals.length ? rangeOf(fVals) : null;

  const xOf = (i) => (pts.length === 1 ? padL + iw / 2 : padL + (iw * i) / (pts.length - 1));
  const yOf = (v, s) => padT + ih * (1 - (v - s.min) / (s.max - s.min));

  /* --- 网格与左侧刻度（有体重用体重量程，只有体脂用体脂量程） --- */
  const left = sw || sf;
  const span = left.max - left.min;
  const axisFmt = (v) => (span >= 20 ? v.toFixed(0) : v.toFixed(1));

  for (let i = 0; i <= 4; i++) {
    const y = padT + (ih * i) / 4;
    ctx.beginPath();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + iw, y);
    ctx.stroke();

    ctx.fillStyle = COLORS.tick;
    ctx.fillText(axisFmt(left.max - (span * i) / 4), 0, y);
  }

  /* --- 右侧体脂刻度（只有两条线同时出现时才需要） --- */
  if (both && sf) {
    const fspan = sf.max - sf.min;
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      ctx.fillStyle = COLORS.tick;
      ctx.fillText(fspan >= 20 ? (sf.max - (fspan * i) / 4).toFixed(0) : (sf.max - (fspan * i) / 4).toFixed(1), w, padT + (ih * i) / 4);
    }
    ctx.textAlign = 'left';
  }

  /* --- 体重：面积 + 折线 + 圆点 --- */
  if (opt.showW) {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = xOf(i);
      const y = yOf(p.w, sw);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xOf(pts.length - 1), padT + ih);
    ctx.lineTo(xOf(0), padT + ih);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, padT, 0, padT + ih);
    g.addColorStop(0, COLORS.skyFill);
    g.addColorStop(1, COLORS.skyFade);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = xOf(i);
      const y = yOf(p.w, sw);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = COLORS.sky;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    pts.forEach((p, i) => dot(ctx, xOf(i), yOf(p.w, sw), COLORS.sky, 2.8));
  }

  /* --- 体脂：没填的那天断开，不硬连 --- */
  if (wantFat && sf) {
    let seg = [];
    const flush = () => {
      if (seg.length > 1) {
        ctx.beginPath();
        seg.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.strokeStyle = COLORS.clay;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      seg.forEach((p) => dot(ctx, p.x, p.y, COLORS.clay, 2.4));
      seg = [];
    };
    pts.forEach((p, i) => {
      if (p.f === null) return flush();
      seg.push({ x: xOf(i), y: yOf(p.f, sf) });
    });
    flush();
  }

  /* --- 横轴日期：首尾必出，中间等分，最多 5 个以免挤成一片 --- */
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.ceil((pts.length - 1) / 4));
  pts.forEach((p, i) => {
    const last = i === pts.length - 1;
    if (i !== 0 && !last && i % step !== 0) return;
    const t = ymd(p.date);
    if (!t) return;
    ctx.fillStyle = COLORS.tick;
    ctx.fillText(t.m + '/' + t.d, xOf(i), padT + ih + 12);
  });
  ctx.textAlign = 'left';
}

module.exports = {
  COLORS,
  rangeOf,
  drawTrend,
  drawHint,
};
