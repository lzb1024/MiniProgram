// 改完首页内容后的一键验证：重生成分片 → 重建预览 → 天气自测 → 全套离线校验
// 用法: node .workbuddy/_post.js
// 本机 PowerShell 吞 stdout，所以全流程日志落到 .workbuddy/_out-post.txt
const cp = require('child_process');
const fs = require('fs');

const path = require('path');
const NODE = process.execPath;
// 项目根目录 = 本脚本所在目录的上一级（.workbuddy/..），换机器/换路径都不用改
const ROOT = path.resolve(__dirname, '..');
const SKILL = 'C:/Users/LZB/.workbuddy/skills/miniprogram-theme-retrofit/scripts';
const env = Object.assign({}, process.env, {
  NODE_PATH: 'C:/Users/LZB/.workbuddy/binaries/node/workspace/node_modules',
});

const steps = [
  ['gen-1home', ['preview/_gen-1home.js']],
  ['build-preview', [SKILL + '/build-preview.js', ROOT]],
  ['test-weather', ['.workbuddy/_test-weather.js']],
  ['check-all', ['.workbuddy/_check-all.js']],
];

let log = '';
for (const [name, args] of steps) {
  const r = cp.spawnSync(NODE, args, { cwd: ROOT, encoding: 'utf8', env, maxBuffer: 32 * 1024 * 1024 });
  log += `\n\n########## ${name}  exit=${r.status === null ? 'ERR:' + r.error : r.status} ##########\n`;
  log += (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '');
}

const allPath = ROOT + '/.workbuddy/_out-all.txt';
const all = fs.existsSync(allPath) ? fs.readFileSync(allPath, 'utf8') : '(没有 _out-all.txt)';
fs.writeFileSync(ROOT + '/.workbuddy/_out-post.txt', log + '\n\n===== _out-all.txt =====\n' + all, 'utf8');
