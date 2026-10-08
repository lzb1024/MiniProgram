// 行程清单：综合版小程序的新首页（pages/index）读这份数据，卡片式列表。
//
// 与 mock/trips/{id}.js 的关系：
//   - 这里只放**列表页要显示的字段**（封面、标题、日期、天数、状态），轻量；
//   - 每趟行程的完整攻略（逐日 / 路线 / 预约 / 物品 / 记账 / 交通）在各自的
//     mock/trips/{id}.js 里，点进详情页才请求。
//   - 两处唯一的耦合是 `id` 与详情页的 `?trip=` 参数，以及 start/end 与行程内的 date。
//     改日期时两处一起改，否则倒计时和列表页显示的日期会打架。
//
// 状态是**页面实时算的**，不在这里写死：详见 pages/index/index.js 的 buildStatus()。

const TRIPS = [
  {
    id: 'changsha',
    cover: '/static/cover-changsha.png',
    kicker: '即将出发',
    title: '长沙 3 日',
    subtitle: '橘子洲 · 岳麓山 · 五一广场',
    // 排序用：越靠前越靠上。长沙排川西前面，因为它还没出发、还能用得上；
    // 川西已经结束（9.25-10.3），沉到下面当作历史记录
    order: 10,
    start: '2026-11-06',
    end: '2026-11-08',
  },
  {
    id: 'chuanxi',
    cover: '/static/cover-chuanxi.png',
    kicker: '川西 9 日',
    title: '川西环线',
    subtitle: '成都 · 四姑娘山 · 九寨沟',
    order: 20,
    start: '2026-09-25',
    end: '2026-10-03',
  },
];

export default {
  path: '/home/trips',
  data: {
    code: 200,
    message: '请求成功',
    data: {
      hero: {
        kicker: '我的行程',
        title: '旅行计划',
        subtitle: '点一张卡片进对应攻略',
      },
      trips: TRIPS,
      footer: ['数据仅保存在本机与云开发数据库，仅供本人使用'],
    },
  },
};