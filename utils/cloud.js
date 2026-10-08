// utils/cloud.js
// 云开发薄封装：初始化、数据库、云存储上传、时间格式化。
// 设计原则：未配置环境 ID 或基础库不支持时一律「静默降级」，
// 绝不把异常抛给页面 —— 否则又会出现一次白屏。
import config from '~/config';

/** 云数据库集合名，需要在云开发控制台先建好同名集合 */
export const COLLECTION = 'guides';

let inited = false;

/** 幂等初始化；返回 false 表示调用方应回落到本地 mock 数据 */
export function ensureCloud() {
  if (!config.useCloud) return false;
  if (inited) return true;
  if (!wx.cloud) {
    console.warn('[cloud] 当前基础库不支持 wx.cloud，请把调试基础库调到 2.2.3 以上');
    return false;
  }
  try {
    wx.cloud.init({ env: config.cloudEnv, traceUser: true });
    inited = true;
    return true;
  } catch (err) {
    console.error('[cloud] 初始化失败，已回落到本地数据', err);
    return false;
  }
}

export function database() {
  return wx.cloud.database();
}

/**
 * 本地临时文件 → 云存储，返回 fileID。
 * 已经是 cloud:// 的文件（比如编辑已发布内容）原样返回。
 */
export async function uploadImage(filePath, index = 0) {
  if (!filePath) return '';
  if (/^cloud:\/\//.test(filePath)) return filePath;
  const matched = filePath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const ext = matched ? matched[1] : 'png';
  const cloudPath = `guides/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const res = await wx.cloud.uploadFile({ cloudPath, filePath });
  return res.fileID;
}

/** 时间戳 / Date / 字符串 → 相对时间文案 */
export function formatTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  const diff = Date.now() - date.getTime();
  if (diff < 0) return `${date.getMonth() + 1}月${date.getDate()}日`;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
