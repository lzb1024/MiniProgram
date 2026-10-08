// 把云函数真实返回喂一遍前端组装逻辑，看首页七天条会渲染成什么样。
// 用法: node .workbuddy/_run.js week <绝对路径 node> <项目根>/.workbuddy/_probe-week.js
// 输出落 .workbuddy/_out-week.txt（本机 PowerShell 吞 stdout）
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CJS = path.join(ROOT, '.workbuddy/_weather-cjs.js');
const TMP = path.join(ROOT, '.workbuddy/_trip2.tmp.cjs');

/* 2026-09-13 10:20 从云函数 weather 的云端测试里原样抓回来的响应 */
const PAYLOAD = {
  ok: true,
  updatedAt: 1789266138835,
  data: {
    chengdu: {
      realtime: {
        province: '四川省',
        city: '成都市',
        district: '青羊区',
        weather: '阴',
        temperature: 19,
        wind: '南风 1-2级',
        humidity: 100,
        updateTime: '2026-09-13 10:20',
      },
      forecast: [
        { date: '2026-09-13', week: '星期日', dayWeather: '阵雨', dayTemp: 25, nightWeather: '晴天', nightTemp: 17 },
        { date: '2026-09-14', week: '星期一', dayWeather: '阴', dayTemp: 24, nightWeather: '阵雨', nightTemp: 18 },
        { date: '2026-09-15', week: '星期二', dayWeather: '阵雨', dayTemp: 21, nightWeather: '阵雨', nightTemp: 18 },
        { date: '2026-09-16', week: '星期三', dayWeather: '小雨', dayTemp: 22, nightWeather: '小雨', nightTemp: 17 },
        { date: '2026-09-17', week: '星期四', dayWeather: '阵雨', dayTemp: 23, nightWeather: '阴', nightTemp: 19 },
        { date: '2026-09-18', week: '星期五', dayWeather: '多云', dayTemp: 24, nightWeather: '小雨', nightTemp: 19 },
        { date: '2026-09-19', week: '星期六', dayWeather: '阵雨', dayTemp: 24, nightWeather: '小雨', nightTemp: 20 },
      ],
    },
  },
  errors: [],
};

global.wx = {
  cloud: { callFunction: () => Promise.resolve({ result: PAYLOAD }) },
  getStorageSync: () => '',
  setStorageSync: () => {},
};

let code = fs.readFileSync(path.join(ROOT, 'api/weather.js'), 'utf8');
code = code.replace(/import\s*\{[^}]*\}\s*from\s*'~\/utils\/cloud';/, 'const ensureCloud = () => true;');
code = code.replace(/^export\s+/gm, '');
code += '\nmodule.exports = { fetchWeather, fetchWeekWeather };\n';
fs.writeFileSync(CJS, code, 'utf8');
const { fetchWeather, fetchWeekWeather } = require(CJS);

const mockSrc = fs
  .readFileSync(path.join(ROOT, 'mock/home/getTrip.js'), 'utf8')
  .replace(/export\s+default\s+/, 'module.exports = ');
fs.writeFileSync(TMP, mockSrc, 'utf8');
const trip = require(TMP).data.data;
fs.unlinkSync(TMP);

(async () => {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const pad = (n) => `${n}`.padStart(2, '0');
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const out = [];
  out.push(`今天 = ${todayKey}`);
  out.push(`行程 = ${trip.days[0].date} 起 ${trip.days.length} 天`);

  const live = await fetchWeather(trip.days);
  out.push(`\n[顶部实况条] ${live ? `${live.city} ${live.text} ${live.temp} · ${live.meta}` : 'null（不渲染）'}`);
  if (live && live.hint) out.push(`              提示行：${live.hint}`);

  const bundle = await fetchWeekWeather(trip.days);
  if (!bundle) {
    out.push('\n[七天条] null（不渲染）');
  } else {
    out.push(`\n[七天条] ${bundle.week.length} 格`);
    bundle.week.forEach((w) => {
      out.push(`  ${w.md}  ${w.label.padEnd(10)}  ${w.city.padEnd(5)} ${w.line}${w.inTrip ? '   ← 行程日' : ''}`);
    });
    const keys = Object.keys(bundle.daily);
    out.push(`\n[逐日卡注入] ${keys.length} 天${keys.length ? '' : '（行程还不在 7 天窗口内，日卡继续用攻略参考文案）'}`);
    keys.forEach((k) => out.push(`  ${k} → ${bundle.daily[k].text} ${bundle.daily[k].temp}`));
  }

  fs.writeFileSync(path.join(ROOT, '.workbuddy/_out-week.txt'), out.join('\n'), 'utf8');
  fs.unlinkSync(CJS);
})().catch((err) => {
  fs.writeFileSync(path.join(ROOT, '.workbuddy/_out-week.txt'), '脚本异常：' + (err && err.stack), 'utf8');
});
