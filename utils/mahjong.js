// 麻将记分核心算法。
//
// 模型：一局开始前每人持有相同数量的手牌（筹码），每张手牌有一个固定价值。
// 打完一局后统计每人手上还剩多少张，与初始张数比较：
//   张数差 = 现有 - 初始（正数=赢了多少张，负数=输了多少张）
//   分值差 = 张数差 × 单张价值
// 四人分值差求和必须为 0（张数守恒），不为 0 说明有人数错了。
//
// 结算（最少支付次数）：
//   把赢家按赢的多少降序、输家按输的多少降序，用双指针两两对冲，
//   每对冲一次就产生一笔支付，直至两边都被抹平。
//   总张数守恒时，这个贪心必然收敛，且支付笔数最少。

/** 顺序固定为 A B C D，对应 index 0 1 2 3 */
const LABELS = ['A', 'B', 'C', 'D'];

/**
 * 数字清洗：去空格、去逗号、全角转半角，空串返回 null（表示「没填」）。
 * @returns {number|null}
 */
function toNum(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  // 全角数字与句点转半角，避免中文输入法下输入的数字解析失败
  s = s.replace(/[０-９．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 保留两位小数，去掉浮点尾巴（0.30000000000000004 → 0.3） */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * 计算结算结果。
 *
 * @param {Object} input
 * @param {number} input.startCards 每人初始手牌张数
 * @param {number} input.cardValue  单张手牌价值（元）
 * @param {Array<{name:string,current:number}>} input.players 四人现有手牌
 * @returns {Object} 结算明细
 */
function settle(input) {
  const startCards = toNum(input && input.startCards) || 0;
  const cardValue = toNum(input && input.cardValue) || 0;
  const players = (input && input.players) || [];

  const totalStart = startCards * players.length;
  const rows = players.map((p, i) => {
    const current = toNum(p && p.current);
    const known = current !== null;
    const diffCards = known ? current - startCards : 0;
    return {
      label: LABELS[i] || String(i + 1),
      name: (p && p.name) || LABELS[i] || `玩家${i + 1}`,
      current: known ? current : 0,
      known,
      diffCards,
      // 张数为正=赢（红），为负=输（绿）
      diffMoney: round2(diffCards * cardValue),
      diffMoneyAbs: round2(Math.abs(diffCards * cardValue)),
      state: diffCards > 0 ? 'win' : diffCards < 0 ? 'lose' : 'even',
    };
  });

  const actualTotal = rows.reduce((s, r) => s + (r.known ? r.current : 0), 0);
  const totalDiff = actualTotal - totalStart;

  // 赢家降序、输家降序，双指针两两对冲
  const winners = rows
    .filter((r) => r.diffCards > 0)
    .map((r) => ({ label: r.label, name: r.name, left: r.diffCards }))
    .sort((a, b) => b.left - a.left);
  const losers = rows
    .filter((r) => r.diffCards < 0)
    .map((r) => ({ label: r.label, name: r.name, left: -r.diffCards }))
    .sort((a, b) => b.left - a.left);

  const transfers = [];
  let wi = 0;
  let li = 0;
  let guard = 0;
  while (wi < winners.length && li < losers.length && guard < 64) {
    guard += 1;
    const w = winners[wi];
    const l = losers[li];
    const cards = Math.min(w.left, l.left);
    if (cards > 0) {
      transfers.push({
        key: `${l.label}-${w.label}-${transfers.length}`,
        fromLabel: l.label,
        fromName: l.name,
        toLabel: w.label,
        toName: w.name,
        cards,
        money: round2(cards * cardValue),
      });
    }
    w.left -= cards;
    l.left -= cards;
    if (w.left <= 1e-9) wi += 1;
    if (l.left <= 1e-9) li += 1;
  }

  return {
    startCards,
    cardValue,
    rows,
    totalStart,
    actualTotal,
    totalDiff,
    balanced: totalDiff === 0,
    transfers,
    totalMoney: round2(transfers.reduce((s, t) => s + t.money, 0)),
  };
}

module.exports = { LABELS, toNum, round2, settle };
