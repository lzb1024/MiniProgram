// cloudfunctions/weather/index.js
// 腾讯位置服务「天气」接口的服务端中转。
//
// 为什么要中转，而不是小程序里直接 wx.request：
//   1) wx.request 的目标域名必须进 request 合法域名白名单，小程序端改一次要过一遍后台；
//   2) Key 会随小程序包下发，反编译就能拿到，签名用的 SK 也得下发，等于没保护。
//   云函数跑在服务端，Key 只留在云端，两个问题一起解决。
//
// 入参：{ points: [{ key: 'chengdu', location: '30.657,104.066' }], getMd: 0 | 1 }
//   最多 6 个点；location 是「纬度,经度」，与官方文档一致。
//   getMd: 0 = 当天 + 未来 3 天，1 = 当天 + 未来 6 天（接口的硬上限就是 7 天）。
// 出参：{ ok: true, updatedAt, data: { [key]: { realtime, forecast } }, errors: [] }
const https = require('https');

const HOST = 'apis.map.qq.com';
const PATH = '/ws/weather/v1/';

/**
 * 开发密钥。优先读云函数环境变量，这样换 Key 只要在云开发控制台改一下，
 * 不用重新上传部署代码。留空时接口会直接返回 NO_KEY，前端静默不渲染天气条。
 */
const MAP_KEY = process.env.QQMAP_KEY || '';

const MAX_POINTS = 6;

/**
 * 上游有时把 realtime / infos 包成只含一项的数组，有时直接给对象，
 * 两种形态都兼容，统一取出第一个可用值。
 * （官方文档把这两个字段标注成 "array of object"，实际返回过对象形态，
 *   这里不赌哪一种，两种都认。）
 */
function unwrap(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

/** 只保留页面要用的字段，省掉云函数与小程序之间的传输量 */
function pickRealtime(result) {
  const r = unwrap(result && result.realtime);
  const info = unwrap(r && r.infos);
  if (!info) return null;
  return {
    province: r.province || '',
    city: r.city || '',
    district: r.district || '',
    weather: info.weather || '',
    temperature: typeof info.temperature === 'number' ? info.temperature : null,
    wind: [info.wind_direction, info.wind_power].filter(Boolean).join(' '),
    humidity: typeof info.humidity === 'number' ? info.humidity : null,
    updateTime: r.update_time || '',
  };
}

function pickForecast(result, days) {
  const f = unwrap(result && result.forecast);
  if (!f) return [];
  const infos = Array.isArray(f.infos) ? f.infos : f.infos ? [f.infos] : [];
  return infos.slice(0, days).map((d) => {
    const day = unwrap(d && d.day);
    const night = unwrap(d && d.night);
    return {
      date: d.date || '',
      week: d.week || '',
      dayWeather: (day && day.weather) || '',
      dayTemp: day && typeof day.temperature === 'number' ? day.temperature : null,
      nightWeather: (night && night.weather) || '',
      nightTemp: night && typeof night.temperature === 'number' ? night.temperature : null,
    };
  });
}

/**
 * 解析失败时把上游实际给的结构描出来，方便直接在日志里对号入座。
 * 例：result{realtime[1] forecast[1]} 表示 result 下有两键，且都是数组。
 */
function shapeOf(res) {
  const r = res && res.result;
  if (!r) return 'no-result';
  if (Array.isArray(r)) return `result[${r.length}]`;
  return `result{${Object.keys(r)
    .map((k) => {
      const v = r[k];
      if (Array.isArray(v)) return `${k}[${v.length}]`;
      if (v && typeof v === 'object') return `${k}{}`;
      return `${k}:${v === null ? 'null' : typeof v}`;
    })
    .join(' ')}}`;
}

/** 一次 GET。任何异常都收敛成 { status: -1 }，绝不抛出去让云函数整体失败 */
function get(params) {
  return new Promise((resolve) => {
    const query = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
      .map((k) => `${k}=${encodeURIComponent(params[k])}`)
      .join('&');

    const req = https.get({ host: HOST, path: `${PATH}?${query}`, timeout: 6000 }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          resolve({ status: -1, message: '上游返回不是合法 JSON' });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: -1, message: '上游请求超时' });
    });
    req.on('error', (err) => resolve({ status: -1, message: err.message || '网络错误' }));
  });
}

exports.main = async (event) => {
  if (!MAP_KEY) {
    return {
      ok: false,
      error: 'NO_KEY',
      message: '云函数缺少 QQMAP_KEY 环境变量，请到云开发控制台补上并重新部署',
    };
  }

  const points = (event && Array.isArray(event.points) ? event.points : [])
    .filter((p) => p && p.key && p.location)
    .slice(0, MAX_POINTS);

  if (!points.length) {
    return { ok: false, error: 'NO_POINTS', message: '没有传入可用的查询地点' };
  }

  const getMd = Number(event && event.getMd) === 1 ? 1 : 0;
  const forecastDays = getMd === 1 ? 7 : 4;

  const data = {};
  const errors = [];

  // 同一个地点的「实况 + 预报」两条查询并行发，省一次往返；
  // 地点之间保持串行，避免瞬时并发过高被上游判成异常流量
  for (let i = 0; i < points.length; i++) {
    const { key, location } = points[i];

    const [nowRes, futureRes] = await Promise.all([
      get({ key: MAP_KEY, location, type: 'now' }),
      get({ key: MAP_KEY, location, type: 'future', get_md: getMd }),
    ]);

    const realtime = nowRes.status === 0 ? pickRealtime(nowRes.result) : null;
    const forecast =
      futureRes.status === 0 ? pickForecast(futureRes.result, forecastDays) : [];

    if (!realtime && !forecast.length) {
      // 两种都没解析出来：多半是上游结构又变了，把真实形状一起带进日志
      errors.push(`${key}:${nowRes.status}/${futureRes.status} ${shapeOf(nowRes)} ${shapeOf(futureRes)}`);
      continue;
    }
    if (nowRes.status !== 0) errors.push(`${key}:now:${nowRes.status}`);
    if (futureRes.status !== 0) errors.push(`${key}:future:${futureRes.status}`);

    data[key] = { realtime, forecast };
  }

  if (!Object.keys(data).length) {
    return {
      ok: false,
      error: 'UPSTREAM',
      message: errors.join(' , ') || '上游没有返回可用数据',
    };
  }

  return { ok: true, updatedAt: Date.now(), data, errors };
};
