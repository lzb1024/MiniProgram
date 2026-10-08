// 数 1-home.html 片段里的关键内容出现次数，与已知期望对账
const fs = require('fs');
const html = fs.readFileSync('D:/LZB/LIN/preview/_screens/1-home.html', 'utf8');
function count(re) {
  return (html.match(re) || []).length;
}
const rows = [
  ['day 卡', /class="day"/g],
  ['dwx 天气条', /class="dwx"/g],
  ['is-live 预报项', /dwx__item is-live/g],
  ['dwx__item 总数', /dwx__item/g],
  ['时间线 tl__item', /tl__item/g],
  ['要点 tip', /class="tip"/g],
  ['路线 stop', /class="stop"/g],
  ['倒计时 cd__item', /cd__item/g],
  ['预约 step', /class="step"/g],
  ['分类 ccat', /class="ccat/g],
  ['页脚 foot__p', /foot__p/g],
  ['住宿地图 day__geo', /day__geo/g],
  ['总览 ovcard__stay', /ovcard__stay/g],
  ['实时天气条 live', /class="live"/g],
];
rows.forEach(([name, re]) => console.log(`${name}: ${count(re)}`));
console.log(`bytes: ${Buffer.byteLength(html)}`);
