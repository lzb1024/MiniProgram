// pages/weight/chart.js — 横屏看趋势（页面不转屏，图在 canvas 里转）
//
// 为什么这么绕：
//   ① 用页面级 pageOrientation: landscape 转的是**整页**（连状态栏、胶囊、页面栈一起），
//      从那一页返回后模拟器还会停在横屏，看起来像「整个体重页横过来了」→ 不用这条路。
//   ② 给 canvas 套 CSS transform 铺满屏幕，在部分机型上 canvas 直接不绘制（表现为一片空白）→ 也不用。
//   最终做法：canvas 铺满竖屏，旋转在**canvas 坐标系内**完成：
//      translate(sw,0) + rotate(90°) 把逻辑坐标 (宽=屏幕高, 高=屏幕宽) 映射到整块屏幕，
//      横着拿手机就是一张正着的横向大图，页面和状态栏一动不动。
//
// 只从体重页的「全部」按钮进来，固定「双轴 + 全部时间」。
// 数据先读本机立刻出图，再拉云端覆盖一次（同主页面的优先级）。
const W = require('~/utils/weight');
const CH = require('~/utils/weight-chart');
const Api = require('~/api/weight');

const TICK = '#8C9A94'; // 与 utils/weight-chart.js 的 COLORS.tick 一致

Page({
  data: {
    user: 'me',
    mode: 'all',
    scope: 'all',
    monthY: 0,
    monthM: 0,
    who: '我',
    rangeText: '',
    count: 0,
    showW: true,
    showF: true,
  },

  onLoad(q) {
    const now = new Date();
    this.setData({
      user: q && q.user === 'ta' ? 'ta' : 'me',
      mode: ['weight', 'fat', 'all'].indexOf(q && q.mode) >= 0 ? q.mode : 'all',
      scope: q && q.scope === 'month' ? 'month' : 'all',
      monthY: Number((q && q.y) || 0) || now.getFullYear(),
      monthM: Number((q && q.m) || 0) || now.getMonth() + 1,
    });

    // 本机先出图，云端回来再覆盖（云端不可用时 fetchUsers 会安静回落本机）
    this.users = Api.loadLocal().users;
    this.refresh();

    Api.fetchUsers()
      .then((r) => {
        if (!r || !r.users) return;
        this.users = r.users;
        this.refresh();
      })
      .catch(() => {});
  },

  onReady() {
    this.mountChart(0);
  },

  /** 屏幕尺寸变了（旋转 / 分屏）：重设位图尺寸再画 */
  onResize() {
    this.chart = null;
    this.mountChart(0);
  },

  refresh() {
    const d = this.data;
    const all = (this.users && this.users[d.user]) || [];
    const list = d.scope === 'all' ? all : all.filter((r) => W.inMonth(r, d.monthY, d.monthM));
    const showW = d.mode !== 'fat';
    const showF = d.mode === 'fat' || d.mode === 'all';

    this.chartSrc = { list: list, showW: showW, showF: showF };
    this.setData(
      {
        who: d.user === 'ta' ? 'TA' : '我',
        rangeText: d.scope === 'all' ? '全部时间' : W.monthLabel(d.monthY, d.monthM),
        count: list.length,
        showW: showW,
        showF: showF,
      },
      () => this.drawChart()
    );
  },

  /** 整层都是关闭区（没有按钮，就没有朝向问题） */
  onBack() {
    if (this._closing) return;
    this._closing = true;
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/weight/index' }),
    });
  },

  /* ---------------- canvas ---------------- */

  /** 拿节点 → 设位图尺寸 → 画。节点偶尔拿不到（首帧未挂载），带重试。 */
  mountChart(tryCount) {
    if (this.chart) return;
    const n = tryCount || 0;
    wx.createSelectorQuery()
      .select('#wcChart')
      .node()
      .exec((res) => {
        const canvas = res && res[0] && res[0].node;
        if (!canvas) {
          if (n < 12) setTimeout(() => this.mountChart(n + 1), 50);
          return;
        }
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const sw = (info && info.windowWidth) || 375;
        const sh = (info && info.windowHeight) || 667;
        const dpr = (info && info.pixelRatio) || 2;
        // 位图尺寸按屏幕算（不靠 measurement，父层没有 transform，量不量都一样）
        canvas.width = Math.round(sw * dpr);
        canvas.height = Math.round(sh * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (n < 12) setTimeout(() => this.mountChart(n + 1), 50);
          return;
        }
        this.chart = { ctx: ctx, sw: sw, sh: sh, dpr: dpr };
        this.drawChart();
      });
  },

  /**
   * 按屏幕实际方向决定怎么摆：
   *   · 屏幕竖着（windowHeight > windowWidth）：把逻辑坐标系转 90°，
   *     逻辑 (u,v) → 屏幕 (sw-v, u)，得到一张「逻辑宽=屏高、高=屏宽」的横版图，
   *     横着拿手机（顶部朝左）就是正的、且铺满整屏；
   *   · 屏幕已经是横的（模拟器转过 / 平板横放）：直接按屏幕尺寸正常画，不要再转，
   *     否则会多转 90° 变成歪的（踩过：模拟器停在上一次的横屏状态时，图整个歪掉）。
   */
  drawChart() {
    const c = this.chart;
    if (!c) return; // 节点还没就绪，mountChart 会补画
    const ctx = c.ctx;
    const src = this.chartSrc || { list: [], showW: true, showF: true };

    ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
    ctx.clearRect(0, 0, c.sw, c.sh);

    const portrait = c.sh > c.sw;
    const LW = portrait ? c.sh : c.sw;
    const LH = portrait ? c.sw : c.sh;

    ctx.save();
    if (portrait) {
      ctx.translate(c.sw, 0);
      ctx.rotate(Math.PI / 2);
    }
    CH.drawTrend(ctx, { w: LW, h: LH, list: src.list, showW: src.showW, showF: src.showF });

    // 信息与提示直接画进图里，省掉会朝向错乱的浮层
    const d = this.data;
    ctx.fillStyle = TICK;
    ctx.font = '11px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(d.who + ' · ' + d.rangeText + ' · 共 ' + d.count + ' 条', 16, LH - 12);
    ctx.fillText('点任意处关闭', 16, 22);

    ctx.restore();
  },
});
