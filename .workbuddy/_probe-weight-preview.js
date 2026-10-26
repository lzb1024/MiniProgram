// 校验 preview/weight-preview.html 里的脚本能跑通（Node + 极简 DOM 垫片）
// 只要 refresh() 能完整跑完，就说明预览页的渲染逻辑没有引用错误。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'preview/weight-preview.html'), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];

const makeClassList = () => ({ toggle() {}, add() {}, remove() {}, contains: () => false });

function makeEl(id) {
  const el = {
    id,
    style: {},
    textContent: '',
    innerHTML: '',
    classList: makeClassList(),
    getAttribute: () => 'me',
    addEventListener() {},
    getBoundingClientRect: () => ({ width: 366, height: 210 }),
  };
  if (id === 'wtChart') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeCtx();
  }
  return el;
}

const calls = { fillText: 0, lineTo: 0, arc: 0 };
function makeCtx() {
  const noop = () => {};
  return {
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: () => {
      calls.lineTo++;
    },
    stroke: noop,
    fill: noop,
    arc: () => {
      calls.arc++;
    },
    fillText: () => {
      calls.fillText++;
    },
    createLinearGradient: () => ({ addColorStop: noop }),
    setTransform: noop,
    scale: noop,
  };
}

const store = {};
const document = {
  getElementById(id) {
    if (!store[id]) store[id] = makeEl(id);
    return store[id];
  },
  querySelectorAll: () => [],
};

const sandbox = {
  document,
  window: { devicePixelRatio: 2, addEventListener() {} },
  Array,
  Math,
  Date,
  JSON,
  parseInt,
  parseFloat,
  String,
  Number,
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
  vm.runInContext(script, sandbox, { filename: 'weight-preview.inline.js' });
} catch (e) {
  console.log('FAIL 预览脚本抛错:', e && e.message);
  process.exit(1);
}

console.log('OK   预览脚本跑通');
console.log('     月份 =', store.monthLabel.textContent, '| 记录数 =', store.monthCount.textContent);
console.log('     当前体重 =', store.stLatestW.innerHTML, '| 本月最高 =', store.stMaxW.innerHTML, '| 月波动 =', store.stSpreadW.innerHTML);
console.log('     当前体脂 =', store.stLatestF.innerHTML, '| 体脂波动 =', store.stSpreadF.innerHTML);
console.log('     分析显示 =', store.anaCard.style.display === 'none' ? '隐藏' : '显示', '|', store.anaLead.innerHTML);
console.log('     记录行数 =', (store.recList.innerHTML.match(/class="wrec"/g) || []).length);
console.log('     绘图笔触 =', JSON.stringify(calls));
console.log('     状态栏 =', store.phState.textContent);
