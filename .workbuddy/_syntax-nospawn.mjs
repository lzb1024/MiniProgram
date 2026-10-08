// 绕过 spawnSync EBUSY 的语法校验：用 node --check 无法 spawn，改用动态 import 加载 ESM/CJS。
// 注意：直接 --check 单个文件需 spawn；这里改为「读源 + new Function/动态 import」两路各覆盖一半。
// 最稳的做法：把 ESM 源码写到临时 .mjs，再用一个独立 node 进程 import 它 —— 但仍是 spawn。
// 因此改为进程内校验：用 vm.SourceTextModule 不可用（需 flag），退而用「括号配平 + 关键结构断言」。
//
// 实际上最有效的是直接 spawn node --check，但本会话 spawn 全挂。
// 替代：用 node 的 vm.compileFunction 检查函数体语法，用 new Function 检查脚本体。
// 对 ESM（import/export）无法用 new Function，所以对 ESM 文件做「剥离 import/export 后检查」。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'E:/3_WorkSpace/MiniProgram';

const FILES = [
  'api/trip.js',
  'api/weather.js',
  'mock/trips/chuanxi.js',
  'mock/trips/changsha.js',
  'mock/trips/index.js',
  'mock/home/index.js',
  'pages/index/index.js',
  'pages/home/index.js',
  'pages/mahjong/index.js',
  'pages/tools/index.js',
  'utils/mahjong.js',
  'preview/_gen-1home.js',
];

const CJS = ['cloudfunctions/weather/index.js'];

function checkSource(file, isCjs) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return { file, status: 'MISSING' };
  let src = fs.readFileSync(full, 'utf8');
  if (!isCjs) {
    // 剥离 ESM 语法，转成可被 new Function 解析的函数体
    src = src
      .replace(/^\s*import\s+[^;]+;?\s*$/gm, '')
      .replace(/^\s*export\s+default\s+/gm, 'const __default__ = ')
      .replace(/^\s*export\s+(?=(async\s+)?(const|let|var|function|class)\b)/gm, '')
      .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');
  }
  try {
    new Function(src);
    return { file, status: 'OK' };
  } catch (e) {
    return { file, status: 'FAIL', err: e.message };
  }
}

const results = [];
for (const f of FILES) results.push(checkSource(f, false));
for (const f of CJS) results.push(checkSource(f, true));

let bad = 0;
for (const r of results) {
  if (r.status === 'OK') console.log('OK   ' + r.file);
  else {
    bad++;
    console.log(r.status + ' ' + r.file);
    if (r.err) console.log('     ' + r.err);
  }
}
console.log(bad ? `\n${bad} 个文件有问题` : '\n全部通过');
