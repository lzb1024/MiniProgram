/**
 * 云开发环境 ID
 * 获取方式：微信开发者工具 → 顶部「云开发」→ 环境设置 → 复制「环境 ID」
 * 填进来即启用云端存储；留空则小程序自动回落到 mock/ 与本机 storage 的默认数据。
 *
 * 填完环境 ID 之后，还需要在云开发控制台补两件事，否则相关功能会静默回落到本机：
 *
 *   1) 建集合（数据库 → 集合管理）。注意新版控制台的基础权限里**没有**「所有用户可读写」，
 *      要选「自定义安全规则」，下面三个集合都填同一段 JSON：
 *          { "read": true, "write": true }
 *        packing  物品准备清单
 *        costs    花费统计记账
 *
 *   2) 建云函数（右键 cloudfunctions 下的目录 → 上传并部署，云端安装依赖）：
 *        weather  腾讯位置服务天气中转。部署后到
 *                 「云函数 → weather → 配置 → 环境变量」加一条
 *                   QQMAP_KEY = 你的腾讯位置服务 Key
 *                 Key 在 lbs.qq.com 控制台申请：应用管理 → 我的应用 → 创建应用 →
 *                 进应用详情「添加 Key」，勾上 WebServiceAPI。
 *                 ⚠️ 域名白名单留空（或填 *），**不要**按「微信小程序」场景绑 appid：
 *                 云函数是服务端调用、请求里没有 referer，一旦绑了小程序来源就会被拒。
 *                 没配 Key 时天气条整条不渲染，页面与没有这个功能时完全一致。
 */
const cloudEnv = 'cloud1-d8ggp5yeb4ac58051';

export default {
  isMock: true,
  baseUrl: '',
  cloudEnv,
  useCloud: !!cloudEnv,
};
