#!/usr/bin/env node
/**
 * _gen-1home.js — 由 mock/trips/chuanxi.js 生成首页预览片段
 *
 *   node preview/_gen-1home.js
 *
 * 为什么要有这个脚本：
 *   preview/_screens/1-home.html 是静态片段，不会自动跟随 mock 变化。
 *   曾经因为手写片段只写了 3 天（真实数据 7 天），被误认为「行程丢了」。
 *   改动 mock/trips/chuanxi.js 后跑一次本脚本，片段就与真实数据一致。
 *
 * 注意：
 *   - 06 物品准备 的真实数据在云端或本机（api/trip.js），不在 mock 里。
 *     这里渲染的是「首次打开」的状态：清单空，与真机一致（不是画几条假数据）。
 *   - 07 花费统计 的真数据同样在云端 / 本机，但明细列表的折叠头条只在「有记录」时才渲染，
 *     空态下预览里看不到这个控件，所以额外画了 PREVIEW_COSTS 那 11 条示意记录，
 *     片段按「展开态」渲染。**真机首次打开是空的，且默认收起。**
 *   - 08 交通记录 的真数据同样在云端 / 本机，表单也按「首次打开」渲染成空态；
 *     但列表与逐日时间线里额外画了 PREVIEW_TRAFFIC 那一条示意记录，
 *     否则看不出「记完会按时间排进当天行程」的效果。**真机上这里默认是空的。**
 *   - 片段里 9 天全部展开（逐日里已经没有别的折叠了），这样预览能通览全部内容。
 *   - 预约倒计时的天数按运行本脚本当天的日期实时算，和小程序里一致。
 *   - 首页已按需求删掉「08 同行记录」，页脚 foot 是产品原有的。
 *   - Hero 下方的「实时天气」条真机靠云函数取（api/weather.js），预览里用示意值渲染，
 *     只展示版式；其中「出发日提示」那行按运行本脚本当天的日期实时算，和小程序一致。
 *   - 逐日区块顶部的「未来七天」条同样靠云函数取，预览里用一组示意值，
 *     取的是「行程第 1 天打开」的样子（窗口正好压上 DAY 1 到 DAY 7）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// 数据搬到 mock/trips/ 下后要跟着改这里（2026-10-07 综合版改造）。
// 这个脚本只给川西那份出预览片段：长沙的内容是占位，等填完真实文案再考虑加第二个片段。
const MOCK = path.join(ROOT, 'mock', 'trips', 'chuanxi.js');
const OUT = path.join(__dirname, '_screens', '1-home.html');

/* ---------- 1. 读出 mock 数据（把 ESM 的 export default 转成 CommonJS 再 require） ---------- */
const src = fs.readFileSync(MOCK, 'utf8').replace(/export\s+default\s+/, 'module.exports = ');
const tmp = path.join(ROOT, '.workbuddy', '_trip.tmp.cjs');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, src, 'utf8');
const trip = require(tmp).data.data;
fs.unlinkSync(tmp);

// 「逐日真实预报」只在接口 7 天窗口内才出现（今天 9.12 还够不到 9.25 出发日），
// 预览里给 DAY 3（9.27 四姑娘山）注入一条示意，方便看版式。真机要等 9.19 才看得到真实数据。
trip.days[2].live = { text: '四姑娘山 · 阵雨转多云', temp: '12~20℃' };

/* ---------- 2. 小工具 ---------- */
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// mock 里的 t-icon name → 预览雪碧图 id（在 build-preview.js 的 SPRITE 里定义）
const ICON = {
  calendar: 'ic-calendar',
  time: 'ic-time',
  user: 'ic-user',
  money: 'ic-money',
  flag: 'ic-flag',
  'cloudy-day': 'ic-cloud',
  'map-route-planning': 'ic-route',
  tips: 'ic-tips',
  home: 'ic-home',
  location: 'ic-location',
  link: 'ic-link',
  edit: 'ic-edit',
  menu: 'ic-menu',
  search: 'ic-search',
  check: 'ic-check',
  close: 'ic-close',
  'chevron-up': 'ic-up',
  'chevron-down': 'ic-down',
};
const ic = (name, cls = 'ic ic--pine') => `<svg class="${cls}"><use href="#${ICON[name] || 'ic-tips'}"/></svg>`;

