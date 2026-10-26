// pages/weight/index.js — 体重追踪（常用工具）
//
// 由网页版 E:/3_WorkSpace/SimpleWeb/weight-tracker 移植：
//   双人（我 / TA）→ 月份切换 → 加记录 → 月度统计 → 趋势图 → 本月记录 → 智能分析
//   外加 BMI 计算、导出 / 导入 / 清空。
//
// 与网页版刻意不同的地方：
//   ① 数据存云数据库（api/weight.js：云优先、本机兜底），没配云时纯本机可用；
//   ② 趋势图不用 Chart.js，用 canvas 2d 手绘（小程序里引第三方图表库太重）；
//   ③ 空数据不再自动灌 10 条假记录 —— 假数据会污染趋势判断。
//      老数据走「导入网页版历史数据」（utils/weight-seed.js）。
//
// 渲染节奏：先用本机缓存立刻出画面，再去拉云端覆盖（拉取期间本地改过就不覆盖），
// 所以点开不会白屏，断网也能照常记。
//
// 本页是普通页（非 tabBar），从 pages/tools 用 navigateTo 进来，返回用 navigateBack。
// 纯计算都在 utils/weight.js，本文件只管状态与渲染。

// 引用一律走 ~/ 别名（app.json 的 resolveAlias "~/*": "/*"），不用 ../../ 相对路径。
// 原因：开发者工具对「相对路径 + 新增文件」的模块索引出过一次 bug —— 报
//   can not find module : , require args is ../../utils/weight
// （模块名是空的），清缓存 / 重启都可能复发。本项目 pages/home、pages/index 一直在用
// ~/api/xxx 且稳定，换成同一条解析链即可绕开。
const W = require('~/utils/weight');
const CH = require('~/utils/weight-chart');
const Api = require('~/api/weight');

/**
 * 新记录的 id。
 * 只用 Date.now() 不够：连着存两条落在同一毫秒时 id 会撞，
 * 之后点「编辑 / 删除」会命中另一条（行看着变了、数据错的却是别人）。
 */
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

