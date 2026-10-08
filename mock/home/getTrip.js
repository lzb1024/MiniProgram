// 旧路径转发壳 —— 真实数据已搬到 mock/trips/chuanxi.js。
//
// 为什么留这个文件：综合版小程序里详情页按 ?trip= 参数取行程，mock 端点相应改成
// /home/trip/chuanxi 与 /home/trip/changsha。但 /home/trip 这个旧端点可能还被
// 预览脚本、自检脚本或历史引用指着，直接删掉会让它们静默拿不到数据。
// 所以这里只做一件事：把川西那份数据原样挂在旧路径上。
//
// ⚠️ 别在这里加内容，也别改这份数据的字段 —— 它每次运行都是从 trips/chuanxi.js
// 现引的，改了也会被覆盖。改内容去 mock/trips/chuanxi.js。
import chuanxi from '../trips/chuanxi';

export default {
  path: '/home/trip',
  data: chuanxi.data,
};