// 朱富贵计算算法自测（离线，纯 Node）
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const z = require('E:/3_WorkSpace/MiniProgram/utils/zhufugui.js');

let pass = 0;
let fail = 0;
function it(name, fn) {
  try {
    fn();
    pass++;
    console.log('OK   ' + name);
  } catch (e) {
    fail++;
    console.log('FAIL ' + name + '\n     ' + e.message);
  }
}

it('价格表：原价 / 6.8 折会员价', () => {
  assert.deepStrictEqual(z.priceTable(false), [5, 10, 15, 22]);
  assert.deepStrictEqual(z.priceTable(true), [3.4, 6.8, 10.2, 14.96]);
  assert.strictEqual(z.MEMBER_RATE, 0.68);
});

it('输入清洗：全角 / 非数字 / 负数', () => {
  assert.strictEqual(z.toNum('１２'), 12);
  assert.strictEqual(z.toNum(''), null);
  assert.strictEqual(z.toNum('abc'), null);
  assert.strictEqual(z.toInt('-3'), 0);
  assert.strictEqual(z.toInt('2.7'), 2);
});

it('模式一：原价 2 人 + 2 个锅底 + 各色盘', () => {
  const r = z.calcTotal({
    member: false,
    people: 2,
    potNormal: 2,
    plates: { lv: 3, hu: 2, ho: 1, ti: 1 },
  });
  // 菜金 = 3*5 + 2*10 + 1*15 + 1*22 = 15+20+15+22 = 72
  // 锅底 = 24，调料 = 8
  assert.strictEqual(r.dishRaw, 72);
  assert.strictEqual(r.dishPay, 72);
  assert.strictEqual(r.saved, 0);
  assert.strictEqual(r.potSum, 24);
  assert.strictEqual(r.sauceSum, 8);
  assert.strictEqual(r.total, 104);
  assert.strictEqual(r.perPerson, 52);
});

it('模式一：会员价只打菜金，锅底调料饮料不打折', () => {
  const r = z.calcTotal({
    member: true,
    people: 2,
    potNormal: 2,
    plates: { lv: 3, hu: 2, ho: 1, ti: 1 },
    drinks: [{ name: '可乐/雪碧/芬达', price: 5, qty: 2 }],
  });
  // 菜金折后 = 3*3.4 + 2*6.8 + 1*10.2 + 1*14.96 = 10.2+13.6+10.2+14.96 = 48.96
  assert.strictEqual(r.dishPay, 48.96);
  assert.strictEqual(r.dishRaw, 72);
  assert.strictEqual(r.saved, 23.04); // 72 - 48.96
  assert.strictEqual(r.drinkSum, 10);
  assert.strictEqual(r.potSum, 24);
  assert.strictEqual(r.sauceSum, 8);
  // 48.96 + 24 + 8 + 10 = 90.96
  assert.strictEqual(r.total, 90.96);
  assert.strictEqual(r.perPerson, 45.48);
});

it('模式一：清汤锅底 6 元、空输入不崩', () => {
  const r = z.calcTotal({ member: true, people: 1, potNormal: 1, potClear: 1, plates: {} });
  assert.strictEqual(r.potSum, 18); // 普通 12 + 清汤 6
  assert.strictEqual(r.sauceSum, 4); // 1 人 × 4
  assert.strictEqual(r.total, 22); // 18 + 4
  assert.strictEqual(r.empty, false);

  const e = z.calcTotal({ member: true, people: 0, plates: {} });
  assert.strictEqual(e.total, 0);
  assert.strictEqual(e.empty, true);
  assert.strictEqual(e.perPerson, 0);
});

it('模式一：饮料只统计数量>0 的项，小计正确', () => {
  const r = z.calcTotal({
    member: false,
    people: 0,
    plates: {},
    drinks: [
      { name: '大椰汁', price: 20, qty: 1 },
      { name: '王老吉', price: 6, qty: 0 }, // 数量 0 应被过滤
      { name: '百威', price: 8, qty: 3 },
    ],
  });
  assert.strictEqual(r.drinkLines.length, 2);
  assert.strictEqual(r.drinkSum, 44); // 20 + 24
  assert.strictEqual(r.total, 44);
});