Page({
  data: {
    statusTop: 0,
    today: '',

    // 云端同步状态：null = 还没拉过（同步中）/ true = 已同步 / false = 仅本机
    online: null,

    // 谁的数据
    user: 'me',

    // 当前查看的月份
    monthY: 0,
    monthM: 0,
    monthLabel: '',
    isThisMonth: true,
    monthCount: 0,

    // 图表模式：weight 只看体重 / fat 只看体脂 / all 两者都看
    // （all 同时把统计口径切到「历史」，跟网页版一致）
    mode: 'weight',
    showW: true,
    showF: false,

    // 统计（已格式化成展示字符串）
    stat: null,
    statLabels: {
      max: '本月最高',
      min: '本月最低',
      spread: '月波动',
      maxF: '本月最高体脂',
      minF: '本月最低体脂',
      spreadF: '体脂波动',
    },

    // 当月记录（倒序 + 徽标）
    records: [],
    analysis: null,
    // 本机一条记录都没有（给迁移提示用）
    isEmpty: true,

    // 添加表单
    formDate: '',
    formWeight: '',
    formFat: '',

    // BMI
    bmiOn: false,
    bmiHeight: '',
    bmiWeight: '',
    bmiResult: null,

    // 编辑弹层
    editOn: false,
    editId: '',
    editDate: '',
    editWeight: '',
    editFat: '',
  },

  onLoad() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const store = Api.loadLocal();
    this.appData = { version: 2, currentUser: store.currentUser, users: store.users };
    const now = new Date();
    const today = W.todayStr();
    const cloudOn = Api.isCloudOn();
    this.setData(
      {
        statusTop: (win && win.statusBarHeight) || 0,
        today,
        online: cloudOn ? null : false,
        user: this.appData.currentUser === 'ta' ? 'ta' : 'me',
        monthY: now.getFullYear(),
        monthM: now.getMonth() + 1,
        formDate: today,
      },
      () => {
        this.refresh();
        if (cloudOn) this.syncCloud();
      },
    );
  },

  /** 上次同步失败过就趁回到前台再试一次（离线记完，联网后自动补上） */
  onShow() {
    // 从横屏页返回后必须解锁，否则第二次点趋势图会没反应（踩过）
    this._navLock = false;
    if (this.pending) {
      this.pending = false;
      this.pushCloudBoth();
    }
  },

  onReady() {
    this.initChart();
  },

  /* ---------------- 存储与同步 ---------------- */

  /** 只写本机缓存（切人、纯界面态用，不触发云端写） */
  saveLocalOnly() {
    Api.saveLocal(this.appData.users, this.data.user);
  },

  /** 本机立刻落盘（保证断网不丢），再异步推云端，回来更新「已同步 / 仅本机」 */
  persist(user) {
    this.saveLocalOnly();
    this.dirty = true;
    this.pushCloud(user || this.data.user);
  },

  async pushCloud(user) {
    const uid = user || this.data.user;
    const r = await Api.pushUser(uid, this.appData.users[uid] || []);
    this.dirty = !r.online;
    this.pending = !r.online;
    this.setData({ online: r.online });
  },

  /** 两个人一起推：导入历史、清空这种会同时动两份文档的操作 */
  async pushCloudBoth() {
    const r = await Api.pushAll(this.appData.users);
    this.dirty = !r.online;
    this.pending = !r.online;
    this.setData({ online: r.online });
  },

  /** 拉云端覆盖本机；拉取期间本地改过就别盖（否则刚记的那条会没） */
  async syncCloud() {
    if (this._syncing) return;
    this._syncing = true;
    const r = await Api.fetchUsers();
    this._syncing = false;

    this.setData({ online: r.online });
    if (this.dirty) return;

    this.appData.users = r.users;
    this.refresh();
  },

  /** 当前这个人的记录数组，缺了就补一个空数组 */
  listOf(user) {
    const u = user || this.data.user;
    if (!this.appData.users[u]) this.appData.users[u] = [];
    return this.appData.users[u];
  },

  /** 弹一条轻提示 */
  toast(title) {
    wx.showToast({ title: String(title || ''), icon: 'none', duration: 2200 });
  },

  /* ---------------- 渲染 ---------------- */

  refresh() {
    const d = this.data;
    const user = d.user;
    const all = this.listOf(user).slice().sort(W.byDateAsc);
    const month = all.filter((r) => W.inMonth(r, d.monthY, d.monthM));
    const hist = d.mode === 'all';
    const scope = hist ? all : month;

    const stat = W.stat(scope);
    const statLabels = {
      max: hist ? '历史最高' : '本月最高',
      min: hist ? '历史最低' : '本月最低',
      spread: hist ? '历史波动' : '月波动',
      maxF: hist ? '历史最高体脂' : '本月最高体脂',
      minF: hist ? '历史最低体脂' : '本月最低体脂',
      spreadF: hist ? '历史体脂波动' : '体脂波动',
    };

    let top = null;
    let bot = null;
    if (month.length) {
      top = month[0].weight;
      bot = month[0].weight;
      for (let i = 1; i < month.length; i++) {
        if (month[i].weight > top) top = month[i].weight;
        if (month[i].weight < bot) bot = month[i].weight;
      }
    }

    const records = month
      .slice()
      .reverse()
      .map((r) => {
        let badge = '';
        let tone = '';
        // 只有一个值（或全月一模一样）时不打「最高/最低」，否则每行都挂徽标
        if (month.length > 1 && top !== bot) {
          if (r.weight === top) {
            badge = '最高';
            tone = 'hi';
          } else if (r.weight === bot) {
            badge = '最低';
            tone = 'lo';
          }
        }
        const t = W.ymd(r.date);
        return {
          id: r.id,
          date: r.date,
          md: t.m + '月' + t.d + '日',
          wd: W.weekday(r.date),
          weight: W.fmt1(r.weight),
          fat: r.bodyFat === null ? '-' : W.fmt1(r.bodyFat) + '%',
          badge,
          tone,
        };
      });

    const showW = d.mode !== 'fat';
    const showF = d.mode === 'fat' || d.mode === 'all';
    this.chartSrc = { list: hist ? all : month, showW, showF };

    const now = new Date();
    this.setData(
      {
        monthLabel: W.monthLabel(d.monthY, d.monthM),
        isThisMonth: d.monthY === now.getFullYear() && d.monthM === now.getMonth() + 1,
        monthCount: month.length,
        stat,
        statLabels,
        records,
        analysis: W.trend(month),
        isEmpty: W.totalCount(this.appData.users) === 0,
        showW,
        showF,
      },
      () => this.drawChart(),
    );
  },

  /* ---------------- 顶部交互 ---------------- */

  onBackNav() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/tools/index' }),
    });
  },

  onUser(e) {
    const user = e.currentTarget.dataset.user === 'ta' ? 'ta' : 'me';
    if (user === this.data.user) return;
    this.setData({ user }, () => {
      this.saveLocalOnly();
      this.refresh();
    });
  },

  onMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.mode) return;
    this.setData({ mode }, () => this.refresh());
    // 切「全部」只是换图表内容，不自动进横屏 —— 横屏要靠点趋势图（用户明确要求）
  },

  /**
   * 横屏看趋势。
   * 页面本身**不转**（没设 pageOrientation，体重页永远竖屏），
   * 转的是 chart 页 canvas 里的坐标系 —— 横着拿手机就是一张铺满的横向大图。
   * 加了个短锁：只挡连点；navigateTo 万一失败会退回 redirectTo，不让点击静默失效。
   */
  onFullscreen() {
    if (this._navLock) return;
    this._navLock = true;
    const d = this.data;
    const url =
      '/pages/weight/chart?user=' + d.user +
      '&mode=' + d.mode +
      '&scope=' + (d.mode === 'all' ? 'all' : 'month') +
      '&y=' + d.monthY +
      '&m=' + d.monthM;
    wx.navigateTo({
      url: url,
      fail: (err) => {
        console.error('[weight] 打开横屏趋势失败，改用 redirectTo', err);
        wx.redirectTo({ url: url });
      },
      complete: () => {
        setTimeout(() => {
          this._navLock = false;
        }, 300);
      },
    });
  },

  onPrevMonth() {
    let { monthY, monthM } = this.data;
    monthM -= 1;
    if (monthM < 1) {
      monthM = 12;
      monthY -= 1;
    }
    this.setData({ monthY, monthM }, () => this.refresh());
  },

  onNextMonth() {
    let { monthY, monthM } = this.data;
    monthM += 1;
    if (monthM > 12) {
      monthM = 1;
      monthY += 1;
    }
    this.setData({ monthY, monthM }, () => this.refresh());
  },

  /* ---------------- 添加记录 ---------------- */

  onFormDate(e) {
    this.setData({ formDate: e.detail.value });
  },

  onFormWeight(e) {
    this.setData({ formWeight: e.detail.value });
  },

  onFormFat(e) {
    this.setData({ formFat: e.detail.value });
  },

  onSave() {
    const weight = W.toNum(this.data.formWeight);
    if (weight === null) return this.toast('先填体重');
    if (weight < 60 || weight > 400) return this.toast('体重请在 60-400 斤之间');

    const fat = W.toNum(this.data.formFat);
    if (fat !== null && (fat < 5 || fat > 50)) return this.toast('体脂率请在 5-50% 之间');

    const date = this.data.formDate || W.todayStr();
    const t = W.ymd(date);
    if (!t) return this.toast('日期不对');

    const list = this.listOf();
    const i = list.findIndex((r) => r.date === date);
    if (i >= 0) {
      list[i].weight = W.r1(weight);
      list[i].bodyFat = fat === null ? null : W.r1(fat);
    } else {
      list.push({
        id: newId(),
        date,
        weight: W.r1(weight),
        bodyFat: fat === null ? null : W.r1(fat),
      });
    }

    // 保存后跳到这条记录所在月份，不然跨月记录看不见
    this.setData(
      {
        formDate: W.todayStr(),
        formWeight: '',
        formFat: '',
        monthY: t.y,
        monthM: t.m,
      },
      () => {
        this.persist();
        this.refresh();
        this.toast(i >= 0 ? '当天记录已更新' : '已保存');
      },
    );
  },

  /* ---------------- 编辑弹层 ---------------- */

  onOpenEdit(e) {
    const id = e.currentTarget.dataset.id;
    const rec = this.listOf().find((r) => String(r.id) === String(id));
    if (!rec) return;
    this.setData({
      editOn: true,
      editId: String(rec.id),
      editDate: rec.date,
      editWeight: W.fmt1(rec.weight),
      editFat: rec.bodyFat === null ? '' : W.fmt1(rec.bodyFat),
    });
  },

  onCloseEdit() {
    this.setData({ editOn: false });
  },

  onEditDate(e) {
    this.setData({ editDate: e.detail.value });
  },

  onEditWeight(e) {
    this.setData({ editWeight: e.detail.value });
  },

  onEditFat(e) {
    this.setData({ editFat: e.detail.value });
  },

  /** 弹层里的空方法：挡住遮罩与面板上的冒泡 */
  noop() {},

  onEditSave() {
    const weight = W.toNum(this.data.editWeight);
    if (weight === null) return this.toast('先填体重');
    if (weight < 60 || weight > 400) return this.toast('体重请在 60-400 斤之间');

    const fat = W.toNum(this.data.editFat);
    if (fat !== null && (fat < 5 || fat > 50)) return this.toast('体脂率请在 5-50% 之间');

    const list = this.listOf();
    const i = list.findIndex((r) => String(r.id) === this.data.editId);
    if (i < 0) return this.onCloseEdit();

    const date = this.data.editDate;
    // 改成别的日期时，若那天已有记录就合并，别留两条同日期（会互相覆盖统计）
    const dup = list.findIndex((r, k) => k !== i && r.date === date);
    if (dup >= 0) {
      list[dup].weight = W.r1(weight);
      list[dup].bodyFat = fat === null ? null : W.r1(fat);
      list.splice(i, 1);
    } else {
      list[i].date = date;
      list[i].weight = W.r1(weight);
      list[i].bodyFat = fat === null ? null : W.r1(fat);
    }

    const t = W.ymd(date);
    this.setData(
      { editOn: false, monthY: t ? t.y : this.data.monthY, monthM: t ? t.m : this.data.monthM },
      () => {
        this.persist();
        this.refresh();
        this.toast('已更新');
      },
    );
  },

  onEditDelete() {
    const list = this.listOf();
    const i = list.findIndex((r) => String(r.id) === this.data.editId);
    if (i < 0) return this.onCloseEdit();
    wx.showModal({
      title: '删除记录',
      content: '删掉 ' + list[i].date + ' 这条？删了就找不回来。',
      confirmText: '删除',
      confirmColor: '#B4552D',
      success: (res) => {
        if (!res.confirm) return;
        list.splice(i, 1);
        this.setData({ editOn: false }, () => {
          this.persist();
          this.refresh();
          this.toast('已删除');
        });
      },
    });
  },

  /* ---------------- BMI ---------------- */

  onToggleBmi() {
    const on = !this.data.bmiOn;
    const patch = { bmiOn: on };
    // 顺手把当前体重填进 BMI 的体重框，省得再敲一遍
    if (on && !this.data.bmiWeight && this.data.stat && this.data.stat.latestW) {
      patch.bmiWeight = this.data.stat.latestW;
    }
    this.setData(patch, () => {
      if (on) setTimeout(() => this.scrollTo('#bmiCard'), 90);
    });
  },

  onBmiHeight(e) {
    this.setData({ bmiHeight: e.detail.value });
  },

  onBmiWeight(e) {
    this.setData({ bmiWeight: e.detail.value });
  },

  onBmiCalc() {
    const r = W.bmi(this.data.bmiHeight, this.data.bmiWeight);
    if (!r.ok) {
      this.setData({ bmiResult: null });
      return this.toast(r.reason);
    }
    this.setData({ bmiResult: r });
  },

  /** 滚到某个选择器（自查过 boundingClientRect，别用裸 selector） */
  scrollTo(sel) {
    wx.createSelectorQuery()
      .select(sel)
      .boundingClientRect()
      .selectViewport()
      .scrollOffset()
      .exec((res) => {
        const rect = res && res[0];
        const vp = res && res[1];
        if (!rect) return;
        wx.pageScrollTo({
          scrollTop: rect.top + (vp ? vp.scrollTop : 0) - 12,
          duration: 260,
        });
      });
  },

  /* ---------------- 数据管理 ---------------- */

  onExport() {
    const users = this.appData.users;
    if (!W.totalCount(users)) return this.toast('还没有数据可导出');

    const text = JSON.stringify(
      { version: '2.0', exportDate: new Date().toISOString(), users: { me: users.me, ta: users.ta } },
      null,
      2,
    );
    const name = '体重记录-' + W.todayStr() + '.json';

    // 优先发成文件（可发给「文件传输助手」再存到电脑）
    let filePath = '';
    try {
      filePath = wx.env.USER_DATA_PATH + '/' + name;
      wx.getFileSystemManager().writeFileSync(filePath, text, 'utf8');
    } catch (e) {
      filePath = '';
    }

    if (filePath && typeof wx.shareFileMessage === 'function') {
      wx.shareFileMessage({
        filePath,
        fileName: name,
        fail: (err) => {
          // 用户自己取消就别再弹剪贴板，免得吓一跳
          if (err && /cancel/i.test(String(err.errMsg || ''))) return;
          this.copyOut(text);
        },
      });
      return;
    }
    this.copyOut(text);
  },

  copyOut(text) {
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '数据已复制，可粘贴到备忘录', icon: 'none', duration: 2400 }),
    });
  },

  onImport() {
    wx.getClipboardData({
      success: (res) => this.importText(res && res.data),
      fail: () => this.toast('读不到剪贴板'),
    });
  },

  onImportSeed() {
    let seed = null;
    try {
      seed = require('~/utils/weight-seed');
    } catch (e) {
      seed = null;
    }
    if (!seed) return this.toast('没有内置数据');
    const n = W.normalize(seed);
    const total = n.me.length + n.ta.length;
    if (!total) return this.toast('内置数据是空的');

    wx.showModal({
      title: '导入内置数据',
      content: '会把内置的 ' + total + ' 条记录灌进来（覆盖当前数据），确定吗？',
      confirmText: '导入',
      success: (res) => {
        if (!res.confirm) return;
        this.applyUsers(n, total);
      },
    });
  },

  importText(rawText) {
    const txt = String(rawText || '').trim();
    if (!txt) return this.toast('剪贴板是空的');

    let obj = null;
    try {
      obj = JSON.parse(txt);
    } catch (e) {
      return this.toast('剪贴板里不是有效的数据');
    }
    const n = W.normalize(obj);
    const total = n.me.length + n.ta.length;
    if (!total) return this.toast('没解析出记录');

    wx.showModal({
      title: '导入数据',
      content: '会覆盖现有记录，共 ' + total + ' 条，确定吗？',
      confirmText: '覆盖导入',
      success: (res) => {
        if (!res.confirm) return;
        this.applyUsers(n, total);
      },
    });
  },

  /** 导入成功后统一落盘并推云端（两份文档都变，用 pushAll） */
  applyUsers(users, total) {
    this.appData.users = { me: users.me || [], ta: users.ta || [] };
    this.saveLocalOnly();
    this.dirty = true;
    this.pushCloudBoth();
    this.refresh();
    this.toast('已导入 ' + total + ' 条');
  },

  onClear() {
    if (!W.totalCount(this.appData.users)) return this.toast('还没有数据可清空');
    wx.showModal({
      title: '清空数据',
      content: '会删掉「我」和「TA」的全部记录，云端也一起清，不可恢复。确定吗？',
      confirmText: '清空',
      confirmColor: '#B4552D',
      success: (res) => {
        if (!res.confirm) return;
        this.appData.users = { me: [], ta: [] };
        this.saveLocalOnly();
        this.dirty = true;
        this.pushCloudBoth();
        this.refresh();
        this.toast('已清空');
      },
    });
  },

  /* ---------------- 趋势图（canvas 2d 手绘）---------------- */

  initChart() {
    if (this.chart) return;
    wx.createSelectorQuery()
      .select('#wtChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res && res[0];
        if (!item || !item.node) return;
        const canvas = item.node;
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const dpr = (info && info.pixelRatio) || 2;
        // 像素尺寸乘 dpr，逻辑尺寸仍按 CSS 像素算，否则线会糊
        canvas.width = Math.round(item.width * dpr);
        canvas.height = Math.round(item.height * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        this.chart = { ctx, w: item.width, h: item.height };
        this.drawChart();
      });
  },

  /** 数据 / 月份 / 模式变了就重画；绘制细节全在 utils/weight-chart.js */
  drawChart() {
    const c = this.chart;
    if (!c) return; // onReady 之前画不了，等 initChart 里补画
    const src = this.chartSrc || { list: [], showW: true, showF: false };
    CH.drawTrend(c.ctx, { w: c.w, h: c.h, list: src.list, showW: src.showW, showF: src.showF });
  },
});
