// ⚠️ 已停用（2026-10-23）：跑它会把 utils/weight-seed.js 覆盖回「只有网页版 120 条」。
//    现在内置数据由 _gen-weight-import.js 统一生成（网页版 156 条 + 截图转录 36 条），
//    要改数据请改那个脚本。这个文件保留只为记录当初的转换路径。
//
// 一次性脚本：把网页版 data.json 转成小程序可 require 的种子模块
const fs = require('fs');
const path = require('path');

const SRC = 'E:/3_WorkSpace/SimpleWeb/weight-tracker/data.json';
const OUT = path.resolve(__dirname, '..', 'utils', 'weight-seed.js');

const d = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const me = (d.users && d.users.me) || [];
const ta = (d.users && d.users.ta) || [];

const line = (r) =>
  '    ' +
  JSON.stringify({
    id: r.id,
    date: r.date,
    weight: r.weight,
    bodyFat: r.bodyFat === undefined ? null : r.bodyFat,
  }) +
  ',';

const body = [
  '// utils/weight-seed.js — 网页版体重追踪器的原始记录（迁移用，勿手改）',
  '//',
  '// 来源：E:/3_WorkSpace/SimpleWeb/weight-tracker/data.json',
  '// 用途：体重页「导入网页版历史数据」按钮，一次性把迁移前的记录灌进本机存储。',
  '// 格式与页面导出的 JSON 完全一致，所以导入走同一条 normalize() 路径。',
  '// ⚠️ 这是数据文件不是逻辑文件，别在这里加代码。',
  '',
  'module.exports = {',
  '  version: 2,',
  '  exportedAt: ' + JSON.stringify(new Date().toISOString().slice(0, 10)) + ',',
  '  users: {',
  '    me: [',
  ...me.map(line),
  '    ],',
  '    ta: [',
  ...ta.map(line),
  '    ],',
  '  },',
  '};',
  '',
].join('\n');

fs.writeFileSync(OUT, body, 'utf8');
console.log('wrote', OUT, me.length, ta.length, body.length + ' bytes');
