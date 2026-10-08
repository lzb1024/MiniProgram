/**
 * 一次性脚本：把 mock 里「写死的交通」整体剥离（2026-09-15）
 *
 * 用户要求：界面上的交通只认 07「交通记录」里自己记的，攻略写死的交通全部下线。
 * 本次只清「逐日时间线里的交通条目」+ 挂在上面的班次表常量，
 * 每日头部 route 横条、04 预约清单、正文 tips 描述一律不动。
 *
 * 全部按文本精确匹配，任何一处对不上就整体报错退出、不落盘。
 */
const fs = require('fs');
const path = require('path');

const F = path.join(path.resolve(__dirname, '..'), 'mock/home/getTrip.js');
const orig = fs.readFileSync(F, 'utf8');
let s = orig;

function cut(label, text) {
  const n = s.split(text).length - 1;
  if (n !== 1) throw new Error(`${label}: 期望命中 1 次，实际 ${n} 次`);
  s = s.replace(text, '');
  console.log('CUT  ' + label + '  (' + text.length + ' 字符)');
}

function swap(label, from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: 期望命中 1 次，实际 ${n} 次`);
  s = s.replace(from, to);
  console.log('EDIT ' + label);
}

/* ---------- 1. 头部注释：timeline 字段说明 ---------- */
swap(
  '头部 timeline 注释',
  `//   timeline    时间线：[{ t, c, sub?, commute?, tt? }]
//                 commute=true 为城际大交通，单独配色
//                 tt=班次表，展开式，挂在对应的时间线条目上`,
  `//   timeline    时间线：[{ t, c, sub?, commute?, mine?, src?, link? }]
//                 commute=true 为交通条目，出实心「交通」徽标 + 陶土棕左边线；
//                 攻略里写死的交通条目已于 2026-09-15 整体下线，
//                 时间线上的交通只来自 07「交通记录」（mergeTraffic 按时间插进来）`
);

/* ---------- 2. timetable 常量整块 ---------- */
{
  const a = s.indexOf('const timetable = {');
  const b = s.indexOf('// ============================================================\n//  住宿点坐标');
  if (a < 0 || b < 0 || b < a) throw new Error('timetable 块的定位锚点找不到');
  const note =
    '// 班次表常量（timetable）已随写死的交通条目整体下线（2026-09-15）。\n' +
    '// 界面上的交通只保留 07「交通记录」里使用者自己记的那些，\n' +
    '// 原内容备份在 .workbuddy/_removed/2026-09-15/mock__home__getTrip.js。\n\n';
  s = s.slice(0, a) + note + s.slice(b);
  console.log('CUT  timetable 整块  (' + (b - a) + ' 字符)');
}

/* ---------- 3. DAY 4 · 9.28 返蓉两条 ---------- */
cut(
  'DAY 4 16:00 大巴 + 约 20:30 抵茶店子',
  `      {
        t: '16:00',
        c: '前往四姑娘山镇客运站，乘 16:30 大巴返茶店子',
        sub: '微信小程序「天府行」预订（大高二级 95 元 / 中高二级 120 元）；全程约 4 小时，经巴朗山、卧龙、映秀；点开下方按钮可看全天班次表',
        commute: true,
        tt: timetable.songpanOut,
      },
      {
        t: '约 20:30',
        c: '抵茶店子客运站，入住成都雅府酒店（茶店子客运站点），放行李休息',
        sub: '当晚住茶店子附近，明天一早从茶店子出发去三星堆，比折返春熙路省一趟',
        commute: true,
      },
`
);

/* ---------- 4. DAY 5 · 9.29 动车进山两条 ---------- */
cut(
  'DAY 5 14:23 动车 + 16:10 直通车',
  `      {
        t: '14:23',
        c: '动车 C6367 次发车前往黄龙九寨站（三星堆 → 黄龙九寨，约 1.5 小时）',
        sub: '推荐周二 14:23 的 C6367 次，二等座 125 元、一等座 199 元，12306 开售即抢；约 15:52 到站，与原成都东方案同时到、票价省 18 元；点开下方按钮可看全天班次表',
        commute: true,
        tt: timetable.trainIn,
      },
      {
        t: '16:10',
        c: '出站换乘景区直通车前往沟口（约 51 元，车程加候车约 2.5 小时到沟口酒店）',
        sub: '出站约 100 米即官方乘车点；点开下方按钮可看全天班次表',
        commute: true,
        tt: timetable.busToValley,
      },
`
);

/* ---------- 5. DAY 7 · 10.1 返蓉三条 ---------- */
cut(
  'DAY 7 07:20 直通车',
  `      {
        t: '07:20',
        c: '九寨沟沟口乘直通车前往黄龙九寨站（约 2 小时，约 38 至 51 元）',
        sub: '沟口客运中心 / 漳扎镇沿线酒店可上车；点开下方按钮可看全天班次表',
        commute: true,
        tt: timetable.busToStation,
      },
`
);
cut(
  'DAY 7 10:30 动车',
  `      {
        t: '10:30',
        c: '动车 C6368 次发车返回成都东（黄龙九寨 → 成都东，约 2 小时）',
        sub: '二等座 143 元，12306 开售即抢；约 12:23 到成都东；点开下方按钮可看班次表',
        commute: true,
        tt: timetable.trainOut,
      },
`
);
cut(
  'DAY 7 12:23 抵成都东',
  `      {
        t: '12:23',
        c: '抵成都东站，地铁或打车回凤翔意宿酒店（滨江东路 / 九眼桥侧）',
        sub: '比全程大巴提前约 4 小时到蓉，下午还能安排轻松活动',
        commute: true,
      },
`
);

/* ---------- 6. DAY 9 · 10.3 返程三条 ---------- */
cut(
  'DAY 9 08:00 去机场 + 10:00 值机 + 10:30 起飞',
  `      {
        t: '08:00',
        c: '前往成都天府机场 T2',
        sub: '地铁 18 号线直达约 40 至 50 分钟 / 10 元，最早 06:00 发车；打车约 50 分钟 / 130 至 160 元。10.3 非出行峰值，路上不挤',
        commute: true,
      },
      {
        t: '10:00',
        c: '开始值机、过安检',
        sub: '起飞前 2.5 小时到机场够从容：网上提前选座、办托运（T2 出发大厅 1F），手信超重就现场补行李额',
        commute: true,
      },
      {
        t: '10:30',
        c: '直飞航班起飞 成都天府 → 厦门高崎（飞行约 2 小时 45 分）',
        sub: '13:15 落地厦门高崎 T3（航班时段以实际预订为准），可让国航/川航/厦航 任一；10.3 是国庆假期中段、票务压力比 10.2 小，单程含税约 ¥800 至 1500',
        commute: true,
      },
`
);

/* ---------- 落盘前自检 ---------- */
const left = s
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l) && /timetable|tt:\s|commute: true/.test(l));
if (left.length) {
  console.log('!! 残留引用：');
  left.forEach((l) => console.log('   ' + l.trim()));
  throw new Error('还有残留，未落盘');
}

fs.writeFileSync(F, s);
console.log('\nOK  ' + orig.length + ' -> ' + s.length + ' 字符，已写入 ' + F);
