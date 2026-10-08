// 一次性清理脚本：把无引用的 static 示例图备份到 .workbuddy/_removed-static/，再删除原文件。
// 用法: <node> .workbuddy/_cleanup-static.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'E:/3_WorkSpace/MiniProgram';
const SRC = path.join(ROOT, 'static');
const BAK = path.join(ROOT, '.workbuddy', '_removed-static');

const FILES = [
  'avatar1.png', 'bg_navbar.png', 'bg_navbar2.png',
  'icon_doc.png', 'icon_map.png', 'icon_qq.png', 'icon_td.png', 'icon_wx.png',
  'image1.png', 'image2.png', 'img_td.png',
  'chat/avatar.png', 'chat/avatar-Andrew.png', 'chat/avatar-Kingdom.png',
  'chat/avatar-Mollymolly.png', 'chat/avatar-Paige.png', 'chat/avatar-Sean.png',
  'home/card0.png', 'home/card1.png', 'home/card2.png', 'home/card3.png', 'home/card4.png',
];

const log = [];
let backed = 0, removed = 0, failed = 0;

for (const rel of FILES) {
  const src = path.join(SRC, rel);
  const bak = path.join(BAK, rel);
  if (!fs.existsSync(src)) {
    log.push(`SKIP ${rel} (源文件不存在)`);
    continue;
  }
  try {
    fs.mkdirSync(path.dirname(bak), { recursive: true });
    fs.copyFileSync(src, bak);
    const s1 = fs.statSync(src).size;
    const s2 = fs.statSync(bak).size;
    if (s1 !== s2) throw new Error(`备份体积不一致 ${s1} vs ${s2}`);
    backed++;
    fs.unlinkSync(src);
    removed++;
    log.push(`OK   ${rel}  (${s1} bytes)`);
  } catch (e) {
    failed++;
    log.push(`FAIL ${rel} :: ${e.message}`);
  }
}

// 清空目录检查
for (const d of ['chat', 'home']) {
  const dp = path.join(SRC, d);
  if (fs.existsSync(dp)) {
    const rest = fs.readdirSync(dp);
    log.push(`目录 static/${d} 剩余 ${rest.length} 项: ${rest.join(', ')}`);
    if (rest.length === 0) {
      fs.rmdirSync(dp);
      log.push(`  已删除空目录 static/${d}`);
    }
  }
}

log.push('');
log.push('=== static 剩余内容 ===');
const walk = (dir, prefix = '') => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, prefix + e.name + '/');
    else log.push(`  ${prefix}${e.name}  (${fs.statSync(full).size} bytes)`);
  }
};
walk(SRC);

log.push('');
log.push(`汇总: 备份 ${backed} / 删除 ${removed} / 失败 ${failed}`);

const out = path.join(ROOT, '.workbuddy', '_cleanup-log.txt');
fs.writeFileSync(out, log.join('\n'), 'utf8');
console.log(log.join('\n'));
