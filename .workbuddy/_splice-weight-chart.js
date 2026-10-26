// 一次性：把 pages/weight/index.js 的绘图段换成调用 utils/weight-chart.js 的精简版
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'pages', 'weight', 'index.js');
const MARK = '  /* ---------------- 趋势图（canvas 2d 手绘）---------------- */';

const src = fs.readFileSync(FILE, 'utf8');
const at = src.indexOf(MARK);
if (at < 0) {
  console.error('找不到绘图段起点，未改动');
  process.exit(1);
}

const tail = [
  MARK,
  '',
  '  initChart() {',
  '    if (this.chart) return;',
  '    wx.createSelectorQuery()',
  "      .select('#wtChart')",
  '      .fields({ node: true, size: true })',
  '      .exec((res) => {',
  '        const item = res && res[0];',
  '        if (!item || !item.node) return;',
  '        const canvas = item.node;',
  '        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();',
  '        const dpr = (info && info.pixelRatio) || 2;',
  '        // 像素尺寸乘 dpr，逻辑尺寸仍按 CSS 像素算，否则线会糊',
  '        canvas.width = Math.round(item.width * dpr);',
  '        canvas.height = Math.round(item.height * dpr);',
  "        const ctx = canvas.getContext('2d');",
  '        if (!ctx) return;',
  '        ctx.scale(dpr, dpr);',
  '        this.chart = { ctx, w: item.width, h: item.height };',
  '        this.drawChart();',
  '      });',
  '  },',
  '',
  '  /** 数据 / 月份 / 模式变了就重画；绘制细节全在 utils/weight-chart.js */',
  '  drawChart() {',
  '    const c = this.chart;',
  '    if (!c) return; // onReady 之前画不了，等 initChart 里补画',
  '    const src = this.chartSrc || { list: [], showW: true, showF: false };',
  '    CH.drawTrend(c.ctx, { w: c.w, h: c.h, list: src.list, showW: src.showW, showF: src.showF });',
  '  },',
  '});',
  '',
].join('\n');

fs.writeFileSync(FILE, src.slice(0, at) + tail, 'utf8');
console.log('spliced, size', (src.slice(0, at) + tail).length);
