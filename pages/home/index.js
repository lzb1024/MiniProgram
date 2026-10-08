import Message from 'tdesign-miniprogram/message/index';
import request from '~/api/request';
import { fetchWeather, fetchWeekWeather } from '~/api/weather';
import {
  fetchPacking,
  setPackingGroups,
  addPacking as apiAddPacking,
  togglePacking as apiTogglePacking,
  removePacking as apiRemovePacking,
  fetchCosts,
  addCost as apiAddCost,
  removeCost as apiRemoveCost,
  setCostCategories,
  fetchTraffic,
  addTraffic as apiAddTraffic,
  removeTraffic as apiRemoveTraffic,
} from '~/api/trip';

/** 金额显示：去掉多余的小数位（3880.00 → 3880，12.50 → 12.5） */
function fmtNum(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

/** '2026-09-26' → Date（固定中午，避开时区 / 夏令时的边界抖动） */
function parseDate(str) {
  const parts = String(str || '').split('-').map(Number);
  if (parts.length !== 3 || !parts[0]) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

function monthDay(date) {
  return date ? `${date.getMonth() + 1}月${date.getDate()}日` : '';
}

/**
 * 记账时间 → 「9/13」。三种来源都要吃得下：
 * 云端写入用 serverDate（读回来是 Date 对象）、本机兜底写 Date.now()（时间戳数字）、
 * 控制台导入的是 ISODate 字符串。
 */
function fmtCostDate(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(typeof v === 'number' ? v : String(v));
  return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
}

const FALLBACK_CATS = ['机票', '高铁', '当地交通', '门票', '住宿', '餐饮', '其他'];
const FALLBACK_MODES = ['飞机', '动车', '大巴', '打车', '地铁', '其他'];

/**
 * 综合版小程序里详情页服务多趟行程，这里放「哪些行程是真实存在的」。
 * 与 mock/trips/ 下的文件一一对应，key 就是 URL 里的 trip 参数。
 * 加新行程时这里加一项、mock/trips/ 下加一个同名文件，两处都要动。
 */
const TRIPS = {
  chuanxi: { name: '川西攻略' },
  changsha: { name: '长沙攻略' },
};

/** trip 参数兜底：老分享链接（没有 ?trip=）仍然进川西，不会白屏 */
const DEFAULT_TRIP = 'chuanxi';

/* ==================== 交通记录 → 逐日时间线 ==================== */

/**
 * 从「13:10」「约 20:30」这类文案里抠出分钟数，用来排序。
 * 「落地后」「晚上」「约 20:30」→ 前两个返回 null，第三个返回 1230。
 * 时间线里有一半条目本来就没有确切时刻（作者写的节奏描述），
 * 所以解析不出来是正常情况，不能当成错误。
 */
function timeToMin(t) {
  const m = String(t == null ? '' : t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

/**
 * 一条交通记录的主文案。
 * 有起止就写「A → B」，只有班次号就退化成「方式 + 班次号」，
 * 副行放「方式 · 班次号」，起止已表达清楚时才不重复。
 * 来源（src）不放这里 —— 07 列表里它是独立一行（还带跳转），
 * 逐日时间线里才拼进副行，见 mergeTraffic。
 */
function trafficText(it) {
  const from = String(it.from || '').trim();
  const to = String(it.to || '').trim();
  const no = String(it.no || '').trim();
  const mode = it.mode || '交通';
  const tail = [mode, no].filter(Boolean).join(' · ');

  if (from && to) return { c: `${from} → ${to}`, sub: tail };
  if (from) return { c: `从 ${from} 出发`, sub: tail };
  if (to) return { c: `前往 ${to}`, sub: tail };
  return { c: no ? `${mode} ${no}` : mode, sub: '' };
}

/**
 * 把用户记的交通按时间插进当天时间线。
 *
 * 只「插入」不「重排」：原时间线是攻略作者按节奏排的，「落地后」「晚上」这类没有时刻的
 * 条目必须留在原地，一旦整体排序它们就会被甩到末尾。所以规则是
 * 「插在最后一条时刻不晚于它的条目之后」，比所有有条目都早则插到最前面。
 *
 * 来源名拼进副行（时间线上不单独占一行，那里没有跳转按钮）；
 * 有来源时副行形如「打车 · 滴滴出行」。
 *
 * `mine: true` 是「这条是使用者自己加的」标记。眉标后来统一成实心「交通」了，
 * 这个字段暂时没人读，留着是为了以后要区分时有据可依，别当成死代码删掉。
 */
function mergeTraffic(base, records) {
  const list = (base || []).slice();

  records
    .slice()
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
    .forEach((r) => {
      const target = timeToMin(r.time);
      let at = 0;
      for (let i = 0; i < list.length; i++) {
        const m = timeToMin(list[i].t);
        if (target !== null && m !== null && m <= target) at = i + 1;
      }
      list.splice(at, 0, {
        k: `u-${r.id}`,
        t: r.time,
        c: r.c,
        // 有小程序链接时，来源走时间线里独立的「打开」胶囊（tl__src），副行不再重复来源名；
        // 只写了名称的没有跳转入口，来源名留在副行里当文字
        sub: r.link ? r.sub : [r.sub, r.src].filter(Boolean).join(' · '),
        commute: true,
        mine: true,
        src: r.src || '',
        link: r.link || '',
      });
    });

  return list;
}

/** '2026-09-26' → '9月26日'（07 列表左侧的日期） */
function monthDayText(str) {
  const p = String(str || '').split('-');
  if (p.length !== 3) return '';
  return `${Number(p[1])}月${Number(p[2])}日`;
}

/**
 * 表单里的默认日期：今天落在行程区间内就填今天（行程中打开就能直接记），
 * 否则留空，避免手一滑把记录记到别的日子。
 */
function todayInRange(min, max) {
  if (!min || !max) return '';
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  return today >= min && today <= max ? today : '';
}

Page({
  data: {
    // 当前行程的 id（川西 / 长沙…）。三链读写与导航标题都靠它，
    // 进页面时从 URL 的 ?trip= 取，取不到或不认识都回落到默认行程
    tripId: DEFAULT_TRIP,
    trip: null,
    days: [],
    routes: [],
    sections: [],
    dayTabs: [],
    countdown: [],
    loading: true,

    // 实时天气（云函数中转腾讯位置服务）。null = 不渲染，页面与没这功能时完全一致
    liveWeather: null,

    // 未来七天条：恒 7 格（今天起 7 天），空数组 = 不渲染
    weekWeather: [],

    // 吸顶条顶部留白（px）：不是状态栏高度，要越过右上角胶囊按钮，见 tocTopInset()
    statusTop: 0,
    activeSec: 'sec-overview',
    tocInto: '',
    activeDay: '',
    dayInto: '',

    // 05 物品准备
    packing: [],
    packingGroups: [],
    packingCats: [],
    packingGroup: '',
    packingDone: 0,
    packingPercent: 0,
    packingInput: '',
    syncOnline: false,
    syncText: '读取中…',

    // 07 花费统计
    costs: [],
    costsShown: [],
    costOpen: false,
    costFilter: '全部',
    costFilters: [],
    costCats: [],
    costCount: 0,
    costTotal: '0',
    costAvg: '0',
    shareCount: 2,
    costCategories: [],
    costCatIndex: 0,
    costForm: { amount: '', note: '', category: '门票' },
    costOnline: false,
    costText: '读取中…',

    // 07 交通记录（同行人共享，手动记时间后并入逐日时间线）
    traffic: [],
    trafficCount: 0,
    trafficModes: [],
    trafficModeIndex: 0,
    // date / time 必填；from / to / no 至少填一项（与 api/trip.js 的校验一致）
    trafficForm: { date: '', time: '', mode: '', from: '', to: '', no: '', src: '' },
    trafficMin: '',
    trafficMax: '',
    trafficOnline: false,
    trafficText: '读取中…',
  },

  /**
   * 吸顶条顶部留白（px）。
   * 不能只留状态栏高度：小程序右上角的胶囊按钮（「···」/「⊙」关闭）浮在状态栏下方的
   * 同一条竖直带里，只留状态栏时吸顶后第一行章节（花费统计 / 交通记录）正好落进胶囊
   * 的范围，被整个盖住。这里取胶囊下沿 + 与状态栏等宽的呼吸位，保证首行完全在胶囊之下。
   * 兜底：拿不到胶囊信息时按「状态栏 + 44」算（胶囊的标准高度）。
   */
  tocTopInset(statusBarHeight) {
    try {
      const rect =
        typeof wx.getMenuButtonBoundingClientRect === 'function' ? wx.getMenuButtonBoundingClientRect() : null;
      if (rect && rect.bottom) {
        return rect.bottom + Math.max(rect.top - statusBarHeight, 4);
      }
    } catch (e) {
      // 低版本基础库没有这个接口，走下面的兜底
    }
    return statusBarHeight + 44;
  },

  onLoad(option) {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusTop = this.tocTopInset((win && win.statusBarHeight) || 0);
    this._tocTop = statusTop;
    this.setData({ statusTop });

    // 综合版：URL 带 ?trip=xx 决定打开哪趟行程。参数不存在（老分享链接）或不认识
    // 都回落到默认行程，绝不因为一个参数拼错就白屏。
    const raw = String((option && option.trip) || '').trim();
    const tripId = TRIPS[raw] ? raw : DEFAULT_TRIP;
    if (raw && !TRIPS[raw]) {
      console.warn(`[trip] 不认识的行程参数 "${raw}"，已回落到 ${DEFAULT_TRIP}`);
    }
    // 存实例上：下面三链的好几个方法不进 setData 回调，光靠 this.data 也能取到，
    // 但集中放一处更好读
    this._tripId = tripId;
    this.setData({ tripId });

    // 标题跟着行程走（本页是 custom 导航，这里只设后台任务与分享卡的标题）
    wx.setNavigationBarTitle({ title: TRIPS[tripId].name });

    if (option && option.oper) {
      let content = '';
      if (option.oper === 'release') {
        content = '攻略已发布';
      } else if (option.oper === 'save') {
        content = '已存草稿';
      }
      this.showOperMsg(content);
    }
  },

  async onReady() {
    await this.loadData();
  },

  /* ============================ 数据加载 ============================ */

  async loadData() {
    // 端点按行程分路径而不是 query：mock 用完整 URL 字符串做 key，带 ?trip=xx 匹配不上
    const tripRes = await request(`/home/trip/${this.data.tripId}`).then((res) => res.data);
    const trip = tripRes.data;

    const days = (trip.days || []).map((item, index) => ({
      ...item,
      index,
      // 恒全展开（2026-09-13 按用户要求删掉了「点卡片收起/展开」：
      // 一点空白处整卡就折了，反而碍事）。day__body 不再有 wx:if。
      // 兜底成数组，避免 wxml 里 .length 取到 undefined
      alt: item.alt || '',
      cardTitle: item.cardTitle || item.title || '',
      brief: item.brief || '',
      weather: item.weather || [],
      // 时间线补 k 供 wx:key：用户记的交通可能落在攻略里同一个时刻，用 t 当 key 会重复
      timeline: (item.timeline || []).map((step, si) => ({ ...step, k: `p-${si}` })),
      tips: item.tips || [],
      // 住宿点坐标：有值才渲染「地图」入口，DAY 9 已返程故为 null
      stayGeo: item.stayGeo || null,
      // 真实逐日预报，由 loadWeekWeather 异步补上；null = 还没拿到 / 不在 7 天窗口内
      live: null,
    }));

    const routes = (trip.routes || []).map((r) => {
      const stops = r.stops || [];
      return {
        ...r,
        // last 交给数据算，wxml 里就不用写 `si < length - 1` 这种带尖括号的比较
        stops: stops.map((s, i) => ({ ...s, last: i === stops.length - 1 })),
      };
    });

    // 留一份「原始时间线」底稿：用户记的交通每次都从这份重算并入，
    // 反复下拉刷新也不会越插越多
    this._baseTimeline = days.map((d) => d.timeline);

    const costCategories = (trip.costs && trip.costs.categories) || FALLBACK_CATS;
    setCostCategories(costCategories);

    // 07 交通记录：方式选项与日期范围（就是行程首尾两天）都从 mock 来，
    // mock 缺字段时用内置兜底，页面不至于空掉
    const trafficConf = trip.traffic || {};
    const trafficModes =
      trafficConf.modes && trafficConf.modes.length ? trafficConf.modes : FALLBACK_MODES;
    const firstDate = (days[0] && days[0].date) || '';
    const lastDate = (days[days.length - 1] && days[days.length - 1].date) || '';
    const defaultMode = trafficConf.defaultMode || trafficModes[0] || '其他';

    this.setData(
      {
        trip,
        days,
        routes,
        sections: trip.sections || [],
        dayTabs: trip.dayTabs || [],
        countdown: this.buildCountdown(trip),
        loading: false,
        costCategories,
        costCatIndex: Math.max(
          costCategories.indexOf((trip.costs && trip.costs.defaultCategory) || '门票'),
          0
        ),
        costForm: {
          amount: '',
          note: '',
          category: (trip.costs && trip.costs.defaultCategory) || costCategories[0] || '其他',
        },
        trafficModes,
        trafficModeIndex: Math.max(trafficModes.indexOf(defaultMode), 0),
        trafficMin: firstDate,
        trafficMax: lastDate,
        trafficForm: {
          date: todayInRange(firstDate, lastDate),
          time: '',
          mode: defaultMode,
          from: '',
          to: '',
          no: '',
          src: '',
        },
      },
      () => this.measureSections()
    );

    // 五个数据源互不依赖，并行拉，任何一个挂了都不影响本地默认行程
    this.loadWeather();
    this.loadWeekWeather();
    this.loadPacking();
    this.loadCosts();
    this.loadTraffic();
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh());
  },

  /* ====================== 05 预约倒计时（实时算） ====================== */

  buildCountdown(trip) {
    const booking = trip && trip.booking;
    if (!booking || !booking.countdown) return [];

    const today = new Date();
    today.setHours(12, 0, 0, 0);

    return booking.countdown
      .map((it) => {
        const openDate = parseDate(it.open);
        const useDate = parseDate(it.use);
        const diff = openDate ? Math.round((openDate - today) / 86400000) : 0;

        let countText = '';
        let state = 'idle';
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
          useText: monthDay(useDate),
          openText: monthDay(openDate),
          leadText: it.ot && it.ot !== '随时' ? `${it.lead} · ${it.ot}` : it.lead,
        };
      })
      .sort((a, b) => (a.use < b.use ? -1 : a.use > b.use ? 1 : 0));
  },

  /* ========================= 锚点跳转 / 高亮 ========================= */

  /** 顶部章节导航：滚到对应区块 */
  onTocTap(e) {
    const { id } = e.currentTarget.dataset;
    this.scrollToId(id, id);
  },

  /** 第二行 DAY 选项卡：滚到当天详情，同时把章节高亮切到「逐日安排」 */
  onDayTabTap(e) {
    const { id } = e.currentTarget.dataset;
    this.scrollToId(id, 'sec-day');
  },

  /** 行程总览的日卡：滚到当天详细 */
  goDay(e) {
    const { index } = e.currentTarget.dataset;
    this.scrollToId(`day-${index}`, 'sec-day');
  },

  /**
   * 滚到指定 id 的元素。
   * 不用 wx.pageScrollTo({ selector }) 的裸写法，因为吸顶导航会盖住目标顶部，
   * 这里自己查一次元素位置，把导航高度减掉。
   * @param {string} id   目标元素 id
   * @param {string} sync 需要同时点亮章节导航时，传对应区块 id
   */
  scrollToId(id, sync) {
    const q = wx.createSelectorQuery();
    q.select(`#${id}`).boundingClientRect();
    q.select('.toc').boundingClientRect();
    q.selectViewport().scrollOffset();
    q.exec((res) => {
      const rect = res[0];
      // 目标区块可能压根没渲染，这时什么都不做
      if (!rect) {
        this.measureSections();
        return;
      }

      const toc = res[1];
      const viewport = res[2];
      const scrollTop = (viewport && viewport.scrollTop) || 0;
      const offset = toc ? toc.height : 0;

      const patch = {};
      if (sync) {
        patch.activeSec = sync;
        patch.tocInto = `toc-${sync}`;
      }
      // 目标是某一天时，同步点亮第二行 DAY 选项卡
      if (/^day-\d+$/.test(id)) {
        patch.activeDay = id;
        patch.dayInto = `toc-${id}`;
      }
      if (Object.keys(patch).length) this.setData(patch);

      wx.pageScrollTo({ scrollTop: Math.max(rect.top + scrollTop - offset, 0), duration: 300 });
    });
  },

  /** 记下每个区块 / 每天的文档绝对位置，供滚动时高亮当前章节与当天 */
  measureSections() {
    const q = wx.createSelectorQuery();
    q.selectAll('.sec').boundingClientRect();
    q.selectAll('.day').boundingClientRect();
    q.selectViewport().scrollOffset();
    q.exec((res) => {
      const secRects = res[0] || [];
      const dayRects = res[1] || [];
      const viewport = res[2];
      const scrollTop = (viewport && viewport.scrollTop) || 0;
      const toTops = (rects) =>
        rects
          .filter((r) => r.id)
          .map((r) => ({ id: r.id, top: r.top + scrollTop }))
          .sort((a, b) => a.top - b.top);

      this._secTops = toTops(secRects);
      this._dayTops = toTops(dayRects);
    });
  },

  onPageScroll(e) {
    const secs = this._secTops;
    const days = this._dayTops;
    if ((!secs || !secs.length) && (!days || !days.length)) return;

    const scrollTop = e.scrollTop;
    // 节流：滚过 24px 才算一次，避免每帧 setData
    if (Math.abs(scrollTop - (this._lastTop || 0)) < 24) return;
    this._lastTop = scrollTop;

    // 判定线放在吸顶条正下方：吸顶条高 = 顶部留白（越过胶囊）+ 两行内容（章节行 + DAY 行，约 96px）
    const line = scrollTop + (this._tocTop || 0) + 96;
    const patch = {};

    if (secs && secs.length) {
      let cur = secs[0].id;
      for (let i = 0; i < secs.length; i++) {
        if (secs[i].top <= line) cur = secs[i].id;
        else break;
      }
      if (cur !== this.data.activeSec) {
        patch.activeSec = cur;
        patch.tocInto = `toc-${cur}`;
      }
    }

    if (days && days.length) {
      let curDay = days[0].id;
      for (let i = 0; i < days.length; i++) {
        if (days[i].top <= line) curDay = days[i].id;
        else break;
      }
      if (curDay !== this.data.activeDay) {
        patch.activeDay = curDay;
        patch.dayInto = `toc-${curDay}`;
      }
    }

    if (Object.keys(patch).length) this.setData(patch);
  },

  /**
   * 点住宿栏「整条」唤起微信内置地图（总览日卡与逐日卡脚部两处都绑在整行上，
   * 点酒店名 / 小图标 / 行内空白都算）。坐标是腾讯 GCJ-02，可直接用。
   * DAY 9 已返程、没有住宿，取不到坐标直接返回。
   */
  onOpenStay(e) {
    const di = Number(e.currentTarget.dataset.di);
    const day = this.data.days[di];
    const geo = day && day.stayGeo;
    if (!geo) return;

    wx.openLocation({
      latitude: geo.latitude,
      longitude: geo.longitude,
      name: geo.name,
      address: geo.address,
      scale: 16,
      fail: () => this.toast('打开地图失败，请稍后再试'),
    });
  },

  /* =============== 实时天气（云函数中转，拿不到就整条不渲染） =============== */

  async loadWeather() {
    if (!this.data.days.length) return;
    const live = await fetchWeather(this.data.days);
    if (!live) return;
    // 天气条插在 Hero 之后，会让下面所有锚点整体下移，所以补量一次
    this.setData({ liveWeather: live }, () => this.measureSections());
  },

  /**
   * 未来七天条 + 逐日预报：接口一次最多 7 天。
   * 七天条恒 7 格（今天起 7 天，每格按那天行程所在城市查），
   * 逐日卡只取其中落在行程内的那几天，替换掉攻略里的参考文案。
   * 七天条插进逐日区块会让后面所有锚点下移，所以一并重测。
   * 只回写 days[i].live 这一个路径：整份 days 回写会和在跑的「交通记录并入时间线」互相覆盖。
   */
  async loadWeekWeather() {
    if (!this.data.days.length) return;
    const bundle = await fetchWeekWeather(this.data.days);
    if (!bundle) return;

    const patch = { weekWeather: bundle.week };
    this.data.days.forEach((d, i) => {
      patch[`days[${i}].live`] = bundle.daily[d.date] || null;
    });
    this.setData(patch, () => this.measureSections());
  },

  /* ======================= 05 物品准备共享清单 ======================= */

  async loadPacking() {
    const conf = (this.data.trip && this.data.trip.packing) || {};
    // 分类白名单注册在 api 层，新增物品时用它兜底（不认识的分类一律归最后一类）
    setPackingGroups(conf.groups);
    const { list, online } = await fetchPacking(this.data.tripId, conf.preset || []);

    const cats = conf.groups && conf.groups.length ? conf.groups : ['其他'];
    const fallback = cats.indexOf('其他') >= 0 ? '其他' : cats[cats.length - 1];

    const packing = list.map((it) => ({
      id: it._id || it.id,
      name: it.name || '',
      done: !!it.done,
      who: it.who || '同行人',
      group: cats.indexOf(it.group) >= 0 ? it.group : fallback,
    }));
    const done = packing.filter((it) => it.done).length;

    // 按白名单顺序分组，空组不渲染；组内顺序沿用拉取顺序（createdAt 升序）
    const packingGroups = cats
      .map((name) => {
        const items = packing.filter((it) => it.group === name);
        return { name, items, done: items.filter((it) => it.done).length, total: items.length };
      })
      .filter((g) => g.total);

    const cur =
      this.data.packingGroup && cats.indexOf(this.data.packingGroup) >= 0
        ? this.data.packingGroup
        : fallback;

    this.setData({
      packing,
      packingGroups,
      packingCats: cats,
      packingGroup: cur,
      packingDone: done,
      packingPercent: packing.length ? Math.round((done / packing.length) * 100) : 0,
      syncOnline: online,
      syncText: online ? '已同步 · 同行人共享' : '仅本机 · 未配置云同步',
    });
  },

  onPackingInput(e) {
    this.setData({ packingInput: e.detail.value });
  },

  onPickPackingGroup(e) {
    this.setData({ packingGroup: e.currentTarget.dataset.group });
  },

  async onAddPacking() {
    const name = (this.data.packingInput || '').trim();
    if (!name) {
      this.toast('先写要带什么');
      return;
    }
    if (name.length > 30) {
      this.toast('物品名最多 30 个字');
      return;
    }
    const group = this.data.packingGroup || '其他';
    this.setData({ packingInput: '' });
    await apiAddPacking(this.data.tripId, name, group);
    await this.loadPacking();
    this.measureSections();
    this.toast(`已加入「${group}」`);
  },

  async onTogglePacking(e) {
    const { id, done } = e.currentTarget.dataset;
    await apiTogglePacking(this.data.tripId, id, !done);
    await this.loadPacking();
  },

  onRemovePacking(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '删掉这一项？',
      content: name || '',
      confirmText: '删除',
      confirmColor: '#B4552D',
      success: async (res) => {
        if (!res.confirm) return;
        await apiRemovePacking(this.data.tripId, id);
        await this.loadPacking();
        this.measureSections();
      },
    });
  },

  /* ====================== 07 花费统计共享记账 ====================== */

  async loadCosts() {
    const { list, online } = await fetchCosts(this.data.tripId);
    const costs = list.map((it) => ({
      id: it._id || it.id,
      amount: Number(it.amount) || 0,
      amountText: fmtNum(it.amount),
      note: it.note || '',
      category: it.category || '其他',
      dateText: fmtCostDate(it.createdAt),
    }));

    const total = costs.reduce((n, it) => n + it.amount, 0);

    // 分类总价：始终列出全部 7 类（含 ¥0 的），零金额类目置灰
    const cats = this.data.costCategories.length ? this.data.costCategories : FALLBACK_CATS;
    const sum = {};
    cats.forEach((c) => {
      sum[c] = 0;
    });
    costs.forEach((it) => {
      sum[it.category] = (sum[it.category] || 0) + it.amount;
    });

    const max = cats.reduce((m, k) => (sum[k] > m ? sum[k] : m), 0);
    const ordered = cats.slice().sort((a, b) => sum[b] - sum[a]);
    const share = (this.data.trip && this.data.trip.costs && this.data.trip.costs.shareCount) || 2;

    // 筛选条只列「有记录」的分类（0 笔的分类点了只会是空列表）。
    // 若当前选中的分类因为删记录而消失，回落「全部」，免得停在空列表上。
    const filters = ordered.filter((c) => sum[c] > 0);
    const active = filters.indexOf(this.data.costFilter) === -1 ? '全部' : this.data.costFilter;

    this.setData({
      costs,
      costsShown: active === '全部' ? costs : costs.filter((it) => it.category === active),
      costFilters: filters,
      costFilter: active,
      costCount: costs.length,
      costTotal: fmtNum(total),
      costAvg: fmtNum(total / share),
      shareCount: share,
      costCats: ordered.map((name) => ({
        name,
        text: fmtNum(sum[name]),
        percent: sum[name] === 0 ? 0 : Math.max(3, Math.round((sum[name] / max) * 100)),
        zero: sum[name] === 0,
      })),
      costOnline: online,
      costText: online ? '已同步 · 同行人共享' : '仅本机 · 未配置云同步',
    });
  },

  onCostInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`costForm.${field}`]: e.detail.value });
  },

  onCostCat(e) {
    const index = Number(e.detail.value) || 0;
    this.setData({
      costCatIndex: index,
      'costForm.category': this.data.costCategories[index] || '其他',
    });
  },

  /* 明细列表折叠：收起后只留一行头条，切完必须重测区块锚点，否则导航跳转位置会偏 */
  onToggleCosts() {
    this.setData({ costOpen: !this.data.costOpen }, () => this.measureSections());
  },

  /* 分类筛选：点已选中的那个直接返回，免得白跑一次高度重测 */
  onCostFilter(e) {
    const cat = e.currentTarget.dataset.cat;
    if (cat === this.data.costFilter) return;
    this.setData(
      {
        costFilter: cat,
        costsShown: cat === '全部' ? this.data.costs : this.data.costs.filter((it) => it.category === cat),
      },
      () => this.measureSections()
    );
  },

  async onAddCost() {
    const { amount, note, category } = this.data.costForm;
    if (!(Number(amount) > 0)) {
      this.toast('金额要大于 0');
      return;
    }
    try {
      await apiAddCost(this.data.tripId, { amount, note, category });
    } catch (err) {
      this.toast(err.message || '记账失败');
      return;
    }
    // 刚记完的这笔总得看得见：收起状态下一并展开，筛选也回到「全部」
    // （否则正筛着「机票」时记一笔「门票」，新记录会被自己的筛选条件挡住）
    this.setData({ 'costForm.amount': '', 'costForm.note': '', costOpen: true, costFilter: '全部' });
    await this.loadCosts();
    this.measureSections();
    this.toast('已记一笔');
  },

  onRemoveCost(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '删掉这笔记录？',
      confirmText: '删除',
      confirmColor: '#B4552D',
      success: async (res) => {
        if (!res.confirm) return;
        await apiRemoveCost(this.data.tripId, id);
        await this.loadCosts();
        this.measureSections();
      },
    });
  },

  /* ================ 07 交通记录（手动记，并入逐日行程） ================ */

  async loadTraffic() {
    const { list, online } = await fetchTraffic(this.data.tripId);

    // 日期 → 「DAY n」，列表里直接告诉用户这条落在哪一天
    const tagByDate = {};
    this.data.days.forEach((d, i) => {
      if (d.date) tagByDate[d.date] = `DAY ${i + 1}`;
    });

    const traffic = list
      .map((it) => {
        const date = it.date || '';
        const { c, sub } = trafficText(it);
        return {
          id: it._id || it.id,
          date,
          dateText: monthDayText(date),
          dayTag: tagByDate[date] || '',
          time: it.time || '',
          mode: it.mode || '其他',
          from: it.from || '',
          to: it.to || '',
          no: it.no || '',
          c,
          sub,
          // src 是展示用的名称（粘链接时已由 api/trip.js 解析好），link 决定要不要给跳转入口
          src: it.src || '',
          link: it.link || '',
          who: it.who || '同行人',
        };
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
      });

    this.paintTraffic(traffic, online);
  },

  /**
   * 记录写进 07 区块列表，并按日期并入对应那一天的时间线。
   *
   * 两个要点：
   *   1) 时间线永远从 _baseTimeline 重算，反复下拉刷新不会「插两遍」；
   *   2) 只回写 days[i].timeline 这一个路径，不用整份 days 回写 ——
   *      整份回写会和逐日预报的 setData 撞车互相覆盖（两个请求是并行发的）。
   */
  paintTraffic(traffic, online) {
    const base = this._baseTimeline || [];
    const patch = {
      traffic,
      trafficCount: traffic.length,
      trafficOnline: online,
      trafficText: online ? '已同步 · 同行人共享' : '仅本机 · 未配置云同步',
    };

    this.data.days.forEach((d, i) => {
      patch[`days[${i}].timeline`] = mergeTraffic(
        base[i],
        traffic.filter((r) => r.date && r.date === d.date)
      );
    });

    this.setData(patch, () => this.measureSections());
  },

  onTrafficDate(e) {
    this.setData({ 'trafficForm.date': e.detail.value });
  },

  onTrafficTime(e) {
    this.setData({ 'trafficForm.time': e.detail.value });
  },

  onTrafficInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`trafficForm.${field}`]: e.detail.value });
  },

  onTrafficMode(e) {
    const index = Number(e.currentTarget.dataset.index) || 0;
    this.setData({
      trafficModeIndex: index,
      'trafficForm.mode': this.data.trafficModes[index] || '其他',
    });
  },

  async onAddTraffic() {
    const { date, time, mode, from, to, no, src } = this.data.trafficForm;
    if (!date || !time) {
      this.toast('先选日期和时间');
      return;
    }
    try {
      await apiAddTraffic(this.data.tripId, { date, time, mode, from, to, no, src });
    } catch (err) {
      this.toast(err.message || '记录失败');
      return;
    }
    // 日期 / 时间 / 方式留着（常常连着记好几段），只清掉文字
    this.setData({
      'trafficForm.from': '',
      'trafficForm.to': '',
      'trafficForm.no': '',
      'trafficForm.src': '',
    });
    await this.loadTraffic();
    this.toast('已加入行程');
  },

  /**
   * 打开这条记录填的来源小程序。
   * 传 shortLink 就不需要 appId（基础库 2.18.1+），链接来自用户自己粘的
   * 「… → 复制链接」，所以这里不维护 appid 表。只有 src 没有 link 的条目
   * 压根不会渲染出可点的入口，不用在这儿兜底。
   *
   * 开发者工具这一支**必须拦在调用之前**（2026-09-15 修，上一版接在 fail 里是白写的）：
   * 工具里只做校验，校验通过时既不真跳、也不回调 fail，于是「工具里点一下毫无反应、
   * 连个提示都没有」，看着完全就是功能坏了。现在工具里直接给话，不发起调用。
   *
   * 真机上失败要分两种说法：
   *   1. 用户在确认弹窗点了取消 → 静默，不当错误（fail cancel）；
   *   2. 真失败 → toast 带 errMsg 原文，方便照着查（链接失效 / 目标不可跳等）。
   */
  onOpenSource(e) {
    const { link } = e.currentTarget.dataset;
    if (!link) return;

    if (typeof wx.navigateToMiniProgram !== 'function') {
      this.toast('微信版本太旧，不支持跳转其他小程序');
      return;
    }

    if (this.devicePlatform() === 'devtools') {
      console.log('[trip] 开发者工具不真跳，只校验。来源链接 =', link);
      this.toast('开发者工具不会真跳，用真机「预览」扫码再点');
      return;
    }

    console.log('[trip] 打开来源小程序', link);
    wx.navigateToMiniProgram({
      shortLink: link,
      success: () => console.log('[trip] 跳转已发起'),
      fail: (err) => {
        const msg = String((err && err.errMsg) || '');
        console.error('[trip] 打开来源失败', msg);
        if (msg.indexOf('cancel') > -1) return;
        this.toast(
          '打不开这个来源：' + (msg.replace(/^navigateToMiniProgram:fail\s*/, '') || '链接可能已失效')
        );
      },
    });
  },

  /** 当前运行平台（devtools / ios / android / windows / mac…），读不到就返回空串 */
  devicePlatform() {
    try {
      return wx.getDeviceInfo
        ? wx.getDeviceInfo().platform
        : wx.getSystemInfoSync().platform;
    } catch (e) {
      return '';
    }
  },

  onRemoveTraffic(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '删掉这条交通记录？',
      confirmText: '删除',
      confirmColor: '#B4552D',
      success: async (res) => {
        if (!res.confirm) return;
        await apiRemoveTraffic(this.data.tripId, id);
        await this.loadTraffic();
      },
    });
  },

  /* ============================ 其它 ============================ */

  toast(content) {
    Message.info({
      context: this,
      offset: [120, 32],
      duration: 2000,
      content,
    });
  },

  showOperMsg(content) {
    Message.success({
      context: this,
      offset: [120, 32],
      duration: 3000,
      content,
    });
  },
});
