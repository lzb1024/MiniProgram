// api/weather.js
// 首页天气数据源，两个出口：
//   fetchWeather(days)     → 顶部「实时天气」条：当前关注城市的实况 + 出发日提示
//   fetchWeekWeather(days) → 逐日区块顶部的七天条（恒 7 格）+ 逐日卡要的行程日预报
//
// 链路：首页 → 本模块 → wx.cloud.callFunction('weather') → 腾讯位置服务。
// 任何一层不可用（没配云环境 / 云函数没部署 / 没配 Key / 上游超时）
// 一律返回 null，页面据此整块不渲染 —— 不弹错、不阻塞、不白屏。
//
// 关于查询范围：腾讯位置服务天气接口硬上限是「当天 + 未来 6 天」，
// 九天行程不可能一次全覆盖，所以顶部实况条只做「当前关注城市」那一个点：
// 行程没开始时看出发地，行程进行中看当天所在城市。七天条则在同一个 7 天窗口里
// 逐格换城市（见文件末尾）。
import { ensureCloud } from '~/utils/cloud';

/**
 * 行程里出现的城市 → 坐标（纬度,经度）。取镇 / 景区所在点即可，接口会落到所在区县。
 * 加新行程、行程里出现新城市时往这里加一条；没有坐标的城市会被静默跳过
 * （实时天气条整条不渲染、七天条该格回落出发地），不会报错。
 */
const CITY_POINTS = {
  成都: { key: 'chengdu', location: '30.657,104.066' },
  四姑娘山: { key: 'siguniang', location: '31.083,102.888' },
  九寨沟: { key: 'jiuzhaigou', location: '33.260,103.918' },
  长沙: { key: 'changsha', location: '28.228,112.939' },
};

const CACHE_KEY = 'weather_cache';
const CACHE_TTL = 30 * 60 * 1000;
const CLOCK = 12;

/** '2026-09-25' → Date。固定取中午，避开时区与夏令时在日界上的抖动 */
function noonOf(str) {
  const p = String(str || '').split('-').map(Number);
  if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
  return new Date(p[0], p[1] - 1, p[2], CLOCK, 0, 0);
}

function todayNoon() {
  const d = new Date();
  d.setHours(CLOCK, 0, 0, 0);
  return d;
}

