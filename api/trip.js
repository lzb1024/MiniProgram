// api/trip.js
// 「物品准备」共享清单、「花费统计」共享记账、「交通记录」共享记录的读写。
//
// 三条链路共用同一套机制：
//   1) 配了云开发环境 ID（config.cloudEnv 非空）→ 走云数据库，同行人共享同一份数据；
//   2) 没配 → 安静回落到本机 storage，功能完全可用，只是不同步给其他人。
// 所有函数都返回 { list, online }，页面据此显示「已同步 / 仅本机」。
//
// 注意：走云开发时要在控制台建好 packing / costs / traffic 三个集合，
// 权限都选「自定义安全规则」并填 {"read": true, "write": true}，否则读会 -502003 拒绝。
//
// ============================ 多行程隔离（2026-10-07） ============================
// 小程序改成综合版后有多趟行程（川西、长沙…），三样数据必须各行程独立，
// 否则长沙的机票账单会混进川西的统计里。所有函数因此都多了一个 tripId 形参：
//   - 云端：三个集合各加一个 tripId 字段，写入时带上，读取时按它过滤；
//   - 本机：storage key 从 trip_packing 改成 trip_packing_{tripId}。
//
// 【老数据不用重导】导入进云库的旧记录没有 tripId 字段。为了让川西那份既有的
// 36 件物品 / 11 笔账继续照常显示，这里把 DEFAULT_TRIP（川西）特殊对待：
// 它读**不带 where 过滤**，取回后再在内存里筛「tripId 等于自己 **或** 压根没有
// tripId」，于是旧记录自动归属川西，新记录带 tripId 也不会被误算给别人。
// 非默认行程（长沙）则严格 where tripId，不会碰到任何无主记录。
// 想让某条记录换行程，直接在控制台给它补一个 tripId 字段即可，不用改代码。
import { ensureCloud, database } from '~/utils/cloud';

const PACKING_COLLECTION = 'packing';
const COST_COLLECTION = 'costs';
const TRAFFIC_COLLECTION = 'traffic';

/**
 * 默认行程（也是唯一能读到「无 tripId 老数据」的行程）。
 * 换成别的行程要读老数据，把它的 id 也加进来 —— 但注意多个行程共享同一批无主
 * 记录会串，所以设计上只给一个。
 */
const DEFAULT_TRIP = 'chuanxi';

const LOCAL_PACKING = 'trip_packing';
const LOCAL_COSTS = 'trip_costs';
const LOCAL_TRAFFIC = 'trip_traffic';

/** 本机 storage key 按行程拆开；本模块的调用方总会传 tripId，缺省兜到默认行程 */
function localKey(base, tripId) {
  return `${base}_${tripId || DEFAULT_TRIP}`;
}

/* 小程序端单次 get 上限 20 条，超出就得翻页；MAX_ROWS 是防御上限，避免异常数据把页面拖死 */
const PAGE_SIZE = 20;
const MAX_ROWS = 200;

