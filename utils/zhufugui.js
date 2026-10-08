// 朱富贵火锅（海鲜集市火锅）消费计算的纯算法。
//
// 计价模型（按店里的「色盘定价法」，价格已于 2026-10 上网核实）：
//   菜金按餐盘颜色计价，**只有菜金参与会员折扣**，锅底 / 调料 / 饮料酒水都不打折。
//   原价：绿 5   黄 10  红 15  铁 22
//   会员 6.8 折：绿 3.4  黄 6.8  红 10.2  铁 14.96（绿 3.4 = 5×0.68，其余同理）
//   锅底 12 元/份（清汤锅底 6 元/份，选填）；调料 4 元/人；饮料按价目表。
//
// 两个模式：
//   ① 算总价：给「人数 + 锅底数 + 各色盘子数 + 饮料」→ 出总价与人均。
//   ② 预算反推：给「目标实付金额」→ 反推各色盘各拿几盘（受上限与搭配偏好约束）。

/** 餐盘颜色，顺序固定：绿 → 黄 → 红 → 铁 */
const COLORS = [
  { key: 'lv', name: '绿盘', tone: 'lv', base: 5, note: '青菜' },
  { key: 'hu', name: '黄盘', tone: 'hu', base: 10, note: '肉类' },
  { key: 'ho', name: '红盘', tone: 'ho', base: 15, note: '肉类' },
  { key: 'ti', name: '铁盘', tone: 'ti', base: 22, note: '海鲜' },
];

/** 会员折扣（朱富贵扫码入群享 6.8 折） */
const MEMBER_RATE = 0.68;

/** 固定费用单价 */
const PRICE = {
  potNormal: 12, // 普通锅底（元/份）
  potClear: 6, // 清汤锅底（元/份，选填）
  sauce: 4, // 调料纸巾（元/人）
};

/** 饮料酒水价目表（不打折） */
const DRINKS = [
  { name: '玻璃瓶', price: 2 },
  { name: '可乐/雪碧/芬达', price: 5 },
  { name: '双柚汁', price: 6 },
  { name: '王老吉', price: 6 },
  { name: '健力宝', price: 6 },
  { name: '番石榴', price: 6 },
  { name: '维他茶', price: 6 },
  { name: '破独', price: 6 },
  { name: '豆奶', price: 7 },
  { name: '椰子水', price: 7 },
  { name: '乌龙茶', price: 7 },
  { name: '好望水', price: 7 },
  { name: '小椰汁', price: 7 },
  { name: '百威', price: 8 },
  { name: '宋柚汁', price: 8 },
  { name: '贝奇野菜', price: 8 },
  { name: '鲜果蜂蜜水', price: 8 },
  { name: '朝日', price: 10 },
  { name: '喜力', price: 10 },
  { name: '科罗娜', price: 10 },
  { name: '福佳白', price: 10 },
  { name: '蓝妹', price: 10 },
  { name: '大椰汁', price: 20 },
];

