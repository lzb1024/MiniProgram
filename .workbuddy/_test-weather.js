// 天气链路自测：云函数 main 的入参分支 + 前端 api/weather.js 的组装逻辑。
// 云端配置（云函数环境变量、数据库权限）离线验不了，这里覆盖的是「代码逻辑」这一半。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CF = path.join(ROOT, 'cloudfunctions/weather/index.js');
const CJS = path.join(ROOT, '.workbuddy/_weather-cjs.js');
const TMP_MOCK = path.join(ROOT, '.workbuddy/_trip2.tmp.cjs');

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}   -> ${detail === undefined ? '' : detail}`);
  }
}

async function loadMain(envKey) {
  if (envKey) process.env.QQMAP_KEY = envKey;
  else delete process.env.QQMAP_KEY;
  delete require.cache[require.resolve(CF)];
  return require(CF);
}

(async () => {
  console.log('=== 一、云函数 main ===');

  let cf = await loadMain('');
  let r = await cf.main({ points: [{ key: 'chengdu', location: '30.657,104.066' }] });
  check('未配 QQMAP_KEY 时返回 NO_KEY', r && r.ok === false && r.error === 'NO_KEY', JSON.stringify(r));

  cf = await loadMain('FAKEKEY-AAAAA-BBBBB-CCCCC-DDDDD-EEEEE');
  r = await cf.main({});
  check('空 points 时返回 NO_POINTS', r && r.error === 'NO_POINTS', JSON.stringify(r));

  r = await cf.main({ points: [{ key: 'chengdu', location: '30.657,104.066' }], getMd: 1 });
  check(
    '假 Key 打真实接口时优雅失败（UPSTREAM，不是崩溃）',
    r && r.ok === false && r.error === 'UPSTREAM',
    JSON.stringify(r)
  );
  console.log('        上游返回:', JSON.stringify(r && r.message));

  console.log('\n=== 二、前端 api/weather.js ===');

  const wxMock = {
    _call: null,
    cloud: { callFunction: (opt) => Promise.resolve(wxMock._call(opt)) },
    getStorageSync: () => '',
    setStorageSync: () => {},
  };
  global.wx = wxMock;

  // ESM → CJS：把别名 import 换成桩，去掉 export 关键字
  let code = fs.readFileSync(path.join(ROOT, 'api/weather.js'), 'utf8');
  code = code.replace(/import\s*\{[^}]*\}\s*from\s*'~\/utils\/cloud';/, 'const ensureCloud = () => true;');
  code = code.replace(/^export\s+/gm, '');
  code += '\nmodule.exports = { fetchWeather, fetchWeekWeather };\n';
  fs.writeFileSync(CJS, code, 'utf8');
  const { fetchWeather, fetchWeekWeather } = require(CJS);

  const mockSrc = fs
    .readFileSync(path.join(ROOT, 'mock/home/getTrip.js'), 'utf8')
    .replace(/export\s+default\s+/, 'module.exports = ');
  fs.writeFileSync(TMP_MOCK, mockSrc, 'utf8');
  const trip = require(TMP_MOCK).data.data;
  fs.unlinkSync(TMP_MOCK);

  const days = trip.days;
  console.log(`  mock：${days.length} 天，首日 ${days[0].date} ${days[0].city}`);

  // 当前打开那天的键（中午取样避开夏令时边界），下面三处场景共用
  function dayKey(offsetDays) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dd}`;
  }

  // 场景 A：窗口里还没有出发日，接口最多给到 6 天后
  wxMock._call = () => ({
    result: {
      ok: true,
      data: {
        chengdu: {
          realtime: { city: '成都市', weather: '多云', temperature: 22, wind: '东北风 2-3级', humidity: 60 },
          forecast: [{ date: dayKey(0), week: '星期六', dayWeather: '多云', dayTemp: 25, nightTemp: 18 }],
        },
      },
    },
  });
  let view = await fetchWeather(days);
  check('A 关注城市取到出发地（成都）', view && view.city === '成都', JSON.stringify(view));
  check('A 大号温度取今天那条的昼夜区间', view && view.temp === '18~25℃', view && view.temp);
  check(
    'A meta 把实况温度挪到次行、并带风向湿度',
    view && /实况 22℃/.test(view.meta) && /东北风/.test(view.meta) && /湿度 60%/.test(view.meta),
    view && view.meta
  );
  check('A hint 指向 9.19 可查', view && /9\.19 起可查/.test(view.hint), view && view.hint);
  console.log('        view =', JSON.stringify(view));

  // 场景 A2：上游没回「今天」那条（跨零点边界等）时，大号温度退回实况温度，不能空着
  wxMock._call = () => ({
    result: {
      ok: true,
      data: {
        chengdu: {
          realtime: { city: '成都市', weather: '多云', temperature: 22, wind: '东北风 2-3级', humidity: 60 },
          forecast: [{ date: '2020-01-01', week: '星期三', dayWeather: '多云', dayTemp: 25, nightTemp: 18 }],
        },
      },
    },
  });
  view = await fetchWeather(days);
  check('A2 今天不在 forecast 时退回实况温度', view && view.temp === '22℃', view && view.temp);
  check('A2 次行仍标着实况温度', view && /实况 22℃/.test(view.meta), view && view.meta);

  // 场景 B：出发日已进窗口，forecast 里含 9.25
  wxMock._call = () => ({
    result: {
      ok: true,
      data: {
        chengdu: {
          realtime: { city: '成都市', weather: '晴', temperature: 20, wind: '南风 1-2级', humidity: 45 },
          forecast: [{ date: '2026-09-25', week: '星期五', dayWeather: '多云', dayTemp: 24, nightTemp: 16 }],
        },
      },
    },
  });
  view = await fetchWeather(days);
  check('B hint 显示出发日具体天气', view && /出发日 9\.25/.test(view.hint) && /16~24℃/.test(view.hint), view && view.hint);
  console.log('        view =', JSON.stringify(view));

  // 场景 C：行程已结束
  const past = [
    { date: '2026-01-01', city: '成都' },
    { date: '2026-01-09', city: '成都' },
  ];
  view = await fetchWeather(past);
  check('C 行程结束后不展示', view === null, JSON.stringify(view));

  // 场景 D：云函数报 NO_KEY（还没配 Key 的状态）
  wxMock._call = () => ({ result: { ok: false, error: 'NO_KEY', message: '云函数缺少 QQMAP_KEY 环境变量' } });
  view = await fetchWeather(days);
  check('D 云函数报 NO_KEY 时不崩、返回 null', view === null, JSON.stringify(view));

  // 场景 E：callFunction 直接抛错（云函数没部署）
  wxMock._call = () => {
    throw new Error('FUNCTION_NOT_FOUND');
  };
  view = await fetchWeather(days);
  check('E 云函数不存在时不崩、返回 null', view === null, JSON.stringify(view));

  fs.unlinkSync(CJS);

  console.log('\n=== 三、未来七天 + 逐日预报 fetchWeekWeather ===');

  // 场景 F：原行程 9.25-10.3 全在今天起 7 天窗口之外。
  // 七天条照常给（整条按出发地成都），逐日卡那半边是空的。
  wxMock._call = () => ({
    result: {
      ok: true,
      data: {
        chengdu: {
          forecast: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
            date: dayKey(i),
            dayWeather: '多云',
            dayTemp: 25,
            nightTemp: 18,
          })),
        },
      },
    },
  });
  let bundle = await fetchWeekWeather(days);
  check('F 行程全在窗口外时仍返回 7 格', bundle && bundle.week.length === 7, JSON.stringify(bundle && bundle.week.length));
  check('F 行程全在窗口外时 daily 为空', bundle && Object.keys(bundle.daily).length === 0, JSON.stringify(bundle && bundle.daily));
  check(
    'F 窗口外的格子没有 DAY 徽标、城市回落到出发地',
    bundle && bundle.week.every((w) => !w.inTrip && !/DAY/.test(w.label) && w.city === '成都'),
    JSON.stringify(bundle && bundle.week.map((w) => w.label + '/' + w.city))
  );
  check(
    'F 首格标「今天」且 isToday',
    bundle && bundle.week[0].label === '今天' && bundle.week[0].isToday === true,
    JSON.stringify(bundle && bundle.week[0])
  );

  // 场景 G：构造 3 个窗口内的行程日、跨两个城市 → 七天条挂 DAY 徽标，逐日卡只取那几天
  const inWindowDays = [
    { date: dayKey(0), city: '成都' },
    { date: dayKey(1), city: '四姑娘山' },
    { date: dayKey(3), city: '成都' },
  ];
  wxMock._call = () => ({
    result: {
      ok: true,
      data: {
        chengdu: {
          forecast: [
            [0, '多云', 25, 18],
            [2, '晴', 27, 19],
            [3, '阵雨', 22, 16],
            [4, '阴', 24, 17],
            [5, '小雨', 21, 15],
            [6, '多云', 23, 16],
          ].map(([i, w, hi, lo]) => ({ date: dayKey(i), dayWeather: w, dayTemp: hi, nightTemp: lo })),
        },
        siguniang: { forecast: [{ date: dayKey(1), dayWeather: '晴', dayTemp: 20, nightTemp: 10 }] },
      },
    },
  });
  bundle = await fetchWeekWeather(inWindowDays);
  const week = bundle && bundle.week;
  const keys = bundle && Object.keys(bundle.daily).sort();
  check('G 返回 3 天逐日预报', keys && keys.length === 3, JSON.stringify(keys));
  check(
    'G 逐日温度区间「低~高℃」',
    bundle && bundle.daily[dayKey(0)].temp === '18~25℃',
    bundle && bundle.daily[dayKey(0)] && bundle.daily[dayKey(0)].temp
  );
  check('G 逐日文本带城市前缀', bundle && /四姑娘山/.test(bundle.daily[dayKey(1)].text), JSON.stringify(bundle && bundle.daily[dayKey(1)]));
  check('G 行程首格是 DAY1 · 今天', week && week[0].label === 'DAY1 · 今天', week && week[0].label);
  check(
    'G 第二天挂 DAY2 并换成四姑娘山',
    week && week[1].label === 'DAY2' && week[1].city === '四姑娘山',
    week && `${week[1].label}/${week[1].city}`
  );
  check('G 行程外那天只写星期、不挂 DAY', week && week[2].inTrip === false && week[2].label === week[2].wd, week && `${week[2].label}/${week[2].wd}`);
  check('G 逐日格子按自己那天的城市取温度', week && week[1].line.includes('10~20℃'), week && week[1].line);
  check(
    'G 天气与温度是两个独立字段（UI 靠它分两行渲染）',
    week && week[1].text === '晴' && week[1].temp === '10~20℃',
    week && `${week[1].text} / ${week[1].temp}`
  );
  check('G 行程外那天用出发地的预报', week && week[2].city === '成都' && /℃/.test(week[2].line), week && week[2].line);

  // 场景 H：白天=夜间时只写一遍，不出「多云转多云」这种废话
  wxMock._call = () => ({
    result: {
      ok: true,
      data: {
        chengdu: { forecast: [{ date: dayKey(0), dayWeather: '晴', nightWeather: '晴', dayTemp: 22, nightTemp: 14 }] },
      },
    },
  });
  bundle = await fetchWeekWeather([{ date: dayKey(0), city: '成都' }]);
  check('H 昼夜相同则只写一次', bundle && !/转/.test(bundle.week[0].line), bundle && bundle.week[0].line);

  // 场景 H2：上游同一列里「晴天」「晴」混着写，统一收成单字（9.13 那份真实响应就是「阵雨 / 晴天」）
  wxMock._call = () => ({
    result: {
      ok: true,
      data: {
        chengdu: {
          forecast: [{ date: dayKey(0), dayWeather: '阵雨', nightWeather: '晴天', dayTemp: 25, nightTemp: 17 }],
        },
      },
    },
  });
  bundle = await fetchWeekWeather([{ date: dayKey(0), city: '成都' }]);
  check('H2 「晴天」收成「晴」', bundle && bundle.week[0].line === '阵雨转晴 17~25℃', bundle && bundle.week[0].line);
  check(
    'H2 拆行后 text / temp 各自独立，温度单独可达',
    bundle && bundle.week[0].text === '阵雨转晴' && bundle.week[0].temp === '17~25℃',
    bundle && `${bundle.week[0].text} / ${bundle.week[0].temp}`
  );
  check('H2 逐日卡同一份文案', bundle && bundle.daily[dayKey(0)].text === '成都 · 阵雨转晴', bundle && bundle.daily[dayKey(0)].text);

  // 场景 H3：收尾规则不能误伤「多云」「小雨」这类本身没尾巴的词
  wxMock._call = () => ({
    result: {
      ok: true,
      data: { chengdu: { forecast: [{ date: dayKey(0), dayWeather: '多云', dayTemp: 25, nightTemp: 18 }] } },
    },
  });
  bundle = await fetchWeekWeather([{ date: dayKey(0), city: '成都' }]);
  check('H3 「多云」原样保留', bundle && bundle.week[0].text === '多云', bundle && bundle.week[0].text);

  // 场景 I：出发地不在 CITY_POINTS 映射里 → 无从查起 → 整块不展示
  wxMock._call = () => ({ result: { ok: true, data: {} } });
  bundle = await fetchWeekWeather([{ date: dayKey(0), city: '月球' }]);
  check('I 出发地不可映射时返回 null', bundle === null, JSON.stringify(bundle));

  // 场景 J：行程已结束（今天 > 最后一天）
  wxMock._call = () => ({ result: { ok: true, data: {} } });
  bundle = await fetchWeekWeather([{ date: '2026-01-01', city: '成都' }]);
  check('J 行程结束后整块下线', bundle === null, JSON.stringify(bundle));

  // 场景 K：云函数报 NO_KEY（还没配 Key）
  wxMock._call = () => ({ result: { ok: false, error: 'NO_KEY', message: '云函数缺少 QQMAP_KEY 环境变量' } });
  bundle = await fetchWeekWeather(inWindowDays);
  check('K 云函数 NO_KEY 时不崩、返回 null', bundle === null, JSON.stringify(bundle));

  // 场景 L：上游一天数据都没给 → 不渲染一条空架子
  wxMock._call = () => ({ result: { ok: true, data: { chengdu: { forecast: [] } } } });
  bundle = await fetchWeekWeather([{ date: dayKey(0), city: '成都' }]);
  check('L 七格全空时返回 null', bundle === null, JSON.stringify(bundle));

  console.log(`\n=== 汇总：PASS ${pass}  FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.log('脚本自身异常:', err && err.message);
  process.exit(1);
});