/* ------------------------------ 工具 ------------------------------ */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function readLocal(key) {
  try {
    const list = wx.getStorageSync(key);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function writeLocal(key, list) {
  try {
    wx.setStorageSync(key, list);
  } catch (err) {
    console.error('[trip] 本机写入失败', err);
  }
}

/**
 * 拉取整张表。
 * 小程序端单次 get 上限 20 条，九天行程的记账很容易超过，早先只拉一页会
 * 静默丢掉最新几笔（而且 orderBy 是 asc，丢的正好是刚记的那几条），所以这里翻页拉全。
 * 失败返回 null，调用方据此回落到本机。
 *
 * tripId 只有非默认行程才下推到 where（默认行程要连老数据一起读，见文件头说明），
 * 默认行程靠 filterByTrip 在内存里筛。
 */
async function cloudGet(collection, orderField, tripId, limit = MAX_ROWS) {
  try {
    const db = database();
    const total = Math.min(limit, MAX_ROWS);
    const list = [];
    // 默认行程不加 where：老记录没有 tripId 字段，加了就等于把它们全丢掉
    const scoped = tripId && tripId !== DEFAULT_TRIP;

    for (let skip = 0; skip < total; skip += PAGE_SIZE) {
      let chain = db.collection(collection);
      if (scoped) chain = chain.where({ tripId });
      const res = await chain
        .orderBy(orderField, 'asc')
        .skip(skip)
        .limit(Math.min(PAGE_SIZE, total - skip))
        .get();

      const rows = (res && res.data) || [];
      list.push(...rows);
      // 不满一页说明后面没有了，提前收工
      if (rows.length < PAGE_SIZE) break;
    }

    return filterByTrip(list, tripId);
  } catch (err) {
    console.error(`[trip] 读取 ${collection} 失败（检查集合是否已建、权限是否放开）`, err);
    return null;
  }
}

/**
 * 按行程筛行。缺 tripId 的行归默认行程所有 —— 这样导入进云库的旧数据
 * （导入时还没有行程概念）会自动落到川西上，不需要用户重新导一遍。
 */
function filterByTrip(list, tripId) {
  const mine = tripId || DEFAULT_TRIP;
  if (mine === DEFAULT_TRIP) {
    return list.filter((it) => !it.tripId || it.tripId === DEFAULT_TRIP);
  }
  return list.filter((it) => it.tripId === mine);
}

/* --------------------------- 物品准备清单 --------------------------- */

// 分类白名单，与 mock/trips/{行程id}.js 的 packing.groups 一致；防止脏分类进库
let PACKING_GROUPS = ['药品', '必要品', '生活品', '其他'];
export function setPackingGroups(list) {
  if (Array.isArray(list) && list.length) PACKING_GROUPS = list;
}

/** 分类兜底：不在白名单里的（比如加分类之前存的老数据）统一归最后一类 */
function normGroup(group) {
  const g = String(group == null ? '' : group).trim();
  if (PACKING_GROUPS.indexOf(g) >= 0) return g;
  return PACKING_GROUPS[PACKING_GROUPS.length - 1];
}

/**
 * 拉取打包清单。
 * 云端「空就是空」：云库的初值由工作区根的 `packing-import.json` 在云开发控制台手动导入
 * （写法见 MEMORY-detail 的「云数据库」一节），代码不再自动补数据，
 * 否则用户把清单一件件删空之后，下次打开又会自己长回来。
 * 只有没配云环境时，才用 mock 的 preset 在本机灌一次，免得进来是个空壳。
 */
export async function fetchPacking(tripId, preset = []) {
  const key = localKey(LOCAL_PACKING, tripId);

  if (ensureCloud()) {
    const list = await cloudGet(PACKING_COLLECTION, 'createdAt', tripId);
    if (list) return { list, online: true };
  }

  let list = readLocal(key);
  if (!list.length && preset.length) {
    list = preset.map((it) => ({
      id: uid(),
      name: it.name,
      group: normGroup(it.group),
      done: !!it.done,
      who: '预设',
      createdAt: Date.now(),
    }));
    writeLocal(key, list);
  }
  return { list, online: false };
}

export async function addPacking(tripId, name, group) {
  const key = localKey(LOCAL_PACKING, tripId);
  const item = { name, group: normGroup(group), who: '同行人', done: false, tripId };

  if (ensureCloud()) {
    try {
      const db = database();
      await db.collection(PACKING_COLLECTION).add({
        data: { ...item, createdAt: db.serverDate() },
      });
      return { online: true };
    } catch (err) {
      console.error('[trip] 新增物品失败，已回落到本机', err);
    }
  }

  const list = readLocal(key);
  list.push({ ...item, id: uid(), createdAt: Date.now() });
  writeLocal(key, list);
  return { online: false };
}

export async function togglePacking(tripId, id, done) {
  if (ensureCloud()) {
    try {
      await database()
        .collection(PACKING_COLLECTION)
        .doc(id)
        .update({ data: { done } });
      return { online: true };
    } catch (err) {
      console.error('[trip] 勾选物品失败，已回落到本机', err);
    }
  }

  const key = localKey(LOCAL_PACKING, tripId);
  const list = readLocal(key).map((it) => (it.id === id ? { ...it, done } : it));
  writeLocal(key, list);
  return { online: false };
}

export async function removePacking(tripId, id) {
  if (ensureCloud()) {
    try {
      await database().collection(PACKING_COLLECTION).doc(id).remove();
      return { online: true };
    } catch (err) {
      console.error('[trip] 删除物品失败，已回落到本机', err);
    }
  }

  const key = localKey(LOCAL_PACKING, tripId);
  writeLocal(
    key,
    readLocal(key).filter((it) => it.id !== id)
  );
  return { online: false };
}

/* ---------------------------- 花费统计 ---------------------------- */

/** 分类白名单，与 mock 里的 costs.categories 一致；防止脏分类进库 */
let CATEGORIES = ['机票', '高铁', '当地交通', '门票', '住宿', '餐饮', '其他'];
export function setCostCategories(list) {
  if (Array.isArray(list) && list.length) CATEGORIES = list;
}

export async function fetchCosts(tripId) {
  if (ensureCloud()) {
    const list = await cloudGet(COST_COLLECTION, 'createdAt', tripId);
    if (list) return { list, online: true };
  }
  return { list: readLocal(localKey(LOCAL_COSTS, tripId)), online: false };
}

export async function addCost(tripId, { amount, note, category }) {
  const num = Math.round(Number(amount) * 100) / 100;
  if (!isFinite(num) || num <= 0 || num > 999999) {
    throw new Error('金额需为 0 至 999999 之间的数字');
  }
  const text = String(note || '').trim();
  if (!text) throw new Error('请填写用途');
  if (text.length > 30) throw new Error('用途最多 30 个字');
  const cat = CATEGORIES.indexOf(category) === -1 ? '其他' : category;

  const item = { amount: num, note: text, category: cat, who: '同行人', tripId };

  if (ensureCloud()) {
    try {
      const db = database();
      await db.collection(COST_COLLECTION).add({
        data: { ...item, createdAt: db.serverDate() },
      });
      return { online: true };
    } catch (err) {
      console.error('[trip] 记账失败，已回落到本机', err);
    }
  }

  const key = localKey(LOCAL_COSTS, tripId);
  const list = readLocal(key);
  list.push({ ...item, id: uid(), createdAt: Date.now() });
  writeLocal(key, list);
  return { online: false };
}

export async function removeCost(tripId, id) {
  if (ensureCloud()) {
    try {
      await database().collection(COST_COLLECTION).doc(id).remove();
      return { online: true };
    } catch (err) {
      console.error('[trip] 删除记录失败，已回落到本机', err);
    }
  }

  const key = localKey(LOCAL_COSTS, tripId);
  writeLocal(
    key,
    readLocal(key).filter((it) => it.id !== id)
  );
  return { online: false };
}

/* ---------------------------- 交通记录 ---------------------------- */

// 交通方式白名单，与 mock/trips/{行程id}.js 的 traffic.modes 一致；防止脏值进库
const TRAFFIC_MODES = ['飞机', '动车', '大巴', '打车', '地铁', '其他'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/*
 * 「来源」是自由文本，但两种填法要分开处理：
 *   - 写名称（12306 / 携程 / 某个小程序）→ 只当文字展示，没有跳转入口；
 *   - 粘微信「… → 复制链接」得到的小程序链接（形如 #小程序://名称/页面/短码）
 *     → 名称解析出来当文字，原链接留下来给 wx.navigateToMiniProgram 的 shortLink 用。
 * 传 shortLink 就不需要 appId（基础库 2.18.1+），所以这里不用维护任何 appid 映射表，
 * 用户粘什么就跳什么。解析放在这一层，页面与预览都只认解析后的两个字段。
 */
// 特意不加 ^ 锚点：链接常常夹在一整条聊天消息里被一起复制过来，
// 要求严格开头的话这一整段会被当成「来源名称」，跳转入口直接不出来（2026-09-15 修）
const MP_LINK_RE = /#\s*小程序\s*:\/\//;

function parseSource(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return { src: '', link: '' };

  const at = text.search(MP_LINK_RE);
  if (at < 0) return { src: text, link: '' };

  /*
   * 两种粘贴姿势要分开切：
   *   - 在小程序里「… → 复制链接」→ 整段就是链接。原样留下，名称里万一有空格也不会被切坏；
   *   - 从聊天记录里连文字一起复制 → 从 #小程序:// 起按空白切出第一个 token，
   *     免得尾巴上拖着「挺好用」「你看看」之类的话让链接失效。
   */
  const link =
    at === 0 ? text.split('\n')[0].trim() : text.slice(at).split(/\s+/)[0];

  const rest = link.replace(MP_LINK_RE, '');
  const name = (rest.split('/')[0] || '').trim();
  // 只拿到「#小程序://」这种半截链接时，至少别把名称留空，否则列表里只有一个孤零零的按钮
  return { src: name || '小程序', link };
}

export async function fetchTraffic(tripId) {
  if (ensureCloud()) {
    const list = await cloudGet(TRAFFIC_COLLECTION, 'createdAt', tripId);
    if (list) return { list, online: true };
  }
  return { list: readLocal(localKey(LOCAL_TRAFFIC, tripId)), online: false };
}

/**
 * 记一笔交通。
 * date / time 是必填的「排序依据」——页面靠它把这条插进对应那一天的时间线里，
 * 所以格式卡死；起止与班次号至少填一项，否则这条记录只剩一个时间点、没有内容。
 * src 可留空；是链接的话由 parseSource 拆成 src + link 两个字段再入库。
 */
export async function addTraffic(tripId, { date, time, mode, from, to, no, src }) {
  const d = String(date || '').trim();
  const tm = String(time || '').trim();
  if (!DATE_RE.test(d)) throw new Error('请选择日期');
  if (!TIME_RE.test(tm)) throw new Error('请选择时间');

  const f = String(from || '').trim();
  const t = String(to || '').trim();
  const n = String(no || '').trim();
  if (!f && !t && !n) throw new Error('出发地、到达地、班次号至少填一项');
  if (f.length > 20 || t.length > 20 || n.length > 20) throw new Error('每项最多 20 个字');

  const { src: s, link } = parseSource(src);
  // 粘链接时 s 是解析出的名称，正常很短；写成长段文字才会撞到这条
  if (s.length > 30) throw new Error('来源最多 30 个字');

  const item = {
    date: d,
    time: tm,
    mode: TRAFFIC_MODES.indexOf(mode) === -1 ? '其他' : mode,
    from: f,
    to: t,
    no: n,
    src: s,
    link,
    who: '同行人',
    tripId,
  };

  if (ensureCloud()) {
    try {
      const db = database();
      await db.collection(TRAFFIC_COLLECTION).add({
        data: { ...item, createdAt: db.serverDate() },
      });
      return { online: true };
    } catch (err) {
      console.error('[trip] 记录交通失败，已回落到本机', err);
    }
  }

  const key = localKey(LOCAL_TRAFFIC, tripId);
  const list = readLocal(key);
  list.push({ ...item, id: uid(), createdAt: Date.now() });
  writeLocal(key, list);
  return { online: false };
}

export async function removeTraffic(tripId, id) {
  if (ensureCloud()) {
    try {
      await database().collection(TRAFFIC_COLLECTION).doc(id).remove();
      return { online: true };
    } catch (err) {
      console.error('[trip] 删除交通记录失败，已回落到本机', err);
    }
  }

  const key = localKey(LOCAL_TRAFFIC, tripId);
  writeLocal(
    key,
    readLocal(key).filter((it) => it.id !== id)
  );
  return { online: false };
}
