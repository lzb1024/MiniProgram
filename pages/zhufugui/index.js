// pages/zhufugui/index.js — 朱富贵火锅消费计算（常用工具）
//
// 计价模型见 utils/zhufugui.js 顶部注释（色盘定价、只有菜金打会员折）。
// 两个模式同页切换（mode: 'total' | 'budget'）：
//   ① total   按人数 / 锅底 / 各色盘 / 饮料 → 出总价与人均
//   ② budget  给目标实付金额 → 反推各色盘各拿几盘
//
// 本页是普通页（非 tabBar），从 pages/tools 用 navigateTo 进来，返回用 navigateBack。

const zfg = require('../../utils/zhufugui');

const STORE_KEY = 'zhufugui_setup';
const STORE_VER = 1;

/** 四色盘计数的初始值 */
function blankPlates() {
  return { lv: 0, hu: 0, ho: 0, ti: 0 };
}

/** 饮料行：给列表加一个空行（选品 + 份数） */
function blankDrink() {
  return { idx: -1, name: '', price: 0, qty: 0 };
}

Page({
  data: {
    mode: 'total',
    statusTop: 0,

    // 会员价开关（默认按 6.8 折会员价算，更贴近实际结账）
    member: true,

    // 共用输入
    people: 2,
    potNormal: 2,
    potClear: 0,

    // ① 算总价
    plates: blankPlates(),
    colors: zfg.COLORS, // 用于渲染四色行（单价随 member 变化，见 calc）
    colorUnits: zfg.priceTable(true),
    drinkList: zfg.DRINKS,
    drinkPickerRange: zfg.DRINKS.map((d) => `${d.name}（${d.price}元）`),
    drinks: [blankDrink()],
    total: null,

    // ② 预算反推
    target: '',
    tolerance: 20,
    prefer: 'none',
    preferOptions: [
      { key: 'none', label: '无偏好' },
      { key: 'ti', label: '铁盘多' },
      { key: 'ho', label: '红盘多' },
      { key: 'hu', label: '黄盘多' },
      { key: 'lv', label: '绿盘多' },
    ],
    suggest: null,
  },

  onLoad() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusTop: (win && win.statusBarHeight) || 0 });
    this.restore();
    this.recalcTotal();
  },

  /* ---------------- 缓存 ---------------- */

  restore() {
    let saved = null;
    try {
      saved = wx.getStorageSync(STORE_KEY);
    } catch (e) {
      saved = null;
    }
    if (!saved || saved.ver !== STORE_VER) return;
    this.setData({
      member: saved.member !== false,
      people: zfg.toInt(saved.people),
      potNormal: zfg.toInt(saved.potNormal),
      potClear: zfg.toInt(saved.potClear),
      plates: Object.assign(blankPlates(), saved.plates || {}),
      colorUnits: zfg.priceTable(saved.member !== false),
    });
  },

  /** 只存"每次都要重填"的输入，饮料与结果不存 */
  persist() {
    const { member, people, potNormal, potClear, plates } = this.data;
    try {
      wx.setStorageSync(STORE_KEY, {
        ver: STORE_VER,
        member,
        people: String(people),
        potNormal: String(potNormal),
        potClear: String(potClear),
        plates,
      });
    } catch (e) {
      // 静默
    }
  },

  /* ---------------- 顶部与模式 ---------------- */

  onBackNav() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/tools/index' }),
    });
  },

  onMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  /** 切会员价：四色单价跟着变，总价重算 */
  onMember(e) {
    const member = !!e.detail.value;
    this.setData({ member, colorUnits: zfg.priceTable(member) }, () => {
      this.recalcTotal();
      this.persist();
    });
  },

  /* ---------------- 共用输入 ---------------- */

  onPeople(e) {
    this.setData({ people: zfg.toInt(e.detail.value) }, () => {
      this.recalcTotal();
      this.persist();
    });
  },

  onPotNormal(e) {
    this.setData({ potNormal: zfg.toInt(e.detail.value) }, () => {
      this.recalcTotal();
      this.persist();
    });
  },

  onPotClear(e) {
    this.setData({ potClear: zfg.toInt(e.detail.value) }, () => {
      this.recalcTotal();
      this.persist();
    });
  },

  /* ---------------- 模式一：盘子与饮料 ---------------- */

  onPlate(e) {
    const { key } = e.currentTarget.dataset;
    const v = zfg.toInt(e.detail.value);
    this.setData({ [`plates.${key}`]: v }, () => {
      this.recalcTotal();
      this.persist();
    });
  },

  /** 步进器：同色盘 ±1 */
  onPlateStep(e) {
    const { key, step } = e.currentTarget.dataset;
    const cur = zfg.toInt(this.data.plates[key]);
    const next = Math.max(0, cur + Number(step));
    this.setData({ [`plates.${key}`]: next }, () => {
      this.recalcTotal();
      this.persist();
    });
  },

  onAddDrink() {
    this.setData({ drinks: this.data.drinks.concat(blankDrink()) });
  },

  onDrinkPick(e) {
    const i = Number(e.currentTarget.dataset.i);
    const idx = Number(e.detail.value);
    const d = zfg.DRINKS[idx];
    if (!d) return;
    this.setData({
      [`drinks[${i}].idx`]: idx,
      [`drinks[${i}].name`]: d.name,
      [`drinks[${i}].price`]: d.price,
      [`drinks[${i}].qty`]: this.data.drinks[i].qty > 0 ? this.data.drinks[i].qty : 1,
    }, () => this.recalcTotal());
  },

  onDrinkQty(e) {
    const i = Number(e.currentTarget.dataset.i);
    const step = Number(e.currentTarget.dataset.step);
    const cur = zfg.toInt(this.data.drinks[i].qty);
    const next = Math.max(0, cur + step);
    this.setData({ [`drinks[${i}].qty`]: next }, () => this.recalcTotal());
  },

  onDelDrink(e) {
    const i = Number(e.currentTarget.dataset.i);
    const next = this.data.drinks.slice();
    next.splice(i, 1);
    this.setData({ drinks: next.length ? next : [blankDrink()] }, () => this.recalcTotal());
  },

  /** 模式一重算 */
  recalcTotal() {
    const t = zfg.calcTotal({
      member: this.data.member,
      people: this.data.people,
      potNormal: this.data.potNormal,
      potClear: this.data.potClear,
      plates: this.data.plates,
      drinks: this.data.drinks,
    });
    this.setData({ total: t });
  },

  onResetTotal() {
    this.setData(
      {
        people: 2,
        potNormal: 2,
        potClear: 0,
        plates: blankPlates(),
        drinks: [blankDrink()],
      },
      () => {
        this.recalcTotal();
        this.persist();
      },
    );
  },

  /* ---------------- 模式二：预算反推 ---------------- */

  onTarget(e) {
    this.setData({ target: e.detail.value });
  },

  onTolerance(e) {
    this.setData({ tolerance: zfg.toInt(e.detail.value) });
  },

  onPrefer(e) {
    const list = this.data.preferOptions;
    this.setData({ prefer: list[Number(e.detail.value)].key });
  },

  onSuggest() {
    const r = zfg.suggestCombo(
      {
        member: this.data.member,
        target: this.data.target,
        people: this.data.people,
        potNormal: this.data.potNormal,
        potClear: this.data.potClear,
        tolerance: this.data.tolerance,
        prefer: this.data.prefer,
      },
      3,
    );
    if (!r.ok) {
      wx.showToast({ title: r.reason, icon: 'none', duration: 2600 });
      this.setData({ suggest: null });
      return;
    }
    this.setData({ suggest: r });
  },

  /** 把某条推荐组合填回模式一的输入，方便微调 */
  onUseCombo(e) {
    const i = Number(e.currentTarget.dataset.i);
    const row = this.data.suggest && this.data.suggest.rows[i];
    if (!row) return;
    this.setData(
      {
        plates: { lv: row.lv, hu: row.hu, ho: row.ho, ti: row.ti },
        mode: 'total',
      },
      () => {
        this.recalcTotal();
        this.persist();
        wx.showToast({ title: '已填入盘子数量', icon: 'success' });
      },
    );
  },
});
