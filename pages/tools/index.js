// 常用工具页（tab2）。
//
// 结构约定：工具清单在 TOOLS 里，一条 = 一行（图标 + 标题 + 副标题 + 箭头）；
// 加新工具只需往 TOOLS 里塞一条，wxml 不用动。
//
// ⚠️ 本页是 tabBar 页面，跳转规则与普通页不同：
//   - 去别的 tab 页 → wx.switchTab（不能用 navigateTo）
//   - 去普通页     → wx.navigateTo（不能用 switchTab）
//   - switchTab 不能带参数，需要参数的页面只能走 navigateTo

/** 工具清单。url 走「普通页」时用 navigateTo；留空表示还没做好，点了给个提示 */
const TOOLS = [
  {
    id: 'mahjong',
    title: '麻将记分',
    desc: '开局定底分，收局算盈亏与谁付谁',
    icon: 'gamepad',
    url: '/pages/mahjong/index',
  },
  {
    id: 'zhufugui',
    title: '朱富贵计算',
    desc: '按盘算账，锅底调料饮料不打折',
    icon: 'rice',
    url: '/pages/zhufugui/index',
  },
];

Page({
  data: {
    tools: TOOLS,
    statusTop: 0,
  },

  onLoad() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusTop: (win && win.statusBarHeight) || 0 });
  },

  /** 点工具行：有 url 就跳，没有就提示「还在做」 */
  onTapTool(e) {
    const { id, url } = e.currentTarget.dataset;
    if (!url) {
      wx.showToast({
        title: '这个工具还在做',
        icon: 'none',
      });
      return;
    }
    wx.navigateTo({ url });
  },
});
