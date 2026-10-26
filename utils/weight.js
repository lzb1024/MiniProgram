// utils/weight.js — 体重追踪的纯计算层（不含任何 wx API，可离线自检）
//
// 数据形状（与网页版 weight-tracker/data.json 兼容）：
//   { version: 2, currentUser: 'me' | 'ta', users: { me: [rec], ta: [rec] } }
//   rec = { id, date: 'YYYY-MM-DD', weight: 斤, bodyFat: % | null }
//
// ⚠️ 日期一律按字符串切分 / Date.UTC 解析，绝不用 new Date('2026-03-07')
//   再取本地 getMonth()：那条路在 UTC 时区以外的表现随环境变，会把记录算到隔壁月。

/* ---------------- 基础 ---------------- */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 'YYYY-MM-DD' → { y, m, d }；非法返回 null */
function ymd(s) {
  const p = String(s == null ? '' : s).slice(0, 10).split('-');
  const y = Number(p[0]);
  const m = Number(p[1]);
  const d = Number(p[2]);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/** 当天日期字符串（本地时区） */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** 'YYYY-MM-DD' → UTC 毫秒，仅用于算天数差 */
function dayMs(s) {
  const t = ymd(s);
  return t ? Date.UTC(t.y, t.m - 1, t.d) : null;
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function weekday(s) {
  const ms = dayMs(s);
  if (ms === null) return '';
  return WEEK[new Date(ms).getUTCDay()];
}

function monthLabel(y, m) {
  return y + '年' + m + '月';
}

function inMonth(r, y, m) {
  const t = ymd(r && r.date);
  return !!t && t.y === y && t.m === m;
}

function byDateAsc(a, b) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

function byDateDesc(a, b) {
  return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
}

function toNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function r1(n) {
  return Math.round(n * 10) / 10;
}

/** 1 位小数的展示字符串，整数也补 .0（跟网页版一致） */
function fmt1(n) {
  const v = toNum(n);
  return v === null ? '' : v.toFixed(1);
}

/* ---------------- 清洗 / 归一 ---------------- */

function cleanRecord(raw, seq) {
  if (!raw || typeof raw !== 'object') return null;
  const t = ymd(raw.date);
  const w = toNum(raw.weight);
  if (!t || w === null) return null;
  let f = toNum(raw.bodyFat);
  // 体脂明显越界的当脏数据处理（0 也视为没填：网页版部分老记录是 0）
  if (f !== null && (f <= 0 || f > 75)) f = null;
  return {
    id: raw.id ? String(raw.id) : 'r' + (Date.now() + (seq || 0)),
    date: String(raw.date).slice(0, 10),
    weight: r1(w),
    bodyFat: f === null ? null : r1(f),
  };
}

/** 同一天只留最后一条，输出按日期升序 */
function dedupe(list) {
  const map = {};
  (Array.isArray(list) ? list : []).forEach((raw, i) => {
    const rec = cleanRecord(raw, i);
    if (rec) map[rec.date] = rec;
  });
  return Object.keys(map)
    .map((k) => map[k])
    .sort(byDateAsc);
}

/**
 * 归一任意来源的数据：网页导出（{users}）、旧版（{data:[]}）、纯数组都认。
 * 认不出来返回空壳，绝不抛错（导入失败不该把页面搞崩）。
 */
function normalize(obj) {
  const empty = { me: [], ta: [] };
  if (Array.isArray(obj)) return { me: dedupe(obj), ta: [] };
  if (!obj || typeof obj !== 'object') return empty;
  if (obj.users && typeof obj.users === 'object') {
    return { me: dedupe(obj.users.me || []), ta: dedupe(obj.users.ta || []) };
  }
  if (Array.isArray(obj.data)) return { me: dedupe(obj.data), ta: [] };
  if (Array.isArray(obj.records)) return { me: dedupe(obj.records), ta: [] };
  return empty;
}

function totalCount(users) {
  if (!users) return 0;
  return (users.me ? users.me.length : 0) + (users.ta ? users.ta.length : 0);
}

/* ---------------- 统计 ---------------- */

/** list 必须已按日期升序 */
function stat(list) {
  const out = {
    count: list ? list.length : 0,
    empty: !list || !list.length,
    hasFat: false,
    latestW: '',
    maxW: '',
    minW: '',
    spreadW: '',
    latestF: '',
    maxF: '',
    minF: '',
    spreadF: '',
  };
  if (out.empty) return out;

  out.latestW = fmt1(list[list.length - 1].weight);

  let mx = list[0];
  let mn = list[0];
  for (let i = 1; i < list.length; i++) {
    if (list[i].weight > mx.weight) mx = list[i];
    if (list[i].weight < mn.weight) mn = list[i];
  }
  out.maxW = fmt1(mx.weight);
  out.minW = fmt1(mn.weight);
  out.spreadW = fmt1(mx.weight - mn.weight);

  const fats = list.filter((r) => typeof r.bodyFat === 'number' && r.bodyFat !== null);
  if (fats.length) {
    out.hasFat = true;
    out.latestF = fmt1(fats[fats.length - 1].bodyFat);
    let fx = fats[0];
    let fn = fats[0];
    for (let i = 1; i < fats.length; i++) {
      if (fats[i].bodyFat > fx.bodyFat) fx = fats[i];
      if (fats[i].bodyFat < fn.bodyFat) fn = fats[i];
    }
    out.maxF = fmt1(fx.bodyFat);
    out.minF = fmt1(fn.bodyFat);
    out.spreadF = fmt1(fx.bodyFat - fn.bodyFat);
  }
  return out;
}

/**
 * 趋势判定（至少 3 条才给结论）。
 * 阈值沿用网页版：按「每周变化多少斤」分档。
 */
function trend(list) {
  if (!list || list.length < 3) return null;
  const first = list[0];
  const last = list[list.length - 1];
  const d0 = dayMs(first.date);
  const d1 = dayMs(last.date);
  const days = d0 !== null && d1 !== null && d1 > d0 ? (d1 - d0) / 86400000 : 0;
  const weekly = days > 0 ? ((last.weight - first.weight) / days) * 7 : 0;

  let key = 'flat';
  let text = '保持稳定';
  let tone = 'flat';
  if (weekly < -0.5) {
    key = 'down';
    text = '下降较快';
    tone = 'good';
  } else if (weekly < -0.2) {
    key = 'down-soft';
    text = '稳步下降';
    tone = 'good';
  } else if (weekly < 0.2) {
    key = 'flat';
    text = '保持稳定';
    tone = 'flat';
  } else if (weekly < 0.5) {
    key = 'up-soft';
    text = '小幅上升';
    tone = 'warn';
  } else {
    key = 'up';
    text = '上升较快';
    tone = 'bad';
  }

  const notes = [];
  if (weekly < -1) notes.push('掉得偏快，注意别把肌肉一起减掉，蛋白质要吃够。');
  else if (weekly > 0.5) notes.push('体重在往上走，可以加一点有氧或者收一收主食。');
  else notes.push('变化幅度不大，保持现在的节奏就行。');

  const fats = list.filter((r) => typeof r.bodyFat === 'number' && r.bodyFat !== null);
  if (fats.length >= 3) {
    const delta = fats[fats.length - 1].bodyFat - fats[0].bodyFat;
    if (Math.abs(delta) < 0.2) {
      notes.push(weekly < -0.2 ? '体脂基本没动，掉的重量里可能含水。' : '体成分比较稳定。');
    } else {
      notes.push(
        '体脂' + (delta < 0 ? '下降' : '上升') + ' ' + fmt1(Math.abs(delta)) + '%，' +
          (delta < 0 ? '脂肪确实在减少。' : '注意看看饮食结构。'),
      );
    }
  }

  return {
    weekly,
    weeklyAbs: fmt1(Math.abs(weekly)),
    key,
    text,
    tone,
    notes,
    days: Math.round(days),
    count: list.length,
  };
}

/* ---------------- BMI ---------------- */

function bmi(heightCm, jin) {
  const h = toNum(heightCm);
  const w = toNum(jin);
  if (h === null || h < 100 || h > 250) return { ok: false, reason: '身高请在 100-250cm 之间' };
  if (w === null || w < 60 || w > 400) return { ok: false, reason: '体重请在 60-400 斤之间' };

  const v = w / 2 / Math.pow(h / 100, 2);
  let category = '';
  let range = '';
  let tone = '';
  if (v < 18.5) {
    category = '体重过轻';
    range = 'BMI < 18.5';
    tone = 'low';
  } else if (v < 24) {
    category = '正常体重';
    range = '18.5 ≤ BMI < 24';
    tone = 'good';
  } else if (v < 28) {
    category = '超重';
    range = '24 ≤ BMI < 28';
    tone = 'warn';
  } else if (v < 35) {
    category = '肥胖';
    range = '28 ≤ BMI < 35';
    tone = 'bad';
  } else {
    category = '重度肥胖';
    range = 'BMI ≥ 35';
    tone = 'bad';
  }
  return { ok: true, value: v.toFixed(1), category, range, tone };
}

module.exports = {
  pad2,
  ymd,
  todayStr,
  dayMs,
  weekday,
  monthLabel,
  inMonth,
  byDateAsc,
  byDateDesc,
  toNum,
  r1,
  fmt1,
  dedupe,
  normalize,
  totalCount,
  stat,
  trend,
  bmi,
};