// 金额显示：和小程序里 fmtNum 一致
const fmtNum = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};
const parseDate = (str) => {
  const p = String(str || '').split('-').map(Number);
  return p.length === 3 && p[0] ? new Date(p[0], p[1] - 1, p[2], 12, 0, 0) : null;
};
const monthDay = (d) => (d ? `${d.getMonth() + 1}月${d.getDate()}日` : '');

/* ---------- 2.5 07 交通记录的示意记录 ---------- */
/* 真机上交通记录由用户自己填（云端 traffic 集合），首次打开是空的。
   预览里必须画一条，否则「记完按时间排进当天行程」这个核心效果看不见。
   规则与 pages/home/index.js 的 mergeTraffic 保持一致：只插入、不重排原有条目。
   src / link 也照真机来：填了小程序链接的条目在列表里是可点的胶囊，
   link 在这里只是版式示意（预览是静态 HTML，不存在真跳转）。 */
const PREVIEW_TRAFFIC = [
  {
    id: 'demo-1',
    date: '2026-10-02',
    time: '16:40',
    mode: '打车',
    from: '宽窄巷子',
    to: '太古里',
    src: '滴滴出行',
    link: '#小程序://滴滴出行/2fQ9mXcT7pLw',
  },
];

const timeToMin = (t) => {
  const m = String(t == null ? '' : t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};

const trafficC = (r) => {
  const from = (r.from || '').trim();
  const to = (r.to || '').trim();
  const no = (r.no || '').trim();
  const mode = r.mode || '交通';
  const tail = [mode, no].filter(Boolean).join(' · ');
  if (from && to) return { c: `${from} → ${to}`, sub: tail };
  if (from) return { c: `从 ${from} 出发`, sub: tail };
  if (to) return { c: `前往 ${to}`, sub: tail };
  return { c: no ? `${mode} ${no}` : mode, sub: '' };
};

const mDText = (str) => {
  const p = String(str || '').split('-');
  return p.length === 3 ? `${Number(p[1])}月${Number(p[2])}日` : '';
};

const dayTagByDate = {};
trip.days.forEach((d, i) => {
  if (d.date) dayTagByDate[d.date] = `DAY ${i + 1}`;
});

const previewTraffic = PREVIEW_TRAFFIC.map((r) => ({
  ...r,
  ...trafficC(r),
  dateText: mDText(r.date),
  dayTag: dayTagByDate[r.date] || '',
})).sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.time < b.time ? -1 : 1));

// 并入逐日时间线：插在「最后一条时刻不晚于它」的条目之后，比所有条目都早则插到最前
// （来源拼进副行，与 pages/home/index.js 的 mergeTraffic 同款）
trip.days.forEach((d) => {
  const list = d.timeline.slice();
  previewTraffic
    .filter((r) => r.date === d.date)
    .forEach((r) => {
      const target = timeToMin(r.time);
      let at = 0;
      for (let i = 0; i < list.length; i++) {
        const m = timeToMin(list[i].t);
        if (target !== null && m !== null && m <= target) at = i + 1;
      }
      list.splice(at, 0, {
        t: r.time,
        c: r.c,
        // 与 pages/home/index.js 的 mergeTraffic 同款：有链接时来源走独立胶囊，副行不重复
        sub: r.link ? r.sub : [r.sub, r.src].filter(Boolean).join(' · '),
        commute: true,
        mine: true,
        src: r.src || '',
        link: r.link || '',
      });
    });
  d.timeline = list;
});

/* ---------- 3. 渲染各区块 ---------- */

/* 吸顶章节导航：第一行章节、第二行 DAY 1-9 */
const tocHtml = `  <div class="toc">
    <div class="toc__scroll">
      <div class="toc__list">
${trip.sections
  .map((s, i) => `        <div class="toc__item${i === 0 ? ' is-on' : ''}">${esc(s.text)}</div>`)
  .join('\n')}
      </div>
    </div>
    <div class="toc__scroll toc__scroll--day">
      <div class="toc__list">
${trip.dayTabs
  .map((d, i) => `        <div class="toc__day${i === 0 ? ' is-on' : ''}">${esc(d.text)}</div>`)
  .join('\n')}
      </div>
    </div>
  </div>`;

