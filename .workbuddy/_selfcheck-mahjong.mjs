// 麻将记分算法自测（离线，纯 Node）
// 用绝对路径直接跑：<node> .workbuddy/_selfcheck-mahjong.mjs
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mj = require('E:/3_WorkSpace/MiniProgram/utils/mahjong.js');

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

const P = (name, current) => ({ name, current });

it('输入清洗：全角 / 逗号 / 空值', () => {
  assert.strictEqual(mj.toNum('１３'), 13);
  assert.strictEqual(mj.toNum('1,200'), 1200);
  assert.strictEqual(mj.toNum('  7 '), 7);
  assert.strictEqual(mj.toNum(''), null);
  assert.strictEqual(mj.toNum('abc'), null);
  assert.strictEqual(mj.toNum(null), null);
});

it('基础结算：A 赢 3 张，B 平，C 输 1，D 输 2（张数守恒）', () => {
  const r = mj.settle({
    startCards: 13,
    cardValue: 5,
    players: [P('甲', 16), P('乙', 13), P('丙', 12), P('丁', 11)],
  });
  assert.strictEqual(r.balanced, true);
  assert.strictEqual(r.totalStart, 52);
  assert.strictEqual(r.actualTotal, 52);
  assert.strictEqual(r.rows[0].diffCards, 3);
  assert.strictEqual(r.rows[0].diffMoney, 15);
  assert.strictEqual(r.rows[0].state, 'win');
  assert.strictEqual(r.rows[1].state, 'even');
  assert.strictEqual(r.rows[2].state, 'lose');
  assert.strictEqual(r.rows[3].diffMoney, -10);
  // 全部支付都指向唯一的赢家 A
  assert.strictEqual(r.transfers.length, 2);
  const toA = r.transfers.filter((t) => t.toName === '甲');
  assert.strictEqual(toA.length, 2);
  const paid = toA.reduce((s, t) => s + t.money, 0);
  assert.strictEqual(paid, 15);
  assert.strictEqual(r.totalMoney, 15);
});

it('张数不守恒 → balanced=false，差值正确', () => {
  const r = mj.settle({
    startCards: 10,
    cardValue: 2,
    players: [P('A', 12), P('B', 10), P('C', 9), P('D', 9)],
  });
  // 合计 40，应为 40？实际 12+10+9+9 = 40 → 守恒，改用漏 1 张的
  const r2 = mj.settle({
    startCards: 10,
    cardValue: 2,
    players: [P('A', 12), P('B', 10), P('C', 9), P('D', 8)],
  });
  assert.strictEqual(r.balanced, true);
  assert.strictEqual(r2.balanced, false);
  assert.strictEqual(r2.totalDiff, -1);
  assert.strictEqual(r2.actualTotal, 39);
  assert.strictEqual(r2.totalStart, 40);
});

it('多人赢：支付笔数最少且金额守恒', () => {
  const r = mj.settle({
    startCards: 13,
    cardValue: 1,
    players: [P('甲', 20), P('乙', 18), P('丙', 8), P('丁', 6)],
  });
  assert.strictEqual(r.balanced, true);
  // 赢家 甲7 乙5；输家 丙5 丁7 —— 最多 3 笔（2 赢 2 输，最少 = 2+2-1 = 3）
  assert.ok(r.transfers.length <= 3, `支付笔数 ${r.transfers.length} 应 <= 3`);
  const inSum = r.transfers.reduce((s, t) => s + t.money, 0);
  const winSum = r.rows.filter((x) => x.diffCards > 0).reduce((s, x) => s + x.diffMoney, 0);
  assert.strictEqual(inSum, winSum);
  // 每个人的净收支必须与 diffMoney 一致
  for (const row of r.rows) {
    const got = r.transfers.filter((t) => t.toName === row.name).reduce((s, t) => s + t.money, 0);
    const gave = r.transfers.filter((t) => t.fromName === row.name).reduce((s, t) => s + t.money, 0);
    assert.strictEqual(got - gave, row.diffMoney, `${row.name} 净收支不符`);
  }
});

it('全平：无支付', () => {
  const r = mj.settle({
    startCards: 13,
    cardValue: 3,
    players: [P('甲', 13), P('乙', 13), P('丙', 13), P('丁', 13)],
  });
  assert.strictEqual(r.balanced, true);
  assert.strictEqual(r.transfers.length, 0);
  assert.strictEqual(r.totalMoney, 0);
});

it('小数牌值：合计无浮点尾巴', () => {
  const r = mj.settle({
    startCards: 10,
    cardValue: 0.1,
    players: [P('甲', 13), P('乙', 10), P('丙', 9), P('丁', 8)],
  });
  assert.strictEqual(r.balanced, true);
  assert.strictEqual(r.rows[0].diffMoney, 0.3);
  assert.strictEqual(r.totalMoney, 0.3);
});

it('未填齐：缺失项按 0 计，不抛异常', () => {
  const r = mj.settle({
    startCards: 13,
    cardValue: 1,
    players: [P('甲', 16), P('乙', ''), P('丙', ''), P('丁', '')],
  });
  assert.strictEqual(r.rows[1].known, false);
  assert.strictEqual(r.rows[1].diffCards, 0);
});

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
