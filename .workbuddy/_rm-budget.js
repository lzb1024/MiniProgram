// 一次性：从 mock 里摘掉 04 费用预算整块
const fs = require('fs');
const p = 'D:/LZB/LIN/mock/home/getTrip.js';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

const start = lines.findIndex((l) => l.includes('04 费用预算（人均）——'));
const end = lines.findIndex((l) => l.trim() === '//  05 预约与购票清单');
if (start < 0 || end < 0 || end <= start) throw new Error(`markers not found: ${start} ${end}`);

// 只吃 start..(05 的分隔线之前)，保留 routes 后面那行空行与 05 的 // ==== 分隔线
const count = end - 1 - start;
const removed = lines.slice(start, start + count);
if (!removed.some((l) => l.startsWith('const budget'))) throw new Error('unexpected slice');
if (lines[start + count].trim() !== '// ============================================================') {
  throw new Error('tail marker mismatch: ' + lines[start + count]);
}

lines.splice(start, count);
fs.writeFileSync(p, lines.join('\n'), 'utf8');
fs.writeFileSync(
  'D:/LZB/LIN/.workbuddy/_out-rmbudget.txt',
  `removed ${count} lines (${start + 1}~${start + count}), file now ${lines.length} lines\n` +
    lines
      .map((l, i) => `${i + 1}: ${l}`)
      .slice(start - 4, start + 4)
      .join('\n'),
  'utf8'
);