const hero = trip.hero;
const heroHtml = `    <div class="hero">
      <div class="hero__kicker"><div class="hero__dot"></div><span>${esc(hero.kicker)}</span></div>
      <div class="hero__title"><span>${esc(hero.titleMain)}</span><span class="hero__title--grad"> ${esc(
  hero.titleGrad
)}</span></div>
      <div class="hero__sub">${esc(hero.subtitle)}</div>
      <div class="hero__meta">
${hero.meta
  .map((m) => `        <div class="hero__chip">${ic(m.icon, 'ic ic--sm ic--pine')}<span>${esc(m.text)}</span></div>`)
  .join('\n')}
      </div>
    </div>`;

/* Hero 下方的实时天气条：真机数据来自云函数（api/weather.js），
   预览里用固定示意值渲染，只有「出发日提示」那行按今天实时算。
   大号那串是**今天这一天的区间**（17~25℃），当前实况温度让到次行的「实况 22℃」，
   和小程序里一致；真机拿不到数据时整条不渲染，页面与没有这个功能时完全一致。 */
const liveFocus = trip.days[0];
const liveStart = parseDate(liveFocus.date);
const liveOpenAt = new Date(liveStart.getTime() - 6 * 86400000);
const liveToday = new Date();
liveToday.setHours(12, 0, 0, 0);
const liveReachable = liveToday >= liveOpenAt;
const mdShort = (d) => `${d.getMonth() + 1}.${d.getDate()}`;

const liveHtml = `    <div class="live">
      <div class="live__head">
        ${ic('cloudy-day', 'ic ic--sky ic--sm')}
        <span class="live__label">实时天气</span>
        <span class="live__city">${esc(liveFocus.city)}</span>
        <span class="live__temp">17~25℃</span>
      </div>
      <div class="live__text"><span>多云</span><span> · 实况 22℃ · 东北风 2-3级 · 湿度 60%</span></div>
      <div class="live__hint">${
        liveReachable
          ? `出发日 ${mdShort(liveStart)} · 多云 12~18℃`
          : `出发日 ${mdShort(liveStart)} 的预报 ${mdShort(liveOpenAt)} 起可查`
      }</div>
    </div>`;

/* 01 行程总览 */
const overviewHtml = `    <div class="sec" id="sec-overview">
      <div class="fg-sec-title"><span class="n">01</span><span class="t">行程总览</span><div class="bar"></div><span class="sec__meta">点击跳转</span></div>
      <div class="ov">
${trip.days
  .map(
    (d) => `        <div class="ovcard">
          <div class="ovcard__tag">${esc(d.tag)}</div>
          <div class="ovcard__title">${esc(d.cardTitle || d.title)}</div>
          <div class="ovcard__brief">${esc(d.brief)}</div>
          <div class="ovcard__stay">${ic('home', 'ic ic--pine')}<span>${esc(d.stay)}</span>${
            d.stayGeo ? `<div class="ovcard__geo">${ic('location', 'ic ic--sky ic--sm')}</div>` : ''
          }</div>
        </div>`
  )
  .join('\n')}
      </div>
    </div>`;

