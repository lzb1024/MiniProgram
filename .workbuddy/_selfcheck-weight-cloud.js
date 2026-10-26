// api/weight.js 自检（离线，假 wx + 假云数据库，不联网不 spawn）
//
// 云同步最容易错的是「什么时候用云端、什么时候用本机」，尤其是首次接入时
// 空云端会不会把本机数据吃掉。这里把几条关键路径都跑一遍。
// 跑法：node .workbuddy/_selfcheck-weight-cloud.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const W = require(path.join(ROOT, 'utils/weight'));
const SRC = fs.readFileSync(path.join(ROOT, 'api', 'weight.js'), 'utf8');

let bad = 0;
const ok = (m) => console.log('OK   ' + m);
const no = (m) => {
  bad++;
  console.log('FAIL ' + m);
};
const eq = (a, b, m) => (String(a) === String(b) ? ok(m + ' = ' + b) : no(m + ' 期望 ' + b + '，实际 ' + a));

/* ---------------- 假环境 ---------------- */

function makeEnv(opts) {
  const o = opts || {};
  const store = {};
  const docs = {};
  let setFails = !!o.setFails;

  const wx = {
    getStorageSync(k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : '';
    },
    setStorageSync(k, v) {
      store[k] = v;
    },
  };

  const serverDate = () => 'SERVER_DATE';

  const collection = (name) => ({
    doc(id) {
      return {
        async get() {
          if (o.getError) throw o.getError;
          if (!docs[id]) {
            const e = new Error('document.get:fail document not exists');
            e.errMsg = e.message;
            throw e;
          }
          return { data: docs[id] };
        },
        async set({ data }) {
          if (setFails) throw new Error('set not supported in this fake');
          docs[id] = Object.assign({ _id: id }, data);
          return { stats: { updated: 1 } };
        },
      };
    },
    async add({ data }) {
      if (!data || !data._id) throw new Error('add 需要自定义 _id');
      if (docs[data._id]) throw new Error('duplicate _id');
      docs[data._id] = data;
      return { _id: data._id };
    },
  });

  const cloudMod = {
    ensureCloud: () => (o.cloudOn === false ? false : true),
    database: () => ({ collection, serverDate }),
  };

  // api/weight.js 现在直接走 wx.cloud.database()（不再 require utils/cloud），
  // 「没配云环境」就表现为 database() 抛错
  if (o.cloudOn !== false) {
    wx.cloud = {
      database: () => {
        if (o.initFail) throw new Error('please call wx.cloud.init before use');
        return { collection, serverDate };
      },
    };
  }

  const sandbox = {
    module: { exports: {} },
    exports: {},
    require(p) {
      if (p.indexOf('utils/cloud') >= 0) throw new Error('api/weight.js 不该 require utils/cloud');
      if (p.indexOf('utils/weight') >= 0) return W;
      throw new Error('unexpected require ' + p);
    },
    wx,
    console: { log() {}, error() {}, warn() {} },
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Promise,
    setTimeout,
  };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'api/weight.js' });

  return { api: sandbox.module.exports, store, docs, setFailsTo(v) { setFails = v; } };
}

function rec(date, weight, bodyFat) {
  return { id: String(Date.parse(date)), date, weight, bodyFat: bodyFat === undefined ? null : bodyFat };
}

