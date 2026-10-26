// api/weight.js — 体重记录：本机存储 + 云数据库同步
//
// 与行程三链（api/trip.js）不同，这里不是「一条记录一个文档」，而是「一个人一个文档」：
//   weight 集合里只有 weight_me / weight_ta 两份文档，records 是一个数组。
// 这么定的原因：
//   ① 体重会攒到几百上千条，按条存的话「清空 / 导入历史」要发上百次请求，
//      中途失败还会留下半份数据；整份存，一次读写就完成，失败也不脏。
//   ② 两个人各自在自己手机上记，写的是不同文档，不会互相覆盖。
// 代价：同一个人在两台手机上同时改，后写的会盖掉先写的（个人工具可接受）。
//
// 云不可用（没配环境 ID / 没网 / 集合没建 / 权限没开）一律安静回落本机，
// 页面显示「仅本机」，功能照常可用。
//
// 首次接入的迁移逻辑：云端两份文档都不存在 → 视为「云端还没初始化」，
// 把本机已有的记录推上去，不会被空云端覆盖。文档存在但 records 为空
// （用户在别的设备上清空过）→ 以云端为准，覆盖前先把本机留一份到 _bak。
//
// 需要在云开发控制台建好 weight 集合，权限选「自定义安全规则」填
// {"read": true, "write": true}，否则读会 -502003 拒绝。
//
// 这里刻意**不 require utils/cloud.js**：那个文件是 ESM（export function），本文件是 CJS，
// 跨风格 require 在个别工具链上会拿不到导出，页面会直接白屏。云环境本来就在
// app.js 的 onLaunch 里按 config.cloudEnv 初始化过了，这里只需要探一下能不能拿到库。
// 引用走 ~/ 别名（app.json 的 resolveAlias "~/*": "/*"），与 pages/home 等一致。
// 别改回 ../../utils/weight：开发者工具对相对路径 + 新增文件的索引出过 bug，
// 会报「can not find module : , require args is ...」（模块名空），白屏。
const W = require('~/utils/weight');

const COLLECTION = 'weight';
const LOCAL_KEY = 'weight_tracker_v2';
const LOCAL_BAK = 'weight_tracker_v2_bak';
const LOCAL_VER = 2;

/** 一人一份文档，_id 固定，便于 set 覆盖写 */
const DOC_ID = { me: 'weight_me', ta: 'weight_ta' };

/* ------------------------------ 本机 ------------------------------ */

/** → { currentUser, users } */
function loadLocal() {
  let raw = null;
  try {
    raw = wx.getStorageSync(LOCAL_KEY);
  } catch (err) {
    raw = null;
  }
  return {
    currentUser: raw && raw.currentUser === 'ta' ? 'ta' : 'me',
    users: W.normalize(raw),
  };
}

function saveLocal(users, currentUser) {
  try {
    wx.setStorageSync(LOCAL_KEY, {
      version: LOCAL_VER,
      currentUser: currentUser === 'ta' ? 'ta' : 'me',
      users: { me: (users && users.me) || [], ta: (users && users.ta) || [] },
    });
  } catch (err) {
    console.error('[weight] 本机写入失败', err);
  }
}

/**
 * 云端数据明显比本机少时，覆盖前把本机存一份。
 * 不做自动恢复（怕把用户后来删掉的记录又灌回来），只是个兜底出口。
 */
function backupLocal(users, currentUser) {
  try {
    wx.setStorageSync(LOCAL_BAK, {
      savedAt: Date.now(),
      currentUser,
      users: { me: (users && users.me) || [], ta: (users && users.ta) || [] },
    });
  } catch (err) {
    // 备份失败不影响主流程
  }
}

/* ------------------------------ 云端 ------------------------------ */

/** null = 还没探过 / true = 可用 / false = 不可用（探一次就定，避免每次操作都试错） */
let cloudReady = null;

/**
 * 云库能不能用。
 * 环境在 app.js 启动时已按 config.cloudEnv 初始化；没配环境时 init 会跳过，
 * 这里 wx.cloud.database() 就会抛错，于是安静返回 false，功能回落本机。
 */
function isCloudOn() {
  if (cloudReady !== null) return cloudReady;
  cloudReady = false;
  try {
    if (typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.database === 'function') {
      cloudReady = !!wx.cloud.database();
    }
  } catch (err) {
    console.warn('[weight] 云开发不可用（没配环境 ID 或未初始化），回落本机', err);
    cloudReady = false;
  }
  return cloudReady;
}

function database() {
  return isCloudOn() ? wx.cloud.database() : null;
}

