import getHomeSwipers from './getHomeSwipers';
import getTrip from './getTrip';
import tripsRegistry from '../trips/index';
import chuanxi from '../trips/chuanxi';
import changsha from '../trips/changsha';

// 行程详情与清单现在都在 mock/trips/ 下（综合版小程序，支持多趟行程）。
// ./getTrip 只是旧路径的转发壳，保留是为了让历史引用不至于直接断掉 ——
// 它已经在 2026-09-15 被 trips/ 下的副本取代，别在这里再加内容。
export default [getHomeSwipers, getTrip, tripsRegistry, chuanxi, changsha];