it('模式二：预算反推能兑现目标（原价）', () => {
  const r = z.suggestCombo({ member: false, target: 300, people: 4, potNormal: 4 });
  assert.strictEqual(r.ok, true);
  assert.ok(r.rows.length > 0, '应有候选');
  // 固定费用 = 4*12 + 4*4 = 64
  assert.strictEqual(r.fixed, 64);
  assert.strictEqual(r.dishBudget, 236);
  // 最靠近目标的那条，实付与目标差应在容差内
  const best = r.rows[0];
  assert.ok(Math.abs(best.total - 300) <= 20, `最近组合实付 ${best.total} 偏离目标超过 20`);
});

it('模式二：每条候选的账目自洽（总额 = 固定 + 菜金）', () => {
  const r = z.suggestCombo({ member: true, target: 400, people: 3, potNormal: 3 });
  assert.strictEqual(r.ok, true);
  for (const row of r.rows) {
    const dish = row.lv * 3.4 + row.hu * 6.8 + row.ho * 10.2 + row.ti * 14.96;
    assert.ok(Math.abs(row.sum - dish) < 0.01, `${row.lv}/${row.hu}/${row.ho}/${row.ti} 菜金不符`);
    assert.ok(Math.abs(row.total - (r.fixed + dish)) < 0.01, '总额不符');
    // 每色至少 1 盘
    assert.ok(row.lv >= 1 && row.hu >= 1 && row.ho >= 1 && row.ti >= 1, '每色应至少 1 盘');
    // 最贵色 ≤ 最便宜色 × 3
    const mx = Math.max(row.lv, row.hu, row.ho, row.ti);
    const mn = Math.min(row.lv, row.hu, row.ho, row.ti);
    assert.ok(mx <= mn * 3, `${mx} 超过 ${mn}×3`);
  }
});

it('模式二：偏好「铁盘多」确实铁盘最多', () => {
  const r = z.suggestCombo({ member: true, target: 500, people: 4, potNormal: 4, prefer: 'ti' });
  assert.strictEqual(r.ok, true);
  const top = r.rows[0];
  assert.ok(
    top.ti >= top.lv && top.ti >= top.hu && top.ti >= top.ho,
    `铁盘 ${top.ti} 未多于 ${top.lv}/${top.hu}/${top.ho}`,
  );
});

it('模式二：目标过低 / 为 0 → 明确拒绝并给原因', () => {
  const a = z.suggestCombo({ member: true, target: 0, people: 2, potNormal: 2 });
  assert.strictEqual(a.ok, false);
  assert.match(a.reason, /目标金额/);

  const b = z.suggestCombo({ member: true, target: 20, people: 2, potNormal: 2 });
  assert.strictEqual(b.ok, false);
  assert.match(b.reason, /偏低/);
});

it('模式二：容差可调，收窄后候选变少或仍精确', () => {
  const wide = z.suggestCombo({ member: false, target: 300, people: 4, potNormal: 4, tolerance: 30 }, 50);
  const narrow = z.suggestCombo({ member: false, target: 300, people: 4, potNormal: 4, tolerance: 5 }, 50);
  assert.ok(wide.ok && narrow.ok);
  assert.ok(
    wide.rows.length >= narrow.rows.length,
    `容差 30 的候选(${wide.rows.length}) 应不少于容差 5 的(${narrow.rows.length})`,
  );
  for (const row of narrow.rows) {
    assert.ok(Math.abs(row.total - 300) <= 5, `容差 5 下出现了偏离 ${Math.abs(row.total - 300)} 的组合`);
  }
});

it('模式二：人数影响上限（不给人数时仍能算）', () => {
  const r = z.suggestCombo({ member: true, target: 200, people: 0, potNormal: 0 }, 2);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.fixed, 0);
  assert.ok(r.rows.length > 0);
});

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
