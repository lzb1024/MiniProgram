// 综合版小程序的新首页：行程列表。
//
// 原来一进来就是川西攻略（pages/home），现在这里列出所有行程，点一张卡片
// 进对应详情页：wx.navigateTo('/pages/home/index?trip=xxx')。
// 行程本身的清单在 mock/trips/index.js，详情数据在 mock/trips/{id}.js。
import request from '~/api/request';

/** '2026-09-25' → Date（固定中午，避开时区 / 夏令时的边界抖动） */
function parseDate(str) {
  const parts = String(str || '').split('-').map(Number);
  if (parts.length !== 3 || !parts[0]) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

/** 两个日期差几天（含首含尾）。任一端缺日期就返回 0，不硬算 */
function spanDays(start, end) {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** 今天（固定中午，和上面的 parseDate 对齐，避免跨时区把差值算错一天） */
function todayNoon() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * 行程状态与倒计时。
 * 全部**按打开当天实时算**，mock 里只存原始日期 —— 这样过了半年再打开，
 * 「还有 3 天」仍然是准的，写死天数一定会错。
 *
 * 四种状态：
 *   done 已结束（今天 > 最后一天）
 *   now  行程中（今天落在区间内）→ 显示第几天 + 还剩几天
 *   soon 即将出发（3 天内出发）
 *   soon-ish 之后出发 → 显示「还有 N 天」
 */
function buildStatus(trip, now) {
  const start = parseDate(trip.start);
  const end = parseDate(trip.end);
  if (!start || !end) {
    return { state: 'idle', badge: '待定', countText: '', daysText: '' };
  }

  if (now > end) {
    const ago = Math.round((now - end) / 86400000);
    return { state: 'done', badge: '已结束', countText: `${ago} 天前回来`, daysText: '' };
  }

  if (now >= start) {
    // 行程中：第几天是「今天 - 出发日 + 1」，剩几天含今天
    const nth = Math.round((now - start) / 86400000) + 1;
    const left = Math.round((end - now) / 86400000);
    return {
      state: 'now',
      badge: '进行中',
      countText: `第 ${nth} 天`,
      daysText: left > 0 ? `还剩 ${left} 天` : '今天返程',
    };
  }

  const left = Math.round((start - now) / 86400000);
  return {
    state: left <= 3 ? 'soon' : 'idle',
    badge: '即将出发',
    countText: left === 0 ? '今天出发' : `还有 ${left} 天`,
    daysText: '',
  };
}

Page({
  data: {
    hero: null,
    trips: [],
    footer: [],
    loading: true,
    statusTop: 0,
  },

  onLoad() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusTop: (win && win.statusBarHeight) || 0 });
  },

  async onReady() {
    await this.loadData();
  },

  async loadData() {
    const res = await request('/home/trips').then((r) => r.data);
    const data = (res && res.data) || {};
    const now = todayNoon();

    // 按 order 升序（同一批值里小的靠前），order 缺失的沉到最后
    const trips = (data.trips || [])
      .slice()
      .sort((a, b) => (a.order || 999) - (b.order || 999))
      .map((t) => {
        const st = buildStatus(t, now);
        return {
          ...t,
          ...st,
          span: spanDays(t.start, t.end),
          rangeText: `${t.start} - ${t.end}`,
        };
      });

    this.setData({
      hero: data.hero || null,
      trips,
      footer: data.footer || [],
      loading: false,
    });
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh());
  },

  /** 点卡片进对应行程的详情页 */
  onTapTrip(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    // 详情页是普通页（非 tab），navigateTo 照常可用；
    // 注意本页自身已是 tab 页，切到别的 tab 必须用 switchTab（且不能带参）
    wx.navigateTo({ url: `/pages/home/index?trip=${id}` });
  },
});