/** 数字清洗：全角转半角、去逗号；空串 → null */
function toNum(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[０-９．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 非负整数（用于人数 / 份数 / 盘数） */
function toInt(v) {
  const n = toNum(v);
  if (n === null) return 0;
  return Math.max(0, Math.floor(n));
}

/** 保留两位小数，抹掉浮点尾巴 */
function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * 某色盘在指定口径下的单价。
 * @param {Object} color COLORS 里的一项
 * @param {boolean} member 是否会员价
 */
function unitPrice(color, member) {
  return member ? r2(color.base * MEMBER_RATE) : color.base;
}

/**
 * 模式一：算总价。
 * @param {Object} input { member, people, potNormal, potClear, plates:{lv,hu,ho,ti}, drinks:[{name,price,qty}] }
 */
function calcTotal(input) {
  const member = !!input.member;
  const people = toInt(input.people);
  const potNormal = toInt(input.potNormal);
  const potClear = toInt(input.potClear);

  // 菜金明细
  const items = COLORS.map((c) => {
    const qty = toInt(input.plates && input.plates[c.key]);
    const unit = unitPrice(c, member);
    return { ...c, qty, unit, sum: r2(qty * unit) };
  }).filter((x) => x.qty > 0);

  const dishRaw = COLORS.reduce((s, c) => {
    const qty = toInt(input.plates && input.plates[c.key]);
    return s + qty * c.base;
  }, 0);
  const dishPay = r2(items.reduce((s, x) => s + x.sum, 0));
  const saved = r2(dishRaw - dishPay);

  // 固定费用（不打折）
  const potSum = r2(potNormal * PRICE.potNormal + potClear * PRICE.potClear);
  const sauceSum = r2(people * PRICE.sauce);

  // 饮料
  const drinkLines = (input.drinks || [])
    .map((d) => {
      const qty = toInt(d.qty);
      const price = toNum(d.price) || 0;
      return { name: d.name, price, qty, sum: r2(qty * price) };
    })
    .filter((d) => d.qty > 0);
  const drinkSum = r2(drinkLines.reduce((s, d) => s + d.sum, 0));

  const total = r2(dishPay + potSum + sauceSum + drinkSum);

  return {
    member,
    people,
    items,
    dishRaw: r2(dishRaw),
    dishPay,
    saved,
    potNormal,
    potClear,
    potSum,
    sauceSum,
    drinkLines,
    drinkSum,
    total,
    perPerson: people > 0 ? r2(total / people) : 0,
    empty: !items.length && !drinkLines.length && !potNormal && !potClear,
  };
}

/** 预览模式二用的各色价格（与 unitPrice 同源，避免两处硬编码） */
function priceTable(member) {
  return COLORS.map((c) => unitPrice(c, member));
}

/**
 * 模式二：预算反推。
 *
 * 在「每色至少 1 盘、最多 maxEach 盘、最多与最少之比不超过 3 倍」的约束下，
 * 枚举各色盘数，挑出菜金最接近 (目标实付 − 固定费用) 的组合。
 * 允许 ±tol 元的容差（店里一顿饭的金额，差个十几二十块都算"够吃"）。
 *
 * @param {Object} input { member, target, people, potNormal, potClear, tolerance, prefer }
 * @param {number} limit 返回几条候选
 */
function suggestCombo(input, limit = 3) {
  const member = !!input.member;
  const target = toNum(input.target) || 0;
  const people = toInt(input.people);
  const potNormal = toInt(input.potNormal);
  const potClear = toInt(input.potClear);
  const tol = toNum(input.tolerance);
  const tolerance = tol === null ? 20 : Math.max(0, tol);
  const prefer = input.prefer || 'none';

  const fixed = r2(potNormal * PRICE.potNormal + potClear * PRICE.potClear + people * PRICE.sauce);
  const dishBudget = r2(target - fixed);

  if (target <= 0) return { ok: false, reason: '请填写目标金额', fixed, dishBudget, rows: [] };
  if (dishBudget <= 0) {
    return { ok: false, reason: '目标金额偏低，扣掉锅底和调料就没剩了，请提高目标', fixed, dishBudget, rows: [] };
  }

  const prices = priceTable(member);
  // 单色上限：人数 × 6 封顶 60（控制枚举规模，也贴合实际一桌的量）
  const maxEach = Math.min(60, Math.max(8, people * 6));

  // 搭配偏好：某一色放宽上限，且必须严格多于其余三色
  const strictOf = {
    lv: (n) => n.lv > n.hu && n.lv > n.ho && n.lv > n.ti,
    hu: (n) => n.hu > n.lv && n.hu > n.ho && n.hu > n.ti,
    ho: (n) => n.ho > n.lv && n.ho > n.hu && n.ho > n.ti,
    ti: (n) => n.ti > n.lv && n.ti > n.hu && n.ti > n.ho,
  };

  const cands = [];
  let feasibleMin = Infinity;
  let feasibleMax = -Infinity;

  for (let lv = 1; lv <= maxEach; lv++) {
    const sLv = lv * prices[0];
    if (sLv > dishBudget + tolerance) break;
    for (let hu = 1; hu <= maxEach; hu++) {
      const sHu = sLv + hu * prices[1];
      if (sHu > dishBudget + tolerance) break;
      for (let ho = 1; ho <= maxEach; ho++) {
        const sHo = sHu + ho * prices[2];
        if (sHo > dishBudget + tolerance) break;
        for (let ti = 1; ti <= maxEach; ti++) {
          const sum = r2(sHo + ti * prices[3]);
          if (sum > dishBudget + tolerance) break;
          if (sum < feasibleMin) feasibleMin = sum;
          if (sum > feasibleMax) feasibleMax = sum;

          const cnt = { lv, hu, ho, ti };
          const maxCnt = Math.max(lv, hu, ho, ti);
          const minCnt = Math.min(lv, hu, ho, ti);
          // 最贵色不超过最便宜色的 3 倍，避免"全是铁盘一根青菜没有"这类极端搭配
          if (maxCnt > minCnt * 3) continue;

          const diff = r2(Math.abs(sum - dishBudget));
          if (diff > tolerance) continue;

          cands.push({
            ...cnt,
            sum,
            total: r2(fixed + sum),
            diff,
            totalDiff: r2(Math.abs(r2(fixed + sum) - target)),
            byColor: COLORS.map((c, i) => ({ key: c.key, name: c.name, tone: c.tone, qty: [lv, hu, ho, ti][i], unit: prices[i] })),
            totalPlates: lv + hu + ho + ti,
            strict: true,
          });
        }
      }
    }
  }

  if (!cands.length) {
    const hint =
      feasibleMax === -Infinity
        ? '这个预算连最少的搭配都买不到，请提高目标'
        : `凑不出范围内组合（该预算下可选总额约 ${r2(feasibleMin + fixed)} - ${r2(feasibleMax + fixed)} 元），可放宽容差或调整目标`;
    return { ok: false, reason: hint, fixed, dishBudget, rows: [], tolerance };
  }

  cands.sort((a, b) => a.diff - b.diff || a.sum - b.sum);

  // 偏好筛选：有严格满足的组合就优先用它，否则退回全部候选并标记
  let strictDropped = false;
  let pool = cands;
  if (prefer !== 'none' && strictOf[prefer]) {
    const strict = cands.filter((c) => {
      const n = { lv: c.lv, hu: c.hu, ho: c.ho, ti: c.ti };
      return strictOf[prefer](n);
    });
    if (strict.length) pool = strict;
    else strictDropped = true;
  }

  // 去重（同组合只留一条）后取前 limit 条
  const seen = new Set();
  const rows = [];
  for (const c of pool) {
    const k = `${c.lv},${c.hu},${c.ho},${c.ti}`;
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push(c);
    if (rows.length >= limit) break;
  }

  return { ok: true, fixed, dishBudget, tolerance, rows, strictDropped, prefer };
}

module.exports = {
  COLORS,
  MEMBER_RATE,
  PRICE,
  DRINKS,
  toNum,
  toInt,
  r2,
  unitPrice,
  priceTable,
  calcTotal,
  suggestCombo,
};
