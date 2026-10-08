// 首页一致性自检：wxml 用到的 class 是否都有样式；wxml 引用的 mock 字段是否存在
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/LZB/LIN';
const wxml = fs.readFileSync(path.join(ROOT, 'pages/home/index.wxml'), 'utf8');
const lessAll = [
  'pages/home/index.less',
  'app.less',
  'variable.less',
  'components/nav/index.less',
]
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n');

/* 1. class 覆盖 */
const classes = new Set();
// class="a b {{ cond ? 'c' : 'd' }}"
const re = /class="([^"]*)"/g;
let m;
while ((m = re.exec(wxml))) {
  const raw = m[1];
  // 取出字面量部分 + 三元里的两个分支
  raw
    .replace(/\{\{[^}]*\}\}/g, (expr) => {
      const inner = expr.replace(/^\{\{|\}\}$/g, '');
      // 收集引号里的字面量。注意 `{{ costFilter === '全部' ? 'is-on' : '' }}` 里
      // 引号也可能是「比较操作数」而不是 class（'全部' 就是），判据是它前面那个
      // 非空白字符是不是比较运算符 —— 是就跳过，否则会误报「无样式的 class」。
      for (const hit of inner.matchAll(/'([^']*)'|"([^"]*)"/g)) {
        let i = hit.index - 1;
        while (i >= 0 && /\s/.test(inner[i])) i--;
        if (i >= 0 && '=!<>'.indexOf(inner[i]) > -1) continue;
        classes.add(hit[0].replace(/['"]/g, ''));
      }
      return ' ';
    })
    .split(/\s+/)
    .forEach((c) => c && classes.add(c));
}

const IGNORE = new Set([
  // 'is-open'（.day 的展开态钩子）已于 2026-09-13 随「整卡点击收展」一起删除，不再豁免
]);

const missing = [];
for (const c of classes) {
  if (!c || c.startsWith('fg-')) continue; // fg-* 是 app.less / variable.less 的混入类
  // 'is-' 这类是 class="is-{{ state }}" 的拼接前缀，真样式在 .is-idle/.is-soon/.is-now 上
  if (c.endsWith('-')) continue;
  if (IGNORE.has(c)) continue;
  // 在 less 里找 .xxx（含 &__ 展开后的形式）
  const flat = lessAll.replace(/&/g, 'ROOT');
  const hit =
    new RegExp('\\.' + c.replace(/[-_]/g, '[-_]') + '(?![\\w-])').test(flat) ||
    new RegExp('__' + c.split('__')[1] + '(?![\\w-])').test(flat) && c.includes('__');
  if (!hit) missing.push(c);
}
console.log('--- wxml class 无对应样式（应为空，或为有意无样式的纯语义类）---');
console.log(missing.length ? '  ' + missing.join('\n  ') : '  （无）');

/* 2. mock 字段覆盖 */
/* 数据搬到 mock/trips/ 下后要跟着改这里（2026-10-07 综合版改造） */
const TRIP_MOCK = path.join(ROOT, 'mock/trips/chuanxi.js');
const src = fs.readFileSync(TRIP_MOCK, 'utf8').replace(/export\s+default\s+/, 'module.exports = ');
const tmp = path.join(ROOT, '.workbuddy', '_t.cjs');
fs.writeFileSync(tmp, src, 'utf8');
delete require.cache[tmp];
const trip = require(tmp).data.data;
fs.unlinkSync(tmp);

// wxml 里出现的 trip.xxx 一级字段 + 常见二级
const top = new Set();
const tre = /\btrip\.([A-Za-z_$][\w$]*)/g;
while ((m = tre.exec(wxml))) top.add(m[1]);
const badTop = [...top].filter((k) => !(k in trip));
console.log('\n--- wxml 引用的 trip.* 顶层字段 ---');
console.log('  ' + [...top].sort().join(', '));
console.log(badTop.length ? '  缺失: ' + badTop.join(', ') : '  全部存在于 mock');

// 逐日字段
const dayFields = new Set(Object.keys(trip.days[0] || {}));
console.log('\n--- 每天字段 ---');
console.log('  ' + [...dayFields].join(', '));
const used = ['tag', 'title', 'alt', 'route', 'desc', 'weather', 'timeline', 'tips', 'stay'];
console.log('  wxml 用到但 mock 缺: ' + used.filter((k) => !dayFields.has(k)).join(', ') || '  （无）');

// 交通：写死的条目（含挂在上面的班次表）已于 2026-09-15 整体下线，
// 时间线上的交通只来自 07「交通记录」，这里只做一次残留检查（期望 0）

// 统计
console.log('\n--- 统计 ---');
console.log(`  days=${trip.days.length} dayTabs=${trip.dayTabs.length} sections=${trip.sections.length}`);
console.log(
  `  时间线上残留的写死交通=${trip.days.reduce((n, d) => n + d.timeline.filter((s) => s.tt || s.commute).length, 0)}`
);
console.log(`  routes=${trip.routes.length} 每条 legend 齐=${trip.routes.every((r) => !!r.legend)}`);
console.log(
  `  booking.desc 抽 "6 件事"=${/6 件事/.test(trip.booking.desc)} countdown=${trip.booking.countdown.length} 无 steps=${!trip.booking.steps}`
);
console.log(`  packing.preset=${trip.packing.preset.length} costs.categories=${trip.costs.categories.length}`);
console.log(
  `  traffic.modes=${trip.traffic.modes.length} 项 / defaultMode=${trip.traffic.defaultMode} / ` +
    `sec-traffic 在 sections 里=${trip.sections.some((s) => s.id === 'sec-traffic')}`
);
console.log(`  hero.meta=${trip.hero.meta.length} 项: ${trip.hero.meta.map((m) => m.icon).join(',')}`);
console.log(`  无 budget 字段=${trip.budget === undefined}`);
console.log(`  Day2 熊猫表述含 "6 号别墅"=${/6 号别墅/.test(JSON.stringify(trip.days[1]))}`);
console.log(`  footer=${trip.footer.length} 行`);
