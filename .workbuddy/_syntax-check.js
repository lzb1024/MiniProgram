// 语法自检：把 ESM 源码复制成 .mjs 后交给 node --check
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// 项目根目录 = 本脚本所在目录的上一级（.workbuddy/..），换机器/换路径都不用改
const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, '.workbuddy', '_syntax');
fs.mkdirSync(TMP, { recursive: true });

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'api/trip.js',
      'api/weather.js',
      'cloudfunctions/weather/index.js',
      // mock 已搬到 trips/ 下（综合版改造），这里跟着换；
      // mock/home/getTrip.js 只是转发壳，语法由 trips/chuanxi.js 代表，不必单列
      'mock/trips/chuanxi.js',
      'mock/trips/changsha.js',
      'mock/trips/index.js',
      'mock/home/index.js',
      // pages/index 是综合版新增的行程列表页，别漏
      'pages/index/index.js',
      'pages/home/index.js',
      // 常用工具：麻将记分（2026-10-08 加）
      'pages/mahjong/index.js',
      'pages/tools/index.js',
      'utils/mahjong.js',
      'preview/_gen-1home.js',
    ];

let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // 页面 / 工具脚本是 ESM（.mjs 检查），云函数与 node 工具是 CommonJS（.cjs 检查）
  const isCjs = f.indexOf('cloudfunctions/') !== -1 || f.endsWith('_gen-1home.js');
  const ext = isCjs ? '.cjs' : '.mjs';
  const out = path.join(TMP, path.basename(f) + ext);
  fs.writeFileSync(out, src, 'utf8');
  const r = spawnSync(process.execPath, ['--check', out], { encoding: 'utf8' });
  if (r.status === 0) {
    console.log('OK   ' + f);
  } else {
    bad++;
    console.log('FAIL ' + f);
    console.log((r.stderr || '').trim().split('\n').slice(0, 6).join('\n'));
  }
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(bad ? `\n${bad} 个文件有语法错误` : '\n全部通过');
process.exit(bad ? 1 : 0);
