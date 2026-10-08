// 通用跑脚本 + 落盘输出（PowerShell 在本机吞 stdout，只能靠脚本自己写文件）
// 用法: node .workbuddy/_run.js <标签> <可执行文件> [参数...]
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

// 项目根目录 = 本脚本所在目录的上一级（.workbuddy/..），换机器/换路径都不用改
const ROOT = path.resolve(__dirname, '..');

const [label, exe, ...rest] = process.argv.slice(2);
const start = Date.now();
const r = cp.spawnSync(exe, rest, {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  env: process.env,
});

const body =
  `\n===== ${label} =====\n` +
  `cmd: ${exe} ${rest.join(' ')}\n` +
  `exit=${r.status === null ? 'null(' + r.error + ')' : r.status}  ${Date.now() - start}ms\n` +
  `--- stdout ---\n${r.stdout || '(空)'}\n` +
  `--- stderr ---\n${r.stderr || '(空)'}\n`;

fs.writeFileSync(path.join(ROOT, '.workbuddy', '_out-run.txt'), body, 'utf8');
