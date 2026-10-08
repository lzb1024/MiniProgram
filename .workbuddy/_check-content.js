const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const MOCK = path.join(ROOT, 'mock/home/getTrip.js');
const src = fs.readFileSync(MOCK, 'utf8').replace(/export\s+default\s+/, 'module.exports = ');
const tmp = path.join(ROOT, '.workbuddy/_trip.check.cjs');
fs.writeFileSync(tmp, src, 'utf8');
let trip;
try {
  delete require.cache[require.resolve(tmp)];
  trip = require(tmp).data.data;
} finally {
  fs.unlinkSync(tmp);
}
const out = [];
const push = (k, v) => out.push(`${k}: ${v}`);

push('hero.titleMain', trip.hero.titleMain);
push('hero.meta', trip.hero.meta.length + ' 枚 -> ' + trip.hero.meta.map((m) => m.icon).join(','));
push('sections', trip.sections.length + ' -> ' + trip.sections.map((s) => s.id).join(','));
push('dayTabs', trip.dayTabs.length + ' -> ' + trip.dayTabs.map((d) => d.text).join(','));
push('days', trip.days.length);
push('days.tag', trip.days.map((d) => d.tag.split(' · ')[0]).join(','));
push('routes', trip.routes.length + ' -> ' + trip.routes.map((r) => r.name).join(','));
push('routes.legend 非空', trip.routes.filter((r) => r.legend && r.legend.length).length + '/3');
push('budget.rows', trip.budget.rows.length + ' + total');
push('budget.total.price', trip.budget.total.price);
push('budget.tips.list', trip.budget.tips.list.length);
push('booking.desc', trip.booking.desc);
push('booking.countdown', trip.booking.countdown.length);
push('packing.preset', trip.packing.preset.length);
push('costs.categories', trip.costs.categories.length + ' -> ' + trip.costs.categories.join(','));
push('costs.shareCount', trip.costs.shareCount);
push('footer', trip.footer.length);

// 一致性自检
trip.days.forEach((d, i) => {
  if (!d.tag) push('ERR day' + i + ' 缺 tag', '');
});
push('timeline 总条数', trip.days.reduce((n, d) => n + d.timeline.length, 0));
push('tips 总条数', trip.days.reduce((n, d) => n + d.tips.length, 0));
push('weather 条数', trip.days.reduce((n, d) => n + d.weather.length, 0));

// 数据里不允许残留 Plan / 新旧版本关键字
const raw = JSON.stringify(trip);
['Plan', 'planSel', '3,880', '9.21', '川西七日'].forEach((k) => {
  push('残留检查 ' + k, raw.includes(k) ? '❌ 命中' : 'OK');
});

const p = path.join(ROOT, '.workbuddy/_content-check.txt');
fs.writeFileSync(p, out.join('\n'), 'utf8');
console.log(out.join('\n'));
