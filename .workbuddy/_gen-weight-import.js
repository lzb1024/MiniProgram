// 生成体重数据的导入文件（两份，用途不同）：
//
//   ① weight-import.json            —— 云开发控制台「数据库 → 导入」用，JSONL，一人一行
//   ② weight-import-clipboard.json  —— 小程序页面「从剪贴板导入」用，单个 JSON 对象
//
// 数据来源 = 网页版历史（原 utils/weight-seed.js，me 120 条 03-07~08-17 / ta 92 条 03-06~08-14）
//          + 用户 2026-10-23 提供的 14 张「全部记录」截图
//            （我 9 张 45 条 08-17~10-23；TA 5 张 24 条 08-14~10-22）
//          + 1 条口头补录（我 10-10，源 App 里本来没有这天）
// 合并后 me 164 条、ta 115 条，合计 279 条。
//
// 跑法：node .workbuddy/_gen-weight-import.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const W = require(path.join(ROOT, 'utils', 'weight'));

// 基准数据直接读网页版原始文件，而不是读 utils/weight-seed.js ——
// 后者是**本脚本的输出**，读它等于「在上一版结果上再叠加」，
// 一旦 seed 被误删或改坏就再也重建不出来。
const WEB_JSON = 'E:/3_WorkSpace/SimpleWeb/weight-tracker/data.json';
let SEED;
try {
  SEED = JSON.parse(fs.readFileSync(WEB_JSON, 'utf8'));
} catch (err) {
  console.error('⚠️ 读不到网页版原始数据：' + WEB_JSON);
  console.error('   ' + (err && err.message));
  console.error('   继续跑会丢掉网页版那 212 条，已中止。');
  process.exit(1);
}

const YEAR = '2026';

// 逐图转录，格式 [MM-DD, 体重(斤), 体脂率(%)]
// 截图里每行还带时间（07:24 之类），但小程序记录只有日期一个维度，时间不入库。
const SHOTS = [
  // 图1：10/23 - 10/19（10/17 的标签在图1底部，行落在图2顶部）
  ['10-23', 154.0, 24.7],
  ['10-22', 153.0, 23.5],
  ['10-21', 153.5, 23.6],
  ['10-20', 153.6, 23.8],
  ['10-19', 154.9, 24.1],
  // 图2：10/17 - 10/12
  ['10-17', 152.5, 23.6],
  ['10-16', 151.6, 23.8],
  ['10-15', 152.5, 23.9],
  ['10-14', 154.4, 24.5],
  ['10-13', 152.1, 23.9],
  ['10-12', 153.9, 24.7],
  // 图3：10/09 - 09/22
  ['10-09', 152.1, 23.9],
  ['10-08', 152.8, 24.2],
  ['09-24', 150.6, 23.4],
  ['09-23', 150.1, 23.5],
  ['09-22', 149.9, 23.6],
  // 图4：09/21 - 09/16
  ['09-21', 149.4, 23.5],
  ['09-20', 149.7, 23.4],
  ['09-18', 150.6, 23.4],
  ['09-17', 149.4, 23.2],
  ['09-16', 149.4, 23.5],
  // 图5：09/15 - 09/09
  ['09-15', 148.8, 23.0],
  ['09-14', 151.3, 23.4],
  ['09-11', 148.8, 23.0],
  ['09-10', 148.8, 23.2],
  ['09-09', 149.4, 23.4],
  // 图6：09/08 - 09/02（底部还有 09/01 的标签，但记录被裁掉了，无法录入）
  ['09-08', 148.8, 23.4],
  ['09-07', 150.6, 23.6],
  ['09-04', 149.3, 22.7],
  ['09-03', 148.9, 22.5],
  ['09-02', 149.6, 22.8],
  // 图7（240）：09/01 - 08/26
  ['09-01', 150.1, 23.1],
  ['08-31', 151.5, 23.7],
  ['08-28', 149.1, 23.1],
  ['08-27', 148.0, 22.8],
  ['08-26', 148.4, 22.5],
  // 图8（9525）：08/21 - 08/17（08/17 原本 seed 里也有，这里让截图覆盖一遍，体脂更全）
  ['08-21', 148.5, 23.0],
  ['08-20', 149.5, 23.2],
  ['08-19', 148.1, 23.2],
  ['08-18', 148.0, 22.8],
  ['08-17', 148.6, 22.8],
  // 图9（fe0c）：顶行是 08/27（值 148.0 / 22.8 与已有转录一致，可反证顶行归属），
  // 08/27、08/26 已有，只补 08/25、08/24、08/22
  ['08-25', 149.1, 22.5],
  ['08-24', 149.4, 22.5],
  ['08-22', 149.2, 22.9],
  // 用户口头补录（2026-10-23 说「添加 10-10 152.5斤 23.8%」）：
  // 这天在源 App 里没有记录，是补进去的，不是从截图转录的
  ['10-10', 152.5, 23.8],
];

