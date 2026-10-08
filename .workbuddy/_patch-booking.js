/* 一次性脚本：把 mock/home/getTrip.js 里整个 const booking = {...} 换掉
   （04 预约区块：倒计时只留用户给的 4 项，steps 长文整体删掉）。
   用括号配平定位，避免行号漂移。跑完可删。 */
const fs = require('fs');

const FILE = 'D:/LZB/LIN/mock/home/getTrip.js';
const LOG = 'D:/LZB/LIN/.workbuddy/_out-patch.txt';

const NEW = [
  'const booking = {',
  "  desc: '全程实行实名制预约，现场基本无售票窗口。下面这 4 件事都卡着放票时间，盯紧就稳了。',",
  "  countdownTitle: '预约倒计时（按行程使用日）',",
  '  countdownNote:',
  "    '下表按打开页面的「今天」实时计算每项最早可约日还有几天。旺季景区多实行全网实名预约、现场基本无票，建议到「最早可约」当天就动手锁票。动车票按 12306 预售期 15 天（含乘车当日）推算，黄龙九寨站起售时间 15:30，请以 12306 App「我的 → 起售时间」为准。',",
  '  legend: [',
  "    { state: 'now', text: '已可预约' },",
  "    { state: 'soon', text: '3 天内开抢' },",
  "    { state: 'idle', text: '未到时间' },",
  '  ],',
  '  countdown: [',
  '    {',
  "      item: '三星堆门票',",
  "      sub: 'DAY 5 · 9.29 进馆',",
  "      use: '2026-09-29',",
  "      lead: '提前 5 天',",
  "      open: '2026-09-24',",
  "      ot: '19:00 放票',",
  "      channel: '三星堆博物馆公众号 / 小程序',",
  '    },',
  '    {',
  "      item: '九寨沟门票',",
  "      sub: 'DAY 6 · 9.30 进沟',",
  "      use: '2026-09-30',",
  "      lead: '提前 14 天',",
  "      open: '2026-09-16',",
  "      ot: '00:00 放票',",
  "      channel: '九寨沟小程序',",
  '    },',
  '    {',
  "      item: '大巴票 · 九寨沟口 → 黄龙九寨站',",
  "      sub: 'DAY 7 · 10.1 乘车',",
  "      use: '2026-10-01',",
  "      lead: '提前 14 天',",
  "      open: '2026-09-17',",
  "      ot: '早上放票',",
  "      channel: '九旅悦行小程序',",
  '    },',
  '    {',
  "      item: '动车票 · 黄龙九寨 → 成都东',",
  "      sub: 'DAY 7 · 10.1 乘车',",
  "      use: '2026-10-01',",
  "      lead: '提前 15 天（含乘车当日）',",
  "      open: '2026-09-17',",
  "      ot: '15:30 起售',",
  "      channel: '铁路 12306 App',",
  '    },',
  '  ],',
  '};',
].join('\n');

const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split('\n');

const start = lines.findIndex((l) => l.startsWith('const booking = {'));
if (start < 0) throw new Error('booking 起点没找到');
if (!/^\s*steps: \[/.test(lines[start + 116] || '')) {
  // 只做提示，不阻断：steps 应位于起点之后
  console.log('提示：起点 +116 行不是 steps，实际是：' + String(lines[start + 116] || '').trim());
}

let depth = 0;
let end = -1;
for (let i = start; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end >= 0) break;
}
if (end < 0) throw new Error('booking 结束没找到');

const oldText = lines.slice(start, end + 1).join('\n');
const hasSteps = /\n  steps: \[/.test('\n' + oldText);
const out = lines.slice(0, start).concat(NEW.split('\n'), lines.slice(end + 1));
const next = out.join('\n');

if (/const booking = \{\n[\s\S]*?\n  steps: \[/.test(next)) {
  throw new Error('写完仍能匹配到 booking.steps，未生效');
}
fs.writeFileSync(FILE, next, 'utf8');

fs.writeFileSync(
  LOG,
  [
    `booking 块：第 ${start + 1} 行 至 第 ${end + 1} 行（旧 ${end - start + 1} 行 → 新 ${NEW.split('\n').length} 行）`,
    `旧块含 steps: ${hasSteps}`,
    `旧块含 countdown 条目数: ${(oldText.match(/^      item: /gm) || []).length}`,
    `新块 countdown 条目数: ${(NEW.match(/^      item: /gm) || []).length}`,
    `文件仍含 "7 件事": ${/7 件事/.test(next)}`,
    `文件仍含 "booking.steps": ${/booking\.steps/.test(next)}`,
  ].join('\n') + '\n',
  'utf8'
);
console.log('done');