/* 02 逐日安排 */
const dayHtml = (d) => {
  // 落在接口 7 天窗口内的行程日显示真实预报（白底），其余继续显示攻略里的参考文案（透底）
  const hasLive = !!(d.live && (d.live.text || d.live.temp));
  let dwxInner = '';
  let dwxLabel = '';
  if (hasLive) {
    dwxLabel = '实时预报';
    dwxInner =
      `          <div class="dwx__item is-live"><span class="dwx__text">${esc(d.live.text || '')}</span>` +
      (d.live.temp ? `<span class="dwx__temp">${esc(d.live.temp)}</span>` : '') +
      `</div>`;
  } else if (d.weather && d.weather.length) {
    dwxLabel = '当日天气 · 参考';
    dwxInner = d.weather
      .map(
        (w) =>
          `          <div class="dwx__item${w.hot ? ' is-hot' : ''}"><span class="dwx__text">${esc(w.text)}</span>` +
          (w.temp ? `<span class="dwx__temp">${esc(w.temp)}</span>` : '') +
          (w.rain ? `<span class="dwx__rain"> · 降雨概率 ${esc(w.rain)}</span>` : '') +
          `</div>`
      )
      .join('\n');
  }
  const dwx = dwxInner
    ? `        <div class="dwx">
          <div class="dwx__label">${ic('cloudy-day', 'ic ic--sky')}<span>${dwxLabel}</span></div>
${dwxInner}
        </div>`
    : '';

  const tl = `        <div class="tl">
${d.timeline
  .map(
    (s) =>
      `          <div class="tl__item${s.commute ? ' is-commute' : ''}">
            <div class="tl__time">${esc(s.t)}</div>
            <div class="tl__c">${
              s.commute ? '<span class="tl__badge">交通</span>' : ''
            }<span class="tl__main">${esc(s.c)}</span>${s.sub ? `<span class="tl__sub">${esc(s.sub)}</span>` : ''}${
        s.link
          ? `<div class="tl__src">${ic('link', 'ic ic--clay ic--sm')}<span class="tl__src-t">${esc(
              s.src
            )}</span><span class="tl__go">打开</span></div>`
          : ''
      }</div>
          </div>`
  )
  .join('\n')}
        </div>`;

  const tip =
    d.tips && d.tips.length
      ? `        <div class="tip">
          <div class="tip__title">${ic('tips', 'ic ic--pine')}<span>本日要点</span></div>
          <div class="tip__list">
${d.tips.map((t) => `            <div class="tip__li">${esc(t)}</div>`).join('\n')}
          </div>
        </div>`
      : '';

  return `      <div class="day">
        <div class="day__head">
          <div class="day__tag">${esc(d.tag)}</div>
          <span class="day__alt">${esc(d.alt)}</span>
        </div>
        <div class="day__title">${esc(d.title)}</div>
        <div class="day__route">${ic('map-route-planning', 'ic ic--clay')}<span>${esc(d.route)}</span></div>
        <div class="day__desc">${esc(d.desc)}</div>
        <div class="day__body">
${dwx}
${tl}
${tip}
        </div>
        <div class="day__foot">${ic('home', 'ic ic--pine')}<span class="day__stay">${esc(
    d.stay
  )}</span>${
    d.stayGeo
      ? `<div class="day__geo">${ic('location', 'ic ic--sky ic--sm')}<span>地图</span></div>`
      : ''
  }</div>
      </div>`;
};

/* 逐日区块顶部的「未来七天」条：真机由 api/weather.js 的 fetchWeekWeather 提供，
   恒 7 格（今天起 7 天），每格按那天行程所在的城查。这里给「行程第 1 天打开」的示意值：
   窗口 9.25-10.1 正好压上 DAY 1 到 DAY 7，每格就自然挂上了行程日徽标并换成当天城市。
   首格特意用真实上游那种 4 字文案「阵雨转晴」，正好检验天气与温度拆行后不再被截。
   rail 是 4 列 2 行网格（4 + 3），真机与预览同一套样式，预览这边不需要任何内联覆盖。 */
const WEEK_SAMPLE = [
  { label: 'DAY1 · 今天', md: '9.25', city: '成都', text: '阵雨转晴', temp: '17~25℃' },
  { label: 'DAY2', md: '9.26', city: '四姑娘山', text: '晴', temp: '6~17℃' },
  { label: 'DAY3', md: '9.27', city: '四姑娘山', text: '多云', temp: '5~15℃' },
  { label: 'DAY4', md: '9.28', city: '四姑娘山', text: '小雨', temp: '4~13℃' },
  { label: 'DAY5', md: '9.29', city: '九寨沟', text: '晴', temp: '7~18℃' },
  { label: 'DAY6', md: '9.30', city: '九寨沟', text: '多云', temp: '8~19℃' },
  { label: 'DAY7', md: '10.1', city: '成都', text: '阴', temp: '17~24℃' },
];

const weekHtml = `      <div class="wstrip">
        <div class="wstrip__head">${ic('cloudy-day', 'ic ic--sky')}<span class="wstrip__label">未来七天</span><span class="wstrip__hint">今天起 7 天</span></div>
        <div class="wstrip__rail">
${WEEK_SAMPLE.map(
  (w, i) =>
    `          <div class="wstrip__cell${i === 0 ? ' is-today' : ''}">` +
    `<span class="wstrip__badge is-trip">${esc(w.label)}</span>` +
    `<span class="wstrip__date">${esc(w.md)}</span>` +
    `<span class="wstrip__city">${esc(w.city)}</span>` +
    `<span class="wstrip__text">${esc(w.text)}</span>` +
    `<span class="wstrip__temp">${esc(w.temp)}</span></div>`
).join('\n')}
        </div>
      </div>`;