// TA 的截图（5 张），格式同 SHOTS
const SHOTS_TA = [
  // 图244：09/25 - 09/09
  ['09-25', 106.1, 28.8],
  ['09-20', 106.1, 27.9],
  ['09-16', 105.3, 27.5],
  ['09-15', 106.5, 28.2],
  ['09-09', 105.3, 28.1],
  // 图245：09/07 - 08/26
  ['09-07', 105.6, 28.2],
  ['09-02', 105.2, 28.1],
  ['08-31', 105.9, 27.8],
  ['08-28', 105.9, 27.9],
  ['08-26', 105.6, 28.2],
  // 图246：08/25 - 08/20
  ['08-25', 106.4, 28.4],
  ['08-24', 105.9, 27.9],
  ['08-22', 106.5, 28.0],
  ['08-21', 106.2, 27.6],
  ['08-20', 106.6, 28.1],
  // 图247：08/19 - 08/14。两个坑：
  //   ① 顶部那半行是 08/20 的尾巴（体脂 28.1%），已在图246 收录；
  //   ② 08/18 下面还多出一条 107.1 斤 / 08:32 但**没有体脂率**的记录 ——
  //      源 App 同一天存了两条，这里按「一天一条」只留带体脂的那条。
  ['08-19', 106.6, 27.8],
  ['08-18', 107.1, 27.9],
  ['08-17', 106.3, 27.8],
  ['08-14', 106.0, 28.2],
  // 图243：10/22 - 10/08（底部 08/13 的标签被裁掉，那行没有值，不录）
  ['10-22', 106.9, 29.1],
  ['10-17', 106.2, 29.1],
  ['10-13', 106.8, 29.0],
  ['10-10', 105.4, 28.5],
  ['10-08', 107.4, 29.4],
];

const shotRecords = SHOTS.map(([md, weight, bodyFat]) => ({
  id: 'shot-' + YEAR + '-' + md,
  date: YEAR + '-' + md,
  weight: weight,
  bodyFat: bodyFat,
}));

const shotTaRecords = SHOTS_TA.map(([md, weight, bodyFat]) => ({
  id: 'shot-ta-' + YEAR + '-' + md,
  date: YEAR + '-' + md,
  weight: weight,
  bodyFat: bodyFat,
}));

// 合并：seed 在前、截图在后。normalize 按日期去重且「后者胜」，
// 万一哪天重叠，以截图（更新时间更近）为准。
const merged = W.normalize({
  users: {
    me: (SEED.users.me || []).concat(shotRecords),
    ta: (SEED.users.ta || []).concat(shotTaRecords),
  },
});

const me = merged.me;
const ta = merged.ta;
const ids = me.concat(ta).map((r) => r.id);
const dupIds = ids.filter((v, i) => ids.indexOf(v) !== i);

function jsonlLine(user, records) {
  return JSON.stringify({
    _id: 'weight_' + user,
    uid: user,
    records: records.map((r) => ({
      id: r.id,
      date: r.date,
      weight: r.weight,
      bodyFat: r.bodyFat,
    })),
    updatedAt: '2026-10-23T08:50:00.000Z',
  });
}

const jsonl = [jsonlLine('me', me), jsonlLine('ta', ta)].join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'weight-import.json'), jsonl, 'utf8');

