const fs = require('fs');
const h = fs.readFileSync('D:/LZB/LIN/preview/interface-preview.html', 'utf8');
const need = [
  '.toc__day',
  '.toc__scroll--day',
  '.ccats__head',
  '.ccat.is-zero',
  '.foot__p',
  '.gear__note',
  '.dwx__item.is-hot',
  '.hero__title--grad',
  '.fg-sec-title .n',
  '.tl__item.is-commute',
  '.stop.is-hot',
  '.sync.is-local',
  '.gitem.is-done',
  '.clist__btn',
  '.clist__body',
  '.clist__none',
  '.cfilt__chip',
  '.cfilt__chip.is-on',
  '.citem__date',
  '.citem__tag',
  '.ovcard__stay',
  '.route__legend',
  '.cd__count.is-now',
  '.home__bottom',
  '.dwx__label',
  '.gear__add.is-off',
  '.bar2__fill',
  '.tchip.is-on',
  '.tform__box.is-empty',
  '.tform__add',
  '.titem__time',
  '.titem__src',
  '.titem__src.is-go',
  '.titem__go',
  '.tl__src',
  '.tl__src-t',
  '.tl__go',
  '.wstrip__cell',
  '.wstrip__cell.is-today',
  '.wstrip__badge.is-trip',
  '.wstrip__text',
  '.wstrip__temp',
  '.wstrip__wait',
];
console.log('--- 编译后的关键选择器 ---');
let miss = 0;
for (const s of need) {
  const ok = h.includes(s);
  if (!ok) miss++;
  console.log((ok ? 'OK  ' : 'MISS') + '  ' + s);
}
console.log('\n缺失 ' + miss + ' 个');
console.log('手机框数量: ' + (h.split('<page class="page">').length - 1));
console.log('雪碧图 symbol 数: ' + (h.split('<symbol id=').length - 1));
