// 一次性：串行跑全套离线校验，输出合并到 .workbuddy/_out-all.txt
const cp = require('child_process');
const fs = require('fs');

const NODE = process.execPath;
const PROJECT = 'E:/3_WorkSpace/MiniProgram';
const SKILL = 'C:/Users/LZB/.workbuddy/skills/miniprogram-theme-retrofit/scripts';
const env = Object.assign({}, process.env, {
  NODE_PATH: 'C:/Users/LZB/.workbuddy/binaries/node/workspace/node_modules',
});

const jobs = [
  ['lesscheck', [SKILL + '/lesscheck.js', PROJECT]],
  ['check-json', [SKILL + '/check-json.js', PROJECT]],
  ['check-components', [SKILL + '/check-components.js', PROJECT]],
  ['syntax', [PROJECT + '/.workbuddy/_syntax-check.js']],
  ['consistency', [PROJECT + '/.workbuddy/_check-consistency.js']],
  ['preview-selectors', [PROJECT + '/.workbuddy/_check-preview.js']],
];

let log = '';
for (const [name, args] of jobs) {
  const r = cp.spawnSync(NODE, args, {
    cwd: PROJECT,
    encoding: 'utf8',
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
  log += `\n\n########## ${name}  exit=${r.status === null ? 'ERR:' + r.error : r.status} ##########\n`;
  log += (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '');
}
fs.writeFileSync(PROJECT + '/.workbuddy/_out-all.txt', log, 'utf8');
