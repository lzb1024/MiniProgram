// pages/mahjong/index.js — 麻将记分（常用工具 · 生活便利）
//
// 玩法流程（三段式，同一页竖排，靠 phase 字段切换显示哪一段）：
//   ① setup    新开一局：初始手牌张数 + 单张价值 + 四人名称
//   ② playing  对局中：展示初始参数，点「本局结束，填写手牌」进结算
//   ③ played   结算：填每人现有张数 → 立即出「盈亏 + 支付方案 + 总数校验」
//
// 算法全在 utils/mahjong.js（纯函数，可离线单测），本页只管交互与展示。
//
// 本页是普通页（非 tabBar 页），从 pages/tools 用 navigateTo 进来，返回用 navigateBack。

const mahjong = require('../../utils/mahjong');

const STORE_KEY = 'mahjong_setup';

/** 默认 4 人，名称留空时结算阶段兜底显示 A/B/C/D */
function blankPlayers(prev) {
  const base = (prev && prev.length === 4 ? prev : []).map((p) => ({ name: (p && p.name) || '' }));
  return mahjong.LABELS.map((_, i) => ({ ...(base[i] || { name: '' }), current: '' }));
}

/** 版本号，便于日后改结构时丢弃老缓存 */
const STORE_VER = 1;

Page({
  data: {
    phase: 'setup', // setup | playing | played
    statusTop: 0,

    // ① 开局参数
    startCards: '',
    cardValue: '',
    players: blankPlayers(),

    // ③ 结算结果
    result: null,
    ready: false, // 四人现有张数是否都填了
  },

  onLoad() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusTop: (win && win.statusBarHeight) || 0 });
    this.restore();
  },

  /** 读取本机缓存的上一局，恢复了就直接进对局中 */
  restore() {
    let saved = null;
    try {
      saved = wx.getStorageSync(STORE_KEY);
    } catch (e) {
      saved = null;
    }
    if (!saved || saved.ver !== STORE_VER) return;
    this.setData({
      phase: saved.phase === 'playing' ? 'playing' : 'setup',
      startCards: saved.startCards || '',
      cardValue: saved.cardValue || '',
      players: blankPlayers(saved.players),
    });
  },

  /** 只持久化「开局参数」，在场状态不落盘（重进就应该重新结算） */
  persist(phase) {
    const { startCards, cardValue, players } = this.data;
    try {
      wx.setStorageSync(STORE_KEY, {
        ver: STORE_VER,
        phase: phase || 'playing',
        startCards,
        cardValue,
        players: players.map((p) => ({ name: p.name || '' })),
      });
    } catch (e) {
      // 缓存失败不影响使用，静默
    }
  },

  /* ---------------- 输入 ---------------- */

  /** 自定义返回条（navigationStyle: custom，没有系统返回键） */
  onBackNav() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/tools/index' }),
    });
  },

  onStartCards(e) {
    this.setData({ startCards: e.detail.value });
  },

  onCardValue(e) {
    this.setData({ cardValue: e.detail.value });
  },

  onName(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ [`players[${i}].name`]: e.detail.value });
  },

  onCurrent(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ [`players[${i}].current`]: e.detail.value });
    this.recalc();
  },

  /* ---------------- 流程 ---------------- */

  /** 开局：校验两个必填数字，通过后进对局中并落盘 */
  onBegin() {
    const startCards = mahjong.toNum(this.data.startCards);
    const cardValue = mahjong.toNum(this.data.cardValue);
    if (startCards === null || startCards <= 0) {
      wx.showToast({ title: '初始手牌数量要大于 0', icon: 'none' });
      return;
    }
    if (cardValue === null || cardValue <= 0) {
      wx.showToast({ title: '单张手牌价值要大于 0', icon: 'none' });
      return;
    }
    this.setData(
      {
        phase: 'playing',
        startCards: String(startCards),
        cardValue: String(cardValue),
        players: this.data.players.map((p) => ({ name: (p.name || '').trim(), current: '' })),
        result: null,
        ready: false,
      },
      () => this.persist('playing'),
    );
  },

  /** 本局结束，进结算 */
  onFinish() {
    this.setData({ phase: 'played' });
  },

  /** 重填上局参数 */
  onBackSetup() {
    this.setData({ phase: 'setup' });
    try {
      wx.removeStorageSync(STORE_KEY);
    } catch (e) {
      // 忽略
    }
  },

  /** 结算页返回对局中（比如写错了想改参数） */
  onBackPlaying() {
    this.setData({ phase: 'playing' });
  },

  /** 清空四人现有张数，再来一局 */
  onReset() {
    this.setData({ players: this.data.players.map((p) => ({ ...p, current: '' })), result: null, ready: false });
  },

  /** 输入现有张数后实时重算 */
  recalc() {
    const players = this.data.players;
    const ready = players.every((p) => mahjong.toNum(p.current) !== null);
    if (!ready) {
      this.setData({ ready: false, result: null });
      return;
    }
    const result = mahjong.settle({
      startCards: this.data.startCards,
      cardValue: this.data.cardValue,
      players,
    });
    this.setData({ ready: true, result });
  },

  /** 复制支付方案为纯文本，方便发群里 */
  onCopy() {
    const r = this.data.result;
    if (!r) return;
    const lines = r.transfers.map((t) => `${t.fromName} 付给 ${t.toName} ${t.money} 元（${t.cards} 张）`);
    if (!lines.length) lines.push('本局四人平手，无需支付');
    const text = [
      `初始每人 ${r.startCards} 张，单张 ${r.cardValue} 元`,
      ...r.rows.map((x) => `${x.name}：${x.diffCards > 0 ? '赢' : x.diffCards < 0 ? '输' : '平'} ${Math.abs(x.diffMoney)} 元（${x.diffCards > 0 ? '+' : ''}${x.diffCards} 张）`),
      '——',
      ...lines,
    ].join('\n');
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    });
  },
});
