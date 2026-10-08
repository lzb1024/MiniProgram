// 一次性：串行跑全套离线校验，输出合并到 .workbuddy/_out-all.txt
const cp = require('child_process');
const fs = require('fs');

const NODE = process.execPath;
const SKILL = 'C:/Users/Administrator/.workbuddy/skills/miniprogram-theme-retrofit/scripts';
const env = Object.assign({}, process.env, {
  NODE_PATH: 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules',
});

const jobs = [
  ['lesscheck', [SKILL + '/lesscheck.js', 'D:/LZB/LIN']],
  ['check-json', [SKILL + '/check-json.js', 'D:/LZB/LIN']],
  ['check-components', [SKILL + '/check-components.js', 'D:/LZB/LIN']],
  ['syntax', ['D:/LZB/LIN/.workbuddy/_syntax-check.js']],
  ['consistency', ['D:/LZB/LIN/.workbuddy/_check-consistency.js']],
  ['preview-selectors', ['D:/LZB/LIN/.workbuddy/_check-preview.js']],
];

let log = '';
for (const [name, args] of jobs) {
  const r = cp.spawnSync(NODE, args, {
    cwd: 'D:/LZB/LIN',
    encoding: 'utf8',
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
  log += `\n\n########## ${name}  exit=${r.status === null ? 'ERR:' + r.error : r.status} ##########\n`;
  log += (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '');
}
fs.writeFileSync('D:/LZB/LIN/.workbuddy/_out-all.txt', log, 'utf8');