function dateKey(date) {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** '2026-09-25' → '9.25' */
function shortDate(str) {
  const p = String(str || '').split('-');
  return p.length === 3 ? `${Number(p[1])}.${Number(p[2])}` : str || '';
}

/** 低~高℃，缺哪头写哪头。顶部大号温度、逐日卡、出发日提示三处共用 */
function tempRange(low, high) {
  const lo = typeof low === 'number' ? low : null;
  const hi = typeof high === 'number' ? high : null;
  if (lo === null && hi === null) return '';
  if (lo === null) return `${hi}℃`;
  if (hi === null) return `${lo}℃`;
  return `${lo}~${hi}℃`;
}

/** 今天那条预报的温度区间；拿不到就返回空串，调用方自己退回实况温度 */
function todayRange(forecast) {
  const key = dateKey(todayNoon());
  const f = (forecast || []).find((x) => x && x.date === key);
  return f ? tempRange(f.nightTemp, f.dayTemp) : '';
}

function readCache() {
  try {
    const box = wx.getStorageSync(CACHE_KEY);
    if (box && box.at && Date.now() - box.at < CACHE_TTL) return box.value;
  } catch (err) {
    /* 读缓存失败就当没有 */
  }
  return null;
}

function writeCache(value) {
  try {
    wx.setStorageSync(CACHE_KEY, { at: Date.now(), value });
  } catch (err) {
    /* 写不进去也不影响本次展示 */
  }
}

/** 今天该看哪个城市：行程中看当天，未开始看出发日，已结束返回 null */
function pickFocus(days) {
  const list = days.filter((d) => d && d.date);
  if (!list.length) return null;

  const start = noonOf(list[0].date);
  const end = noonOf(list[list.length - 1].date);
  const now = todayNoon();
  if (!start || !end || now > end) return null;

  if (now < start) return { day: list[0], ongoing: false };

  const key = dateKey(now);
  return { day: list.find((d) => d.date === key) || list[0], ongoing: true };
}

/**
 * 查实时天气。
 * @param {Array} days 首页的 days，需带 date / city 字段
 * @returns {Promise<null|Object>} null 表示不展示；否则给页面一个可直接渲染的对象
 */
export async function fetchWeather(days) {
  const focus = pickFocus(days || []);
  if (!focus) return null;

  const city = focus.day.city;
  const point = CITY_POINTS[city];
  if (!point) return null;

  const cached = readCache();
  if (cached && cached.city === city && cached.date === focus.day.date) return cached;

  // 没配云环境时直接退出，不做无谓的失败调用
  if (!ensureCloud()) return null;

  let payload = null;
  try {
    const res = await wx.cloud.callFunction({
      name: 'weather',
      data: { points: [{ key: point.key, location: point.location }], getMd: 1 },
    });
    payload = res && res.result;
  } catch (err) {
    console.error('[weather] 云函数调用失败（检查是否已部署 weather 云函数）', err);
    return null;
  }

  if (!payload || !payload.ok || !payload.data) {
    // NO_KEY 属于「还没配好」的预期状态，不当异常刷错误日志，免得排查真问题时被淹没
    const quiet = payload && payload.error === 'NO_KEY';
    const log = quiet ? console.warn : console.error;
    log('[weather] 未取到数据', (payload && (payload.message || payload.error)) || '云函数无返回');
    return null;
  }

  const entry = payload.data[point.key];
  if (!entry) return null;

  const view = buildView(entry, focus, city);
  if (view) writeCache(view);
  return view;
}

/** 把云函数返回的 raw 结构整理成页面直接可用的形状 */
function buildView(entry, focus, city) {
  const rt = entry.realtime;
  const forecast = entry.forecast || [];
  const day = focus.day;

  if (!rt && !forecast.length) return null;

  const view = {
    city,
    date: day.date,
    // 主行
    text: (rt && rt.weather) || '',
    // 大号温度给「今天这一天的区间」——只甩一个 19℃ 看不出温差；拿不到预报才退回实况温度
    temp: todayRange(forecast) || (rt && typeof rt.temperature === 'number' ? `${rt.temperature}℃` : ''),
    // 次行：实况温度挪到这里，配上风与湿度
    meta: [
      rt && typeof rt.temperature === 'number' ? `实况 ${rt.temperature}℃` : '',
      rt && rt.wind,
      rt && typeof rt.humidity === 'number' ? `湿度 ${rt.humidity}%` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    // 行程尚未开始时，额外给一条出发日提示；行程中就不重复了，主行就是今天
    hint: '',
    ongoing: focus.ongoing,
  };

  if (focus.ongoing) return view;

  const startKey = day.date;
  const match = forecast.find((f) => f && f.date === startKey);
  if (match) {
    view.hint = `出发日 ${shortDate(startKey)} · ${match.dayWeather || '数据待更新'} ${tempRange(
      match.nightTemp,
      match.dayTemp
    )}`.trim();
  } else {
    // 出发日还在 7 天窗口之外，把「哪天才查得到」算出来告诉用户
    const openAt = new Date(noonOf(startKey).getTime() - 6 * 86400000);
    view.hint = `出发日 ${shortDate(startKey)} 的预报 ${shortDate(dateKey(openAt))} 起可查`;
  }

  return view;
}

/* ================= 未来七天条 + 逐日预报（一次查询喂两处） =================
 *
 * 接口硬上限是「当天 + 未来 6 天」，所以：
 *   - 七天条恒 7 格 = [今天, 今天+6]，格子是日历日，每次打开整体前移；
 *   - 每格看哪个城市由行程决定：这天在行程里就按那天的城市查并挂 DAY n 徽标，
 *     不在行程里就回到出发地 —— 于是出发前打开时整条就是出发地的天气；
 *   - 行程结束（今天 > 最后一天）后整块下线，与顶部实况条保持一致。
 *
 * 逐日卡要的「行程日真实预报」和七天条同源，合并成一次请求，
 * 免得同一批城市查两遍。
 */
const WEEK_SPAN = 6;
const WEEK_CACHE_KEY = 'weather_week_cache';
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function readWeekCache(tag) {
  try {
    const box = wx.getStorageSync(WEEK_CACHE_KEY);
    if (box && box.tag === tag && box.at && Date.now() - box.at < CACHE_TTL) return box.value;
  } catch (err) {
    /* 读缓存失败就当没有 */
  }
  return null;
}

function writeWeekCache(tag, value) {
  try {
    wx.setStorageSync(WEEK_CACHE_KEY, { at: Date.now(), tag, value });
  } catch (err) {
    /* 写不进去也不影响本次展示 */
  }
}

/** 今天起 7 天的日期串。ISO 日期串可以直接比大小，省掉 Date 转换 */
function weekKeys() {
  const cursor = todayNoon();
  const list = [];
  for (let i = 0; i <= WEEK_SPAN; i++) {
    list.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return list;
}

/** 那天该看哪个城市：行程日看当天城市，不在行程里就回到出发地 */
function cityOn(key, days, home) {
  const hit = days.find((d) => d.date === key);
  return hit && CITY_POINTS[hit.city] ? hit.city : home;
}

/**
 * 上游同一列里「晴天」与「晴」混着写（9.13 那份响应里白天写「阵雨」、夜间写「晴天」），
 * 收成单字，免得七天条上两格读着不一样。只吃「X天」这种尾巴，不碰「多云」「小雨」。
 */
const WEATHER_TAIL = /^(.*[晴阴雨雪])天$/;

function trimWeather(w) {
  const s = String(w || '').trim();
  const m = s.match(WEATHER_TAIL);
  return m ? m[1] : s;
}

/** 白天夜间一致就只写一个，避免「多云转多云」这种废话 */
function weatherText(f) {
  const dw = trimWeather(f && f.dayWeather);
  const nw = trimWeather(f && f.nightWeather);
  return dw && nw && dw !== nw ? `${dw}转${nw}` : dw || nw || '';
}

/**
 * 未来七天 + 逐日预报。
 * @param {Array} days 首页 days，需带 date / city
 * @returns {Promise<null|{week: Array, daily: Object}>}
 *   null  = 不展示（行程已结束 / 出发地没有坐标 / 云环境或云函数不可用）
 *   week  = 恒 7 格 { date, md, wd, label, city, text, temp, line, isToday, inTrip }
 *   daily = { '2026-09-25': { text, temp } }，只含落在窗口内的行程日
 */
export async function fetchWeekWeather(days) {
  const list = (days || []).filter((d) => d && d.date && d.city);
  if (!list.length) return null;

  const now = todayNoon();
  const end = noonOf(list[list.length - 1].date);
  if (!end || now > end) return null; // 行程结束后整块下线

  const home = CITY_POINTS[list[0].city] ? list[0].city : '';
  if (!home) return null; // 出发地没有坐标可查，整块不展示

  const cells = weekKeys().map((key) => {
    const pos = list.findIndex((d) => d.date === key);
    return { key, pos, city: cityOn(key, list, home) };
  });

  const cities = [];
  cells.forEach((c) => {
    if (cities.indexOf(c.city) < 0) cities.push(c.city);
  });

  const points = cities.map((c) => ({ key: CITY_POINTS[c].key, location: CITY_POINTS[c].location }));
  // 缓存按「窗口首日 + 城市集合」打标：跨过午夜或换了城市都会自动失效
  const tag = `${cells[0].key}|${points.map((p) => p.key).join(',')}`;

  const cached = readWeekCache(tag);
  if (cached) return cached;

  if (!ensureCloud()) return null;

  let payload = null;
  try {
    const res = await wx.cloud.callFunction({ name: 'weather', data: { points, getMd: 1 } });
    payload = res && res.result;
  } catch (err) {
    console.error('[weather] 七天预报云函数调用失败（检查是否已部署 weather 云函数）', err);
    return null;
  }

  if (!payload || !payload.ok || !payload.data) {
    const quiet = payload && payload.error === 'NO_KEY';
    const log = quiet ? console.warn : console.error;
    log('[weather] 七天预报未取到数据', (payload && (payload.message || payload.error)) || '云函数无返回');
    return null;
  }

  const todayKey = cells[0].key;
  const week = cells.map((c) => {
    const entry = payload.data[CITY_POINTS[c.city].key];
    const f = ((entry && entry.forecast) || []).find((x) => x && x.date === c.key);
    const text = weatherText(f);
    const temp = f ? tempRange(f.nightTemp, f.dayTemp) : '';
    const inTrip = c.pos >= 0;
    const wd = WEEKDAYS[noonOf(c.key).getDay()];
    // 格首那行：行程日内写 DAY n，今天再叠一个「今天」，其余写星期
    const dayTag = inTrip ? `DAY${c.pos + 1}` : '';
    const label =
      c.key === todayKey ? (dayTag ? `${dayTag} · 今天` : '今天') : dayTag || wd;
    return {
      date: c.key,
      md: shortDate(c.key),
      wd,
      label,
      city: c.city,
      text,
      temp,
      // 一行摘要：格子 UI 是 text / temp 分两行渲染的，这个只留给日志与自检拼读
      line: [text, temp].filter(Boolean).join(' '),
      isToday: c.key === todayKey,
      inTrip,
    };
  });

  // 七格全空说明上游没给可用数据，别渲染一条空架子
  if (!week.some((w) => w.text || w.temp)) return null;

  // 逐日卡只要行程日那几天，其余格子归七天条
  const daily = {};
  week.forEach((w) => {
    if (w.inTrip && (w.text || w.temp)) {
      daily[w.date] = { text: w.text ? `${w.city} · ${w.text}` : w.city, temp: w.temp };
    }
  });

  const out = { week, daily };
  writeWeekCache(tag, out);
  return out;
}