/* ---------------- ① 云关掉：纯本机 ---------------- */
(async () => {
  {
    const env = makeEnv({ cloudOn: false });
    env.store.weight_tracker_v2 = {
      version: 2,
      currentUser: 'ta',
      users: { me: [rec('2026-03-01', 160)], ta: [rec('2026-03-02', 120)] },
    };
    eq(env.api.isCloudOn(), false, '云关掉时 isCloudOn');
    const r = await env.api.fetchUsers();
    eq(r.online, false, '云关掉时 online');
    eq(W.totalCount(r.users), 2, '云关掉时用本机数据');
    eq(r.users.ta[0].weight, 120, '本机 TA 数据读得到');
  }

  /* ---------------- ② 首次接入：云端无文档，本机有货 → 反向迁移 ---------------- */
  {
    const env = makeEnv({});
    env.store.weight_tracker_v2 = {
      version: 2,
      currentUser: 'me',
      users: { me: [rec('2026-03-01', 160), rec('2026-03-02', 159)], ta: [rec('2026-03-02', 120)] },
    };
    const r = await env.api.fetchUsers();
    eq(r.online, true, '首次接入 online');
    eq(r.migrated, true, '首次接入标记 migrated');
    eq(W.totalCount(r.users), 3, '首次接入保留本机 3 条');
    eq(env.docs.weight_me ? env.docs.weight_me.records.length : -1, 2, '首次接入把 me 推到云端');
    eq(env.docs.weight_ta ? env.docs.weight_ta.records.length : -1, 1, '首次接入把 ta 推到云端');
  }

  /* ---------------- ③ 云端没文档、本机也空 → 就是空 ---------------- */
  {
    const env = makeEnv({});
    const r = await env.api.fetchUsers();
    eq(r.online, true, '空库 online');
    eq(W.totalCount(r.users), 0, '空库返回 0 条');
    eq(Object.keys(env.docs).length, 0, '空库不写云端（不自动灌数据）');
  }

  /* ---------------- ④ 云端有数据 → 以云端为准，本机多出来的先备份 ---------------- */
  {
    const env = makeEnv({});
    env.docs.weight_me = {
      _id: 'weight_me',
      uid: 'me',
      records: [rec('2026-06-01', 150), rec('2026-06-02', 149)],
    };
    env.docs.weight_ta = { _id: 'weight_ta', uid: 'ta', records: [] };
    env.store.weight_tracker_v2 = {
      version: 2,
      currentUser: 'me',
      users: { me: [rec('2026-06-01', 150), rec('2026-06-02', 149), rec('2026-06-03', 148)], ta: [] },
    };
    const r = await env.api.fetchUsers();
    eq(W.totalCount(r.users), 2, '以云端为准（2 条）');
    eq(env.store.weight_tracker_v2.users.me.length, 2, '本机缓存被云端覆盖');
    eq(env.store.weight_tracker_v2_bak ? env.store.weight_tracker_v2_bak.users.me.length : -1, 3, '覆盖前备份了 3 条');
  }

  /* ---------------- ⑤ 云端空数组（别处清空过）→ 不回落本机 ---------------- */
  {
    const env = makeEnv({});
    env.docs.weight_me = { _id: 'weight_me', uid: 'me', records: [] };
    env.docs.weight_ta = { _id: 'weight_ta', uid: 'ta', records: [] };
    env.store.weight_tracker_v2 = {
      version: 2,
      currentUser: 'me',
      users: { me: [rec('2026-06-01', 150)], ta: [] },
    };
    const r = await env.api.fetchUsers();
    eq(W.totalCount(r.users), 0, '云端空数组即空（不回落本机）');
    eq(env.store.weight_tracker_v2_bak.users.me.length, 1, '被清空前本机留了备份');
  }

  /* ---------------- ⑥ 写入：正常 / 失败 / set 不支持时回落 add ---------------- */
  {
    const env = makeEnv({});
    const r = await env.api.pushUser('me', [rec('2026-06-01', 150, 22.5), { id: 'x', date: '2026-06-02', weight: 149, bodyFat: null, extra: '不该进库' }]);
    eq(r.online, true, 'pushUser 成功 online');
    eq(env.docs.weight_me.records.length, 2, 'pushUser 写入 2 条');
    eq(env.docs.weight_me.records[1].extra, undefined, '入库前剔掉了多余字段');
    eq(env.docs.weight_me.records[0].id, String(Date.parse('2026-06-01')), '入库前 id 统一成字符串');
  }
  {
    const env = makeEnv({ cloudOn: false });
    const r = await env.api.pushUser('me', []);
    eq(r.online, false, '云关掉时 pushUser 返回 offline');
    eq(env.docs.weight_me, undefined, '云关掉时不写云端');
  }
  {
    const env = makeEnv({ setFails: true });
    const r = await env.api.pushUser('ta', [rec('2026-06-01', 120)]);
    eq(r.online, true, 'set 不支持时回落到 add');
    eq(env.docs.weight_ta.records.length, 1, 'add 兜底也写进去了');
  }

  /* ---------------- ⑦ 读云端抛错（权限 / 网络）→ 回落本机，不炸也不写库 ---------------- */
  {
    const permErr = new Error('document.get:fail -502003 database permission denied');
    permErr.errCode = -502003;
    permErr.errMsg = permErr.message;
    const env = makeEnv({ getError: permErr });
    env.store.weight_tracker_v2 = {
      version: 2,
      currentUser: 'me',
      users: { me: [rec('2026-06-01', 150)], ta: [] },
    };
    const r = await env.api.fetchUsers();
    eq(r.online, false, '权限被拒时 online=false');
    eq(r.reason, 'fail', '权限被拒时给出失败原因');
    eq(W.totalCount(r.users), 1, '权限被拒时用本机数据');
    eq(Object.keys(env.docs).length, 0, '权限被拒时不写云端');
  }

  /* ---------------- ⑧ 云端 records 不是数组 → 按空处理，不抛 ---------------- */
  {
    const env = makeEnv({});
    env.store.weight_tracker_v2 = {
      version: 2,
      currentUser: 'me',
      users: { me: [rec('2026-06-01', 150)], ta: [] },
    };
    env.docs.weight_me = { _id: 'weight_me', uid: 'me', records: 'not-an-array' };
    env.docs.weight_ta = { _id: 'weight_ta', uid: 'ta', records: [] };
    const r = await env.api.fetchUsers();
    eq(r.online, true, 'records 非数组时不抛错');
    eq(W.totalCount(r.users), 0, 'records 非数组当空处理');
  }

  /* ---------------- ⑨ 集合没建（-502005）不能当成「云端没初始化」 ---------------- */
  {
    const colErr = new Error('document.get:fail -502005 database collection not exists');
    colErr.errCode = -502005;
    colErr.errMsg = colErr.message;
    const env = makeEnv({ getError: colErr });
    env.store.weight_tracker_v2 = {
      version: 2,
      currentUser: 'me',
      users: { me: [rec('2026-06-01', 150), rec('2026-06-02', 149)], ta: [] },
    };
    const r = await env.api.fetchUsers();
    eq(r.online, false, '集合没建时 online=false');
    eq(W.totalCount(r.users), 2, '集合没建时照常读本机');
    eq(Object.keys(env.docs).length, 0, '集合没建时不去反向迁移写库');
  }

  /* ---------------- ⑨b 「文档不存在」的真机文案不能当读取失败 ---------------- */
  {
    // 小程序端缺文档抛的不是 DOCUMENT_NOT_FOUND，而是这句又长又绕的文本。
    // 2026-10-23 真机踩过：漏判 → 整条走 catch → 云明明是通的却显示「仅本机」。
    const real = new Error(
      'document.get:fail cannot find document with _id weight_me, please make sure that ' +
        'the document exists and you have the corresponding access permission'
    );
    real.errMsg = real.message;
    const env = makeEnv({ getError: real });
    const r = await env.api.fetchUsers();
    eq(r.online, true, '缺文档时不误判为读取失败');
    eq(W.totalCount(r.users), 0, '缺文档 + 本机空时返回空');
    eq(r.migrated, undefined, '缺文档 + 本机空时不标记 migrated');
  }
  {
    const real = new Error('document.get:fail cannot find document with _id weight_ta');
    real.errMsg = real.message;
    const env = makeEnv({ getError: real });
    env.store.weight_tracker_v2 = {
      version: 2,
      currentUser: 'me',
      users: { me: [rec('2026-07-01', 152)], ta: [rec('2026-07-02', 118)] },
    };
    const r = await env.api.fetchUsers();
    eq(r.online, true, '缺文档 + 本机有货 online');
    eq(r.migrated, true, '缺文档 + 本机有货标记 migrated');
    eq(Object.keys(env.docs).length, 2, '缺文档 + 本机有货补写两份文档');
  }

  /* ---------------- ⑩ 本机结构仍与导出/预览一致 ---------------- */
  {
    const env = makeEnv({});
    env.api.saveLocal({ me: [rec('2026-06-01', 150)], ta: [] }, 'ta');
    const saved = env.store.weight_tracker_v2;
    eq(saved.version, 2, '本机 version');
    eq(saved.currentUser, 'ta', '本机 currentUser');
    eq(saved.users.me.length, 1, '本机 users.me');
  }

  console.log(bad ? `\n${bad} 项失败` : '\n全部通过');
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error('自检抛错:', e && e.stack);
  process.exit(1);
});