const clip = {
  version: 2,
  currentUser: 'me',
  users: {
    me: me.map((r) => ({ id: r.id, date: r.date, weight: r.weight, bodyFat: r.bodyFat })),
    ta: ta.map((r) => ({ id: r.id, date: r.date, weight: r.weight, bodyFat: r.bodyFat })),
  },
};
fs.writeFileSync(path.join(ROOT, 'weight-import-clipboard.json'), JSON.stringify(clip), 'utf8');

/* ---------------- 核对输出 ---------------- */

const seedMeLast = (SEED.users.me || []).slice(-1)[0];
const shotSorted = shotRecords.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
const shotTaSorted = shotTaRecords.slice().sort((a, b) => (a.date < b.date ? -1 : 1));

console.log('我 截图转录   %d 条  %s ~ %s', shotSorted.length, shotSorted[0].date, shotSorted[shotSorted.length - 1].date);
console.log('TA 截图转录  %d 条  %s ~ %s', shotTaSorted.length, shotTaSorted[0].date, shotTaSorted[shotTaSorted.length - 1].date);
console.log('seed.me      %d 条  末条 %s %s斤', (SEED.users.me || []).length, seedMeLast.date, seedMeLast.weight);
console.log('合并后 me    %d 条  %s ~ %s', me.length, me[0].date, me[me.length - 1].date);
console.log('合并后 ta    %d 条  %s ~ %s', ta.length, ta[0].date, ta[ta.length - 1].date);
console.log('合计         %d 条', me.length + ta.length);
console.log('id 重复      %s', dupIds.length ? '有！' + dupIds.slice(0, 5).join(',') : '无');
console.log('日期重复     %s',
  new Set(me.map((r) => r.date)).size === me.length &&
  new Set(ta.map((r) => r.date)).size === ta.length ? '无' : '有！');

const oct = me.filter((r) => W.inMonth(r, 2026, 10));
const s = W.stat(oct);
console.log('2026-10    %d 条  最新 %s  最高 %s  最低 %s  振幅 %s',
  s.count, s.latestW, s.maxW, s.minW, s.spreadW);
const sep = me.filter((r) => W.inMonth(r, 2026, 9));
const s9 = W.stat(sep);
console.log('2026-09    %d 条  最新 %s  最高 %s  最低 %s  振幅 %s',
  s9.count, s9.latestW, s9.maxW, s9.minW, s9.spreadW);

/* ---------------- 同时刷新内置数据（页面上一键导入用的那份） ---------------- */

function recLine(r, last) {
  const o = { id: r.id, date: r.date, weight: r.weight, bodyFat: r.bodyFat };
  return '      ' + JSON.stringify(o) + (last ? '' : ',');
}

const seedSrc = [
  '// utils/weight-seed.js — 内置历史记录（一键导入用，勿手改）',
  '//',
  '// 来源：① E:/3_WorkSpace/SimpleWeb/weight-tracker/data.json（网页版，2026-03-06 ~ 08-14）',
  '//       ② 2026-10-23 提供的「全部记录」截图 14 张，手工转录（我 9 张 08-17~10-23、TA 5 张 08-14~10-22）',
  '//       ③ 用户口头补录 1 条（我 10-10）',
  '// 由 .workbuddy/_gen-weight-import.js 生成，改数据请改那个脚本再重跑。',
  '// 用途：体重页「导入内置历史数据」/ 空态横幅「去导入」，一次性灌进本机存储。',
  '// 格式与页面导出的 JSON 一致，导入走同一条 normalize() 路径。',
  '// ⚠️ 这是数据文件不是逻辑文件，别在这里加代码。',
  '',
  'module.exports = {',
  '  version: 2,',
  '  exportedAt: "2026-10-23",',
  '  users: {',
  '    me: [',
  me.map((r, i) => recLine(r, i === me.length - 1)).join('\n'),
  '    ],',
  '    ta: [',
  ta.map((r, i) => recLine(r, i === ta.length - 1)).join('\n'),
  '    ],',
  '  },',
  '};',
  '',
].join('\n');

fs.writeFileSync(path.join(ROOT, 'utils', 'weight-seed.js'), seedSrc, 'utf8');
console.log('已刷新 utils/weight-seed.js  me=%d  ta=%d', me.length, ta.length);

fs.writeFileSync(path.join(ROOT, '.workbuddy', '_tmp', 'gen-import.log'), 'ok\n', 'utf8');