/** 只留入库需要的字段，别把页面上的临时字段带进云库 */
function slim(r) {
  return {
    id: String(r.id),
    date: r.date,
    weight: r.weight,
    bodyFat: r.bodyFat === undefined ? null : r.bodyFat,
  };
}

/** 文档不存在不算错（首次使用就是没文档），其余错误要往上抛 */
function isMissingDoc(err) {
  const msg = String((err && (err.errMsg || err.message)) || '');
  const code = err && err.errCode;
  // 集合本身没建（-502005）不能当成「文档为空」，否则会被误判成云端没初始化去反向迁移
  if (/collection/i.test(msg) || code === -502005) return false;
  // ⚠️ 小程序端「文档不存在」抛的不是 DOCUMENT_NOT_FOUND，而是一句很绕的文本：
  //   document.get:fail cannot find document with _id weight_me, please make sure
  //   that the document exists and you have the corresponding access permission
  // 只按 not exist 匹配会漏（那句话里只有 exists），必须显式认 cannot find document。
  if (/cannot find document/i.test(msg)) return true;
  return code === 'DOCUMENT_NOT_FOUND' || /not exist|doesn't exist|不存在/i.test(msg);
}

/** → { exists, records } */
async function readDoc(user) {
  const db = database();
  try {
    const res = await db.collection(COLLECTION).doc(DOC_ID[user]).get();
    const data = (res && res.data) || {};
    return { exists: true, records: Array.isArray(data.records) ? data.records : [] };
  } catch (err) {
    if (isMissingDoc(err)) return { exists: false, records: [] };
    throw err;
  }
}

async function writeDoc(db, user, records) {
  const id = DOC_ID[user];
  const data = {
    uid: user,
    records: (records || []).map(slim),
    updatedAt: db.serverDate(),
  };
  try {
    // 有就覆盖、没有就创建（_id 固定，所以永远不会出现第二份）
    await db.collection(COLLECTION).doc(id).set({ data });
  } catch (err) {
    // 个别基础库上 doc().set() 建不了新文档，退一步用带自定义 _id 的 add
    await db.collection(COLLECTION).add({ data: Object.assign({ _id: id }, data) });
  }
}

/* ------------------------------ 对外 ------------------------------ */

/**
 * 拉取两个人的记录：云优先，失败回落本机。
 * @returns {Promise<{users:{me:Array,ta:Array}, online:boolean, reason?:string, migrated?:boolean}>}
 */
async function fetchUsers() {
  const local = loadLocal();

  if (!isCloudOn()) {
    return { users: local.users, online: false, reason: 'noenv' };
  }

  try {
    const db = database();
    const [me, ta] = await Promise.all([readDoc('me'), readDoc('ta')]);

    // 两份文档都不存在 = 云端还没初始化过
    if (!me.exists && !ta.exists) {
      if (W.totalCount(local.users)) {
        // 首次接入：把本机已有的搬上去，别让空云端把本机覆盖掉
        await Promise.all([writeDoc(db, 'me', local.users.me), writeDoc(db, 'ta', local.users.ta)]);
        return { users: local.users, online: true, migrated: true };
      }
      return { users: { me: [], ta: [] }, online: true };
    }

    const users = W.normalize({ users: { me: me.records, ta: ta.records } });
    if (W.totalCount(local.users) > W.totalCount(users)) backupLocal(local.users, local.currentUser);
    saveLocal(users, local.currentUser);
    return { users, online: true };
  } catch (err) {
    console.error('[weight] 云端读取失败，已回落到本机（检查 weight 集合是否已建、权限是否放开）', err);
    return { users: local.users, online: false, reason: 'fail' };
  }
}

/**
 * 把某个人的整份记录写到云端。
 * @returns {Promise<{online:boolean, reason?:string}>}
 */
async function pushUser(user, records) {
  const uid = user === 'ta' ? 'ta' : 'me';
  if (!isCloudOn()) return { online: false, reason: 'noenv' };

  try {
    const db = database();
    await writeDoc(db, uid, records);
    return { online: true };
  } catch (err) {
    console.error('[weight] 云端写入失败，本次只存了本机', err);
    return { online: false, reason: 'fail' };
  }
}

/** 两个人的都推（导入历史 / 清空时用） */
async function pushAll(users) {
  const [a, b] = await Promise.all([
    pushUser('me', (users && users.me) || []),
    pushUser('ta', (users && users.ta) || []),
  ]);
  return { online: a.online && b.online, reason: a.online && b.online ? '' : 'fail' };
}

module.exports = {
  COLLECTION,
  LOCAL_KEY,
  LOCAL_BAK,
  isCloudOn,
  loadLocal,
  saveLocal,
  backupLocal,
  fetchUsers,
  pushUser,
  pushAll,
};