const daysHtml = `    <div class="sec" id="sec-day">
      <div class="fg-sec-title"><span class="n">02</span><span class="t">逐日安排</span><div class="bar"></div><span class="sec__meta">共 ${
        trip.days.length
      } 天</span></div>
      <div class="sec__desc">${esc(trip.daysDesc)}</div>

${weekHtml}

${trip.days.map(dayHtml).join('\n\n')}
    </div>`;

/* 03 景区内部游玩路线 */
const routesHtml = `    <div class="sec" id="sec-routes">
      <div class="fg-sec-title"><span class="n">03</span><span class="t">景区内部游玩路线</span><div class="bar"></div><span class="sec__meta">${
        trip.routes.length
      } 条</span></div>
      <div class="sec__desc">${esc(trip.routesDesc)}</div>
${trip.routes
  .map(
    (r) => `      <div class="route">
        <div class="route__head"><span class="route__name">${esc(r.name)}</span><span class="route__price">${esc(
      r.price
    )}</span></div>
        <div class="route__title">${esc(r.title)}</div>
        <div class="route__sub">${esc(r.sub)}</div>
        <div class="route__flow">
${r.stops
  .map(
    (s, i) =>
      `          <div class="stop${s.hot ? ' is-hot' : ''}">${esc(s.label)}</div>` +
      (i === r.stops.length - 1 ? '' : '<span class="route__arrow">→</span>')
  )
  .join('\n')}
        </div>
        <div class="route__legend">${esc(r.legend)}</div>
      </div>`
  )
  .join('\n')}
    </div>`;

/* 04 预约与购票清单（倒计时按今天实时算） */
const booking = trip.booking;
const today = new Date();
today.setHours(12, 0, 0, 0);
const countdown = booking.countdown
  .map((it) => {
    const openDate = parseDate(it.open);
    const diff = Math.round((openDate - today) / 86400000);
    let countText;
    let state;
    if (diff > 0) {
      countText = `还有 ${diff} 天`;
      state = diff <= 3 ? 'soon' : 'idle';
    } else {
      countText = '已可约';
      state = 'now';
    }
    return {
      ...it,
      state,
      countText,
      openText: monthDay(openDate),
      leadText: it.ot && it.ot !== '随时' ? `${it.lead} · ${it.ot}` : it.lead,
    };
  })
  .sort((a, b) => (a.use < b.use ? -1 : a.use > b.use ? 1 : 0));

const bookingHtml = `    <div class="sec" id="sec-booking">
      <div class="fg-sec-title"><span class="n">04</span><span class="t">预约与购票清单</span><div class="bar"></div><span class="sec__meta">${countdown.length} 项待约</span></div>
      <div class="sec__desc">${esc(booking.desc)}</div>

      <div class="cd">
        <div class="cd__note"><span class="cd__note-t">${esc(booking.countdownTitle)}</span>${esc(
  booking.countdownNote
)}</div>
        <div class="cd__legend">
${booking.legend
  .map((l) => `          <div class="cd__lg"><div class="cd__lg-dot is-${l.state}"></div><span>${esc(l.text)}</span></div>`)
  .join('\n')}
        </div>
${countdown
  .map(
    (it) => `        <div class="cd__row">
          <div class="cd__main">
            <div class="cd__head"><span class="cd__name">${esc(it.item)}</span><span class="cd__count is-${
      it.state
    }">${esc(it.countText)}</span></div>
            <div class="cd__sub">${esc(it.sub)}</div>
            <div class="cd__meta"><span>最早可约 ${esc(it.openText)} · ${esc(
      it.leadText
    )}</span><span class="cd__ch">${esc(it.channel)}</span></div>
          </div>
        </div>`
  )
  .join('\n')}
      </div>
    </div>`;

/* 05 物品准备：真机数据在云端 packing 集合 / 本机 storage，首次打开是空的。
   空态下看不到分组版式，所以这里按 mock 的预置清单渲染「刚预置进库」的样子：
   四类分组各列若干条，一件都还没勾（预设项 who 就是「预设」）。
   片段按「展开态」渲染；真机上分组是恒展开的，不存在折叠。 */
const packing = trip.packing;
const previewPackGroups = (packing.groups || [])
  .map((name) => ({
    name,
    items: (packing.preset || []).filter((it) => it.group === name).map((it) => it.name),
  }))
  .filter((g) => g.items.length);
