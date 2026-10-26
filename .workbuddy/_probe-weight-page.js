// 体重页冒烟测试（离线）：假 Page + 假 wx + 假云库，把生命周期和所有交互跑一遍
//
// 白屏 = 页面 JS 在加载期或 onLoad 里抛错。这个脚本就是为了在不开开发者工具的前提下
// 把那条路走一遍，报错会连栈一起打出来。
// 跑法：node .workbuddy/_probe-weight-page.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const W = require(path.join(ROOT, 'utils/weight'));
const CH = require(path.join(ROOT, 'utils/weight-chart'));

let bad = 0;
const ok = (m) => console.log('OK   ' + m);
const no = (m) => {
  bad++;
  console.log('FAIL ' + m);
};
const eq = (a, b, m) => (String(a) === String(b) ? ok(m + ' = ' + b) : no(m + ' 期望 ' + b + '，实际 ' + a));

/* ---------------- 假 wx ---------------- */

const store = {};
const calls = { toast: [], modal: [], clipboard: '' };

function makeCtx() {
  const noop = () => {};
  return {
    clearRect: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    stroke: noop, fill: noop, arc: noop, fillText: noop, setTransform: noop, scale: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
  };
}

const canvasNode = { width: 0, height: 0, getContext: () => makeCtx() };

/* 假云库：api/weight.js 现在直接走 wx.cloud.database()，不再 require utils/cloud */
const cloudDocs = {};
const serverDate = () => 'SERVER_DATE';

const cloudCollection = () => ({
  doc(id) {
    return {
      async get() {
        if (!cloudDocs[id]) {
          const e = new Error('document.get:fail document not exists');
          e.errMsg = e.message;
          throw e;
        }
        return { data: cloudDocs[id] };
      },
      async set({ data }) {
        cloudDocs[id] = Object.assign({ _id: id }, data);
      },
    };
  },
  async add({ data }) {
    cloudDocs[data._id] = data;
  },
});

const wx = {
  cloud: { database: () => ({ collection: cloudCollection, serverDate }) },
  getStorageSync: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ''),
  setStorageSync: (k, v) => {
    store[k] = v;
  },
  getWindowInfo: () => ({ statusBarHeight: 44, pixelRatio: 2, windowWidth: 375, windowHeight: 667 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, pixelRatio: 2 }),
  showToast: (o) => calls.toast.push(o.title),
  showModal: (o) => {
    calls.modal.push(o.title);
    if (o.success) o.success({ confirm: true, cancel: false });
  },
  setClipboardData: (o) => {
    calls.clipboard = o.data;
    if (o.success) o.success({});
  },
  getClipboardData: (o) => o.success({ data: calls.clipboard }),
  pageScrollTo: () => {},
  navigateBack: () => {},
  switchTab: () => {},
  shareFileMessage: (o) => {
    if (o.fail) o.fail({ errMsg: 'shareFileMessage:fail mock' });
  },
  env: { USER_DATA_PATH: '/mock' },
  getFileSystemManager: () => ({ writeFileSync: () => {} }),
  createSelectorQuery: () => ({
    select: () => ({
      fields: () => ({ exec: (cb) => cb([{ node: canvasNode, width: 343, height: 210 }]) }),
      boundingClientRect: () => ({
        selectViewport: () => ({ scrollOffset: () => ({ exec: (cb) => cb([{ top: 300 }, { scrollTop: 0 }]) }) }),
      }),
    }),
  }),
};

/* ---------------- 加载模块 ---------------- */

const docs = cloudDocs;

function load(file, extra) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const mod = { exports: {} };
  const sandbox = Object.assign(
    {
      module: mod,
      exports: mod.exports,
      require(p) {
        // api/weight.js 不该再 require utils/cloud（那是 ESM，跨风格 require 可能拿不到导出）
        if (/utils\/cloud/.test(p)) throw new Error('api/weight.js 不该 require utils/cloud');
        if (/utils\/weight-chart$/.test(p)) return CH;
        if (/utils\/weight$/.test(p)) return W;
        if (/api\/weight$/.test(p)) return extra.api;
        throw new Error('unexpected require: ' + p);
      },
      wx,
      console: { log() {}, error() {}, warn() {} },
      Date,
      JSON,
      Math,
      Object,
      Array,
      String,
      Number,
      Boolean,
      Promise,
      setTimeout,
      Error,
    },
    extra.globals || {},
  );
  sandbox.exports = mod.exports;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: file });
  return mod.exports;
}

