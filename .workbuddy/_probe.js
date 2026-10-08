// 探针：找 less 装在哪
const fs = require('fs');
const path = require('path');
const out = [];
const cands = [
  'C:/Users/Administrator/.workbuddy/binaries/node/workspace',
  'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules',
  'C:/Users/Administrator/.workbuddy/binaries/node',
  'D:/LZB/LIN/node_modules',
  'D:/LZB/LIN',
];
for (const c of cands) {
  out.push(`${c}  exists=${fs.existsSync(c)}`);
  if (fs.existsSync(c)) {
    try {
      out.push('  ' + fs.readdirSync(c).slice(0, 30).join(' | '));
    } catch (e) {
      out.push('  ERR ' + e.message);
    }
  }
}
// 递归找 less/package.json（限深度）
function find(dir, depth, hits) {
  if (depth < 0) return;
  let es = [];
  try {
    es = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const e of es) {
    if (e.name === 'less' && e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'package.json'))) {
      hits.push(path.join(dir, e.name, 'package.json'));
    }
    if (e.isDirectory() && e.name !== '.git' && e.name !== 'static') find(path.join(dir, e.name), depth - 1, hits);
  }
}
const hits = [];
find('C:/Users/Administrator/.workbuddy/binaries/node', 5, hits);
out.push('LESS HITS:\n' + hits.join('\n'));
fs.writeFileSync('D:/LZB/LIN/.workbuddy/_out-probe.txt', out.join('\n'), 'utf8');