const previewPackTotal = previewPackGroups.reduce((n, g) => n + g.items.length, 0);
// 表单上方的分类胶囊：真机默认选中最后一类（不认识的分类都往那儿兜），预览照这个来
const PREVIEW_PACK_CAT = (packing.groups || [])[packing.groups.length - 1];

const packingHtml = `    <div class="sec" id="sec-packing">
      <div class="fg-sec-title"><span class="n">05</span><span class="t">物品准备</span><div class="bar"></div><span class="sec__meta">0 / ${previewPackTotal}</span></div>
      <div class="sec__desc">${esc(packing.desc)}</div>

      <div class="gear">
        <div class="gear__head">
          <span class="gear__title">打包清单</span>
          <div class="sync is-local"><div class="sync__dot"></div><span>仅本机 · 未配置云同步</span></div>
        </div>
        <div class="gear__stat">合计 <span class="hl">${previewPackTotal}</span> 件 · 已带上 <span class="hl">0</span> 件</div>
        <div class="bar2"><div class="bar2__fill" style="width:0%"></div></div>

        <div class="gear__cats">
${(packing.groups || [])
  .map(
    (g) => `          <div class="gear__cat${g === PREVIEW_PACK_CAT ? ' is-on' : ''}">${esc(g)}</div>`
  )
  .join('\n')}
        </div>

        <div class="gear__form">
          <div class="gear__input"><span class="ph">输入要带的物品，如：防晒霜、便携氧气瓶…</span></div>
          <div class="gear__add is-off">添加</div>
        </div>

        <div class="gear__list">
${previewPackGroups
  .map(
    (g) => `          <div class="pgroup">
            <div class="pgroup__head">
              <span class="pgroup__name">${esc(g.name)}</span>
              <span class="pgroup__meta">0 / ${g.items.length}</span>
            </div>
${g.items
  .map(
    (n) => `            <div class="gitem">
              <div class="gitem__check"></div>
              <span class="gitem__name">${esc(n)}</span>
              <span class="gitem__who">预设</span>
              <div class="gitem__del">${ic('close', 'ic ic--faint')}</div>
            </div>`
  )
  .join('\n')}
          </div>`
  )
  .join('\n')}
        </div>

        <div class="gear__tip">${esc(packing.tip)}</div>
      </div>
    </div>`;

/* 07 花费统计：分类总价始终列出全部 7 类，未记账显示 ¥0 并置灰 */
const costsConf = trip.costs;
const catNames = costsConf.categories;

/* 真机上记账数据在云端 costs 集合 / 本机 storage，首次打开是空的。
   但折叠头条只有「有记录」时才渲染，空态下预览里根本看不到这个控件，
   所以这里画一组示意记录（就按实际要录的那 11 笔），把折叠头条与明细版式展示出来。
   片段按「展开态」渲染；真机默认是收起的。 */
const PREVIEW_COSTS = [
  { amount: 1480, note: '厦门-成都', category: '机票' },
  { amount: 1380, note: '成都-厦门', category: '机票' },
  { amount: 567, note: '29号-1号 九寨沟民宿', category: '住宿' },
  { amount: 547, note: '1号-3号酒店', category: '住宿' },
  { amount: 516, note: '26号-28号 四姑娘山民宿', category: '住宿' },
  { amount: 195, note: '25号晚酒店', category: '住宿' },
  { amount: 174, note: '28号晚酒店', category: '住宿' },
  { amount: 400, note: '四姑娘山门票', category: '门票' },
  { amount: 170, note: '熊猫基地', category: '门票' },
  { amount: 248, note: '成都-四姑娘山大巴', category: '当地交通' },
  { amount: 262, note: 'pocket租赁', category: '其他' },
];

// 口径与小程序的 loadCosts 完全一致：分类恒列 7 类、按金额降序、金额为 0 的置灰
const previewCostTotal = PREVIEW_COSTS.reduce((n, it) => n + it.amount, 0);
const previewCostSum = {};
catNames.forEach((c) => {
  previewCostSum[c] = 0;
});
PREVIEW_COSTS.forEach((it) => {
  previewCostSum[it.category] = (previewCostSum[it.category] || 0) + it.amount;
});
const previewCostMax = catNames.reduce((m, c) => (previewCostSum[c] > m ? previewCostSum[c] : m), 0);
const previewCostCats = catNames.slice().sort((a, b) => previewCostSum[b] - previewCostSum[a]);
const previewCatPercent = (c) =>
  previewCostSum[c] === 0 ? 0 : Math.max(3, Math.round((previewCostSum[c] / previewCostMax) * 100));
