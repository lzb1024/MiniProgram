// app.js
import config from './config';
import Mock from './mock/index';
import createBus from './utils/eventBus';
import { ensureCloud } from './utils/cloud';

if (config.isMock) {
  Mock();
}

App({
  onLaunch() {
    // 云开发：config.js 里没填环境 ID 时会静默跳过，不影响本地 mock 数据
    ensureCloud();

    const updateManager = wx.getUpdateManager();

    updateManager.onCheckForUpdate((res) => {
      // console.log(res.hasUpdate)
    });

    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已经准备好，是否重启应用？',
        success(res) {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        },
      });
    });
  },
  globalData: {
    userInfo: null,
  },

  /** 全局事件总线 */
  eventBus: createBus(),
});
