// 一次性：看内建数据按月分布，挑一个有数据的月份做预览
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const W = require(path.join(ROOT, 'utils/weight'));
const seed = W.normalize(require(path.join(ROOT, 'utils/weight-seed')));

const count = (list) => {
  const m = {};
  list.forEach((r) => {
    const t = W.ymd(r.date);
    const k = t.y + '-' + t.m;
    m[k] = (m[k] || 0) + 1;
  });
  return m;
};
console.log('me', JSON.stringify(count(seed.me)));
console.log('ta', JSON.stringify(count(seed.ta)));