// 筛选条只列「有记录」的分类；日期统一写 9/13 —— 导入的 11 笔 createdAt 都落在这一天，
// 这也是真机的真实状态（以后在小程序里新记的才会显示各自的日期）
const previewCostFilters = previewCostCats.filter((c) => previewCostSum[c] > 0);
const PREVIEW_COST_DATE = '9/13';
const costsHtml = `    <div class="sec" id="sec-costs">
      <div class="fg-sec-title"><span class="n">06</span><span class="t">花费统计</span><div class="bar"></div><span class="sec__meta">${PREVIEW_COSTS.length} 笔</span></div>
      <div class="sec__desc">${esc(costsConf.desc)}</div>

      <div class="gear">
        <div class="gear__head">
          <span class="gear__title">记一笔</span>
          <div class="sync is-local"><div class="sync__dot"></div><span>仅本机 · 未配置云同步</span></div>
        </div>

        <div class="gear__note">${esc(costsConf.note)}</div>

        <div class="tt">
          <span class="tt__label">已记录总花费</span>
          <span class="tt__num">¥${fmtNum(previewCostTotal)}</span>
          <span class="tt__meta">共 ${PREVIEW_COSTS.length} 笔 · 按 ${costsConf.shareCount} 人分摊约 ¥${fmtNum(previewCostTotal / costsConf.shareCount)} / 人</span>
        </div>

        <div class="ccats">
          <div class="ccats__head"><span class="ccats__title">${esc(
            costsConf.catsTitle
          )}</span><span class="ccats__hint">${esc(costsConf.catsHint)}</span></div>
${previewCostCats
  .map(
    (c) => `          <div class="ccat${previewCostSum[c] === 0 ? ' is-zero' : ''}">
            <span class="ccat__name">${esc(c)}</span>
            <div class="ccat__bar"><div class="ccat__fill" style="width:${previewCatPercent(c)}%"></div></div>
            <span class="ccat__num">¥${fmtNum(previewCostSum[c])}</span>
          </div>`
  )
  .join('\n')}
        </div>

        <div class="cform">
          <div class="cform__amount"><span class="ph">金额</span></div>
          <div class="cform__note"><span class="ph">用途，如：九寨沟门票、打车</span></div>
          <div class="cform__cat"><div class="cform__catbox"><span>${esc(costsConf.defaultCategory)}</span>${ic(
  'chevron-down',
  'ic ic--faint'
)}</div></div>
          <div class="cform__add">记一笔</div>
        </div>

        <div class="clist">
          <div class="clist__btn"><span class="clist__btn-t">收起明细</span>${ic('chevron-up', 'ic ic--faint')}</div>
          <div class="clist__body">
            <div class="cfilt">
              <div class="cfilt__chip is-on">全部</div>
${previewCostFilters.map((c) => `              <div class="cfilt__chip">${esc(c)}</div>`).join('\n')}
            </div>
${PREVIEW_COSTS.map(
  (it) => `            <div class="citem">
              <span class="citem__amt">¥${fmtNum(it.amount)}</span>
              <span class="citem__note">${esc(it.note)}</span>
              <span class="citem__date">${PREVIEW_COST_DATE}</span>
              <span class="citem__tag">${esc(it.category)}</span>
              <div class="citem__del">${ic('close', 'ic ic--faint')}</div>
            </div>`
).join('\n')}
          </div>
        </div>

        <div class="gear__tip">${esc(costsConf.tip)}</div>
      </div>
    </div>`;

