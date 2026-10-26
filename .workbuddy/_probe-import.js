const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const lines = fs.readFileSync(path.join(ROOT, 'weight-import.json'), 'utf8').trim().split('\n');
console.log('JSONL 行数', lines.length);
const docs = lines.map((l) => JSON.parse(l));
docs.forEach((d) => {
  const r = d.records;
  const asc = r.every((x, i) => i === 0 || r[i - 1].date < x.date);
  const fatOk = r.every((x) => x.bodyFat === null || (x.bodyFat > 0 && x.bodyFat <= 75));
  const wOk = r.every((x) => typeof x.weight === 'number' && x.weight >= 60 && x.weight <= 400);
  console.log(
    '%-11s %3d 条  %s ~ %s  日期升序=%s 体重合法=%s 体脂合法=%s',
    d._id, r.length, r[0].date, r[r.length - 1].date, asc, wOk, fatOk
  );
});

const clip = JSON.parse(fs.readFileSync(path.join(ROOT, 'weight-import-clipboard.json'), 'utf8'));
console.log('剪贴板文件  me=%d  ta=%d  version=%s  currentUser=%s',
  clip.users.me.length, clip.users.ta.length, clip.version, clip.currentUser);

const all = clip.users.me.concat(clip.users.ta).map((r) => r.id);
console.log('全局 id 唯一 =', new Set(all).size === all.length);

const m = clip.users.me;
const aug = m.filter((r) => r.date >= '2026-08-01' && r.date < '2026-09-01');
console.log('8 月 me 条数', aug.length, '末三条', aug.slice(-3).map((r) => r.date + ' ' + r.weight + '斤').join(' / '));