const api = load('api/weight.js', {});

/* ---------------- 假 Page ---------------- */

let cfg = null;
const pageSrc = fs.readFileSync(path.join(ROOT, 'pages/weight/index.js'), 'utf8');
const pageMod = { exports: {} };
const pageSandbox = {
  module: pageMod,
  exports: pageMod.exports,
  require(p) {
    if (/utils\/weight-seed$/.test(p)) return require(path.join(ROOT, 'utils/weight-seed'));
    if (/utils\/weight-chart$/.test(p)) return CH;
    if (/utils\/weight$/.test(p)) return W;
    if (/api\/weight$/.test(p)) return api;
    throw new Error('unexpected require: ' + p);
  },
  Page: (o) => {
    cfg = o;
  },
  wx,
  console: { log() {}, error() {}, warn() {}, info() {} },
  Date,
  JSON,
  Math,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Promise,
  setTimeout,
  Error,
};
vm.createContext(pageSandbox);

try {
  vm.runInContext(pageSrc, pageSandbox, { filename: 'pages/weight/index.js' });
  ok('页面文件加载成功（模块求值没抛错）');
} catch (e) {
  no('页面加载期抛错: ' + (e && e.message));
  console.log(e && e.stack);
  process.exit(1);
}

if (!cfg || !cfg.data) {
  no('没有调用 Page()');
  process.exit(1);
}

/* ---------------- 造实例 ---------------- */

function deepSet(target, key, val) {
  target[key] = val;
}

const inst = Object.assign({}, cfg);
inst.data = JSON.parse(JSON.stringify(cfg.data));
inst.setData = function (patch, cb) {
  Object.keys(patch || {}).forEach((k) => deepSet(this.data, k, patch[k]));
  if (typeof cb === 'function') cb();
};

function run(name, fn) {
  try {
    fn();
    ok('交互 ' + name + ' 没抛错');
    return true;
  } catch (e) {
    no('交互 ' + name + ' 抛错: ' + (e && e.message));
    console.log('  ' + String((e && e.stack) || '').split('\n').slice(0, 4).join('\n  '));
    return false;
  }
}

/* ---------------- 生命周期 ---------------- */

run('onLoad', () => inst.onLoad());
run('onShow', () => inst.onShow());
run('onReady', () => inst.onReady());

eq(inst.data.statusTop, 44, 'statusTop');
eq(inst.data.monthY, new Date().getFullYear(), 'monthY 当年');
eq(inst.data.monthM, new Date().getMonth() + 1, 'monthM 当月');
eq(inst.data.online, null, '云开着时初始 online=null（同步中）');
eq(inst.data.isEmpty, true, '空库时 isEmpty');
eq(inst.data.records.length, 0, '空库时记录 0 条');

/* ---------------- 交互 ---------------- */

run('onFormWeight', () => inst.onFormWeight({ detail: { value: '155.4' } }));
run('onFormFat', () => inst.onFormFat({ detail: { value: '22.3' } }));
run('onSave', () => inst.onSave());

eq(inst.data.records.length, 1, '存完当月有 1 条');
eq(inst.data.records[0].weight, '155.4', '记录体重');
eq(inst.data.records[0].fat, '22.3%', '记录体脂');
eq(inst.data.stat.latestW, '155.4', '统计当前体重');
eq(inst.data.isEmpty, false, '有数据后 isEmpty=false');
eq(inst.data.formWeight, '', '保存后清空输入');

run('onSave 校验（不填体重）', () => inst.onSave());
eq(calls.toast[calls.toast.length - 1], '先填体重', '空体重拦住了');

run('onSave 校验（越界）', () => {
  inst.onFormWeight({ detail: { value: '10' } });
  inst.onSave();
});
eq(calls.toast[calls.toast.length - 1], '体重请在 60-400 斤之间', '体重越界拦住了');

// 再补两条历史记录，让趋势/分析能出
run('补两条历史', () => {
  inst.onPrevMonth();
  inst.setData({ formDate: '2026-06-01' }, () => {
    inst.onFormWeight({ detail: { value: '158.0' } });
    inst.onFormFat({ detail: { value: '23.0' } });
    inst.onSave();
    inst.setData({ formDate: '2026-06-05' }, () => {
      inst.onFormWeight({ detail: { value: '157.0' } });
      inst.onSave();
      inst.setData({ formDate: '2026-06-10' }, () => {
        inst.onFormWeight({ detail: { value: '156.0' } });
        inst.onSave();
      });
    });
  });
});
eq(inst.data.monthM, 6, '跳到了 6 月');
eq(inst.data.records.length, 3, '6 月 3 条');
eq(!!inst.data.analysis, true, '3 条后出智能分析');
eq(inst.data.records[0].badge, '最低', '最新一条（156 是最低）打最低标');
eq(inst.data.records[inst.data.records.length - 1].badge, '最高', '最老一条（158 是最高）打最高标');