/* 07 交通记录：表单同「首次打开」的空态；列表与逐日时间线用 PREVIEW_TRAFFIC 做版式示意 */
const trafficConf = trip.traffic;
const trafficHtml = `    <div class="sec" id="sec-traffic">
      <div class="fg-sec-title"><span class="n">07</span><span class="t">交通记录</span><div class="bar"></div><span class="sec__meta">${
        previewTraffic.length
      } 条</span></div>
      <div class="sec__desc">${esc(trafficConf.desc)}</div>

      <div class="gear">
        <div class="gear__head">
          <span class="gear__title">记一笔交通</span>
          <div class="sync is-local"><div class="sync__dot"></div><span>仅本机 · 未配置云同步</span></div>
        </div>

        <div class="tform">
          <div class="tform__row">
            <div class="tform__pick"><div class="tform__box is-empty">${ic(
              'calendar',
              'ic ic--clay ic--sm'
            )}<span>选日期</span></div></div>
            <div class="tform__pick"><div class="tform__box is-empty">${ic(
              'time',
              'ic ic--clay ic--sm'
            )}<span>选时间</span></div></div>
          </div>

          <div class="tform__modes">
${trafficConf.modes
  .map(
    (mm) => `            <div class="tchip${mm === trafficConf.defaultMode ? ' is-on' : ''}">${esc(mm)}</div>`
  )
  .join('\n')}
          </div>

          <div class="tform__row">
            <div class="tform__in"><span class="ph">出发地</span></div>
            <span class="tform__arrow">→</span>
            <div class="tform__in"><span class="ph">到达地</span></div>
          </div>

          <div class="tform__row">
            <div class="tform__in"><span class="ph">来源：12306、携程，或粘小程序链接（可不填）</span></div>
          </div>

          <div class="tform__row">
            <div class="tform__in"><span class="ph">班次号，如 C6368、CA4532（可不填）</span></div>
            <div class="tform__add">加入行程</div>
          </div>
        </div>

        <div class="tlist">
${previewTraffic
  .map(
    (r) => `          <div class="titem">
            <div class="titem__when"><span class="titem__date">${esc(r.dateText)}</span><span class="titem__time">${esc(
      r.time
    )}</span></div>
            <div class="titem__body"><span class="titem__c">${esc(r.c)}</span>${
      r.sub ? `<span class="titem__sub">${esc(r.sub)}</span>` : ''
    }${
      r.src
        ? `<div class="titem__src${r.link ? ' is-go' : ''}">${ic(
            r.link ? 'link' : 'location',
            r.link ? 'ic ic--clay ic--sm' : 'ic ic--faint ic--sm'
          )}<span class="titem__src-t">${esc(r.src)}</span>${
            r.link ? '<span class="titem__go">打开</span>' : ''
          }</div>`
        : ''
    }</div>
            <span class="titem__day">${esc(r.dayTag)}</span>
            <div class="titem__del">${ic('close', 'ic ic--faint ic--sm')}</div>
          </div>`
  )
  .join('\n')}
        </div>

        <div class="gear__tip">${esc(trafficConf.tip)}</div>
      </div>
    </div>`;

/* 页脚：票价来源与免责 */
const footHtml = `    <div class="foot">
${trip.footer.map((p) => `      <span class="foot__p">${esc(p)}</span>`).join('\n')}
    </div>`;

const fragment = `<!-- 川西首页 · 由 preview/_gen-1home.js 从 mock/trips/chuanxi.js 生成，勿手改 -->
<div class="home">
  <div class="nav">
    <div class="nav__bar" style="height:44px;display:flex;align-items:center;padding:0 10px">
    </div>
  </div>

${tocHtml}

  <div class="home__body">
${heroHtml}

${liveHtml}

${overviewHtml}

${daysHtml}

${routesHtml}

${bookingHtml}

${packingHtml}

${costsHtml}

${trafficHtml}

${footHtml}

    <div class="home__bottom"></div>
  </div>

  <t-message></t-message>
</div>
`;

fs.writeFileSync(OUT, fragment, 'utf8');

const dayCount = trip.days.length;
const tlCount = trip.days.reduce((n, d) => n + d.timeline.length, 0);
const tipCount = trip.days.reduce((n, d) => n + (d.tips ? d.tips.length : 0), 0);
const stopCount = trip.routes.reduce((n, r) => n + r.stops.length, 0);
console.log(
  `WROTE ${path.relative(ROOT, OUT)}  ${Buffer.byteLength(fragment)} bytes  ` +
    `(${dayCount} 天 / ${tlCount} 条时间线（含 ${previewTraffic.length} 条示意交通）/ ` +
    `${tipCount} 条要点 / ${trip.routes.length} 条景区路线 ${stopCount} 个节点 / ` +
    `${countdown.length} 行倒计时 / ${catNames.length} 个记账分类 / ` +
    `${previewPackTotal} 件物品 ${previewPackGroups.length} 组 / ` +
    `${trip.sections.length} 个区块 / ${previewTraffic.length} 条交通记录 / ${trip.footer.length} 行页脚)`
);
