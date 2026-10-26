const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const S = require(path.join(ROOT, 'utils', 'weight-seed'));
const m = S.users.me;
const show = (from, to) => {
  console.log(`\n${from} ~ ${to}`);
  m.filter((r) => r.date >= from && r.date <= to).forEach((r) => {
    console.log('  ' + r.date + '  ' + r.weight + ' 斤  ' + r.bodyFat + '%');
  });
};
show('2026-08-17', '2026-08-31');
show('2026-10-12', '2026-10-23');

const gaps = [];
for (let i = 1; i < m.length; i++) {
  const a = Date.parse(m[i - 1].date);
  const b = Date.parse(m[i].date);
  const d = Math.round((b - a) / 86400000);
  if (d > 1) gaps.push(m[i - 1].date + ' → ' + m[i].date + ' 空 ' + (d - 1) + ' 天');
}
console.log('\n缺口 ' + gaps.length + ' 处:');
gaps.forEach((g) => console.log('  ' + g));