run('onMode fat', () => inst.onMode({ currentTarget: { dataset: { mode: 'fat' } } }));
eq(inst.data.showF, true, 'fat 模式开体脂');
eq(inst.data.showW, false, 'fat 模式关体重');

run('onMode all', () => inst.onMode({ currentTarget: { dataset: { mode: 'all' } } }));
eq(inst.data.statLabels.max, '历史最高', 'all 模式统计口径切历史');

run('onMode weight', () => inst.onMode({ currentTarget: { dataset: { mode: 'weight' } } }));
eq(inst.data.statLabels.max, '本月最高', '切回本月口径');

run('onNextMonth', () => inst.onNextMonth());
run('onUser ta', () => inst.onUser({ currentTarget: { dataset: { user: 'ta' } } }));
eq(inst.data.user, 'ta', '切到 TA');
eq(inst.data.records.length, 0, 'TA 没记录');
run('onUser me', () => inst.onUser({ currentTarget: { dataset: { user: 'me' } } }));
run('回到 6 月', () => inst.onPrevMonth());
eq(inst.data.monthM, 6, '回到 6 月');
eq(inst.data.records.length, 3, '6 月仍是 3 条');

const ids = inst.data.records.map((r) => r.id);
eq(new Set(ids).size, ids.length, '记录 id 不重复（' + ids.join(',') + '）');

const firstId = inst.data.records[0].id;
run('onOpenEdit', () => inst.onOpenEdit({ currentTarget: { dataset: { id: firstId } } }));
eq(inst.data.editOn, true, '打开编辑弹层');
eq(inst.data.editWeight, '156.0', '编辑带出的是点中那条的原值');
run('onEditWeight', () => inst.onEditWeight({ detail: { value: '156.6' } }));
run('onEditSave', () => inst.onEditSave());
eq(inst.data.editOn, false, '保存后关弹层');
eq(inst.data.records[0].weight, '156.6', '编辑生效（改的是点中那条）');

run('onOpenEdit 再开', () => inst.onOpenEdit({ currentTarget: { dataset: { id: inst.data.records[0].id } } }));
run('onEditDelete', () => inst.onEditDelete());
eq(inst.data.records.length, 2, '删掉后 2 条');

run('onToggleBmi', () => inst.onToggleBmi());
eq(inst.data.bmiOn, true, 'BMI 展开');
run('onBmiHeight', () => inst.onBmiHeight({ detail: { value: '170' } }));
run('onBmiWeight', () => inst.onBmiWeight({ detail: { value: '158' } }));
run('onBmiCalc', () => inst.onBmiCalc());
eq(inst.data.bmiResult.value, (79 / 2.89).toFixed(1), 'BMI 值');
run('onToggleBmi 收起', () => inst.onToggleBmi());

run('onExport', () => inst.onExport());
eq(/weight|体重/.test(String(calls.clipboard).slice(0, 40)) || calls.clipboard.length > 0, true, '导出产生了 JSON 文本');

run('onImport（剪贴板里是刚导出的）', () => inst.onImport());
eq(inst.data.records.length, 2, '导入后仍是 2 条（数据没坏）');

run('onImportSeed', () => inst.onImportSeed());
eq(inst.data.isEmpty, false, '导入网页版数据后非空');

run('onClear', () => inst.onClear());
eq(inst.data.isEmpty, true, '清空后 isEmpty');
eq(inst.data.records.length, 0, '清空后 0 条');

/* ---------------- 云端落库情况 ---------------- */

ok('云端文档：' + Object.keys(docs).join(' / '));
eq(docs.weight_me ? Array.isArray(docs.weight_me.records) : false, true, 'weight_me 文档是数组结构');
eq(docs.weight_me ? docs.weight_me.records.length : -1, 0, '清空后云端也空了（与页面一致）');

console.log(bad ? `\n${bad} 项失败` : '\n全部通过');
process.exit(bad ? 1 : 0);
