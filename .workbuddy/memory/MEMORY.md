# LIN 项目长期约定

> 只放**每次都要遵守**的约定；长尾（天气链路、云库、校验脚本、首页细节、交通记录字段、picker 坑等）
> 见同目录 `MEMORY-detail.md`；当天做了什么见 `YYYY-MM-DD.md`。

## 是什么
微信小程序，**个人自用旅游攻略（综合版，多趟行程）**。原生 WXML/JS + LESS + TDesign v1.12.1。
appid `wxfd95a21919677707`。**本工作区根 = `E:\3_WorkSpace\MiniProgram`**（旧记的 `D:\LZB\LIN` 已失效，
`.workbuddy/` 下脚本里硬编码的 ROOT 常量要按本工作区改）。
**有 tabBar 两页**：`pages/index`（旅行攻略，行程列表）+ `pages/tools`（常用工具）；
**普通页**：`pages/mahjong`（麻将记分）、`pages/zhufugui`（朱富贵火锅计算，两者 2026-10-08 加）、
`pages/home`（行程详情，读 `?trip=xxx`）。
**`pages/tools` 目前两条工具**（2026-10-08 删掉 5 个占位工具，并把「分组」层拍平为扁平 `TOOLS[]`）。
加条目只改 `TOOLS`，wxml 不用动。
现有行程：**川西**（9.25-10.03，9 天）、**长沙**（11.06-11.08，3 天 2 晚，内容为占位待填）。
唯一组件 `components/nav` = **空白自定义导航栏**（`t-navbar` 壳 + 玻璃底，z-index 31），只在详情页用。
原「页面目录」抽屉、顶部搜索框与 6 个分包页面均已于 2026-09-13 拆除。
**`t-icon` 的 name 必须先核对字体表**（`node_modules/tdesign-miniprogram/miniprogram_dist/icon/icon.wxss`
里找 `.t-icon-{name}:`）——TDesign 无 `dice`，麻将记分用的 `gamepad` 才存在。写错不报错，只留空白。
**新增页面后要清开发者工具全部缓存再编译**（同「增删页面」那条，幽灵 ENOENT）。

## 多行程（综合版，2026-10-07 立）
- **详情页端点按路径不按 query**：`/home/trip/{id}`。WxMock 用**完整 URL 字符串**做 key
  （`Mock._mocked[config.url]`），带 `?trip=xx` 匹配不上，会走真 request 然后 fail。
  `?trip=` 只用于**页面路由**（`navigateTo`），不进 mock 端点。
- mock 在 `mock/trips/`：`index.js` = 列表页数据源（`trips[]` 清单：id/cover/日期/order），
  `{id}.js` = 该行程完整攻略。`mock/home/getTrip.js` 已降级为**转发壳**（旧路径 `/home/trip` 仍指向川西），
  别在那里加内容。
- **加一趟新行程要动三处**：① `mock/trips/{id}.js` 详情数据 ② `mock/trips/index.js` 清单加一项
  ③ `pages/home/index.js` 的 `TRIPS` 白名单加一项。漏 ② 点不到，漏 ③ 会静默回落川西（不报错，只 warn）。
- `api/weather.js` 的 `CITY_POINTS` 要加该行程出现的城市，否则天气条整条不渲染。
- **三链按行程完全隔离**：`api/trip.js` 所有函数第一个形参是 `tripId`；
  本机 key `trip_packing_{id}`；云库三集合加 `tripId` 字段。
  **老数据不用重导**：`filterByTrip()` 把**无 `tripId` 字段的记录归 `DEFAULT_TRIP`（chuanxi）**；
  默认行程读云库**不加 where**（加了老记录全丢），改内存筛；非默认行程才严格 `where`。
- 列表页状态（已结束 / 进行中 / 即将出发 + 倒计时）**按打开当天实时算**，mock 只存原始日期，别写死天数。

## 视觉（山野手账浅色，单主题）
底 `#F7F5EF` 纸白 / 卡 `#FFFFFF` / 次级块 `#FBFAF6` / 描边 `#E4E1D5`、细线 `#EEECE2` /
文字 `#22302E`、`#5A6B66`、`#8C9A94`。
**三色语义别串味**：青绿 `#1E6B5A`（强调 / 主按钮）、雪峰蓝 `#2E6E95`（天气 / 信息）、
陶土棕 `#B4552D`（交通 / 价格）。渐变 = 青绿→雪峰蓝（`@grad` / `@grad-135`）；标题走衬线 `.fg-display()`。
**颜色尺寸只走 `variable.less` 令牌，禁止硬编码**（尤其禁止 `rgba(255,255,255,x)` 这类深色残留）。
mixin：`.fg-theme()` / `.fg-glass()` / `.fg-grad-text()`。禁用 em-dash 与 emoji。
**换肤时 `app.json` 的 `window` 段与页面 json 的 `backgroundColor` 也要跟着改**。

## 样式三大坑（都真实白屏过）
1. **`@import` 只能相对路径**：带斜杠会被 LESS 当文件系统绝对路径，而插件传 `paths: []`，必报 not found。
2. **每个 `.less` 编译产物不能 0 字节**：空产物即坏模块，**只在主包 `__APP__` 报错、整屏白屏**。
   `variable.less` 末尾 `.fg-tokens{color-scheme:light}` 是兜底，别删。
3. 项目开着时增删页面 / 改名，工具文件模型会不同步（幽灵 ENOENT）：改完让用户清全部缓存再编译。

## 组件 / API 雷区
- **`usingComponents` 的路径本工作区一律用「两段」写法**：`tdesign-miniprogram/icon/icon`、
  `tdesign-miniprogram/toast/toast`、`tdesign-miniprogram/navbar/navbar`、`tdesign-miniprogram/message/message`。
  `pages/home` / `pages/tools` / `components/nav` 都是这个形状，**别按「v1 已拍平成单段」去写
  `tdesign-miniprogram/icon`** —— 开发者工具会报「…/pages/mahjong/tdesign-miniprogram/icon 路径下未找到组件」，
  并且它会按「页面相对路径」去找（所以错误信息里带着 `pages/mahjong/` 前缀），看起来像文件缺失，其实是路径写法错。
  2026-10-08 踩过一次（麻将页写单段 → 报错），改回两段即好。
- **`wx.switchTab` 静默失效**（无 tabBar）：跨页用 `navigateTo`，回主页用 `reLaunch`。
- **不要用 `t-pull-down-refresh` 包内容页**：内部是 `<scroll-view scroll-y>`，会让
  `pageScrollTo` / `onPageScroll` / `sticky` 全部静默失效。改用原生 `enablePullDownRefresh`。
- `wx.pageScrollTo` 别用裸 selector / `offsetTop`：自查 `boundingClientRect` + `scrollOffset`，
  再减吸顶条高度。
- `usingComponents` 必须与 wxml 标签一致（`t-toast`/`t-message`/`t-progress` 最易漏）。
- **TDesign 组件路径分 v0 / v1 两种写法，写错就报「路径下未找到组件」**：
  v0 = `tdesign-miniprogram/toast/toast`（同名子目录），v1 文档写法是 `tdesign-miniprogram/toast`（拍平）。
  **本项目一律用 v0 那形状的两段写法**（见上一条实测结论）；只有 `message` 的 JS 入口是
  `tdesign-miniprogram/message/index`。排查这类报错时**先对版本核路径，再怀疑没构建 npm**。
- 仓库 `node_modules` / `miniprogram_npm` 都被 gitignore 忽略，**克隆后要 `npm install` 再由用户在
  开发者工具「工具 - 构建 npm」**，否则全部 `t-*` 解析失败。改 `usingComponents` 后需重新构建 npm。
- **同名 class 别跨区块复用**：浅色实色背景下撞了就是「某块莫名多一圈底色」。
- **`<picker>` 里别用百分比高度**：包装节点高度 auto → 容器塌陷 → 内容贴格子上沿不居中。把高度写实。
- **同一文件禁止并行发多个 Edit**：各自基于旧快照回写，最后写入者胜，其余静默丢失（且都报成功）。
- **同工作区可能有第二个会话在改同一批文件**（实测多次）：`_check-all.js` 的 syntax 项偶发
  `ENOENT ..._syntax\index.js.cjs` 只是两个会话争临时目录，**不是代码坏了**；文件 mtime 无故前跳同理。
  处置：改前重读文件，改后立刻复核自己那几处还在不在。

## 详情页结构（pages/home，7 区块）
**7 区块（01~07）**：总览 → 逐日 → 路线 → 预约 → 物品 → 花费 → 交通记录 + 页脚。
锚点 `sec-*`、日卡 `day-{index}`；wxml 每块带 `<text class="n">` 编号，`preview/_gen-1home.js` 序号手写同步。
吸顶 `.toc` **两行**（章节行滚动联动 + DAY 1-9 行点击直达）。**顶部留白不能只留状态栏**：
右上角胶囊（关闭/更多）浮在同一条竖直带里，会盖住首行末尾两项；留白取「胶囊下沿 + 呼吸位」
（`tocTopInset()`）。同时 `components/nav` 的 z-index 必须**高于** `.toc`。
逐日**恒全展开、已无任何折叠**（2026-09-15 班次表整体下线）。**界面上写死的交通已全部下线
（2026-09-15）**：时间线上的交通**只来自 07 用户自记**，但每天头部 `route` 横条、
`brief` / `desc` / `tips` 里的交通描述**保留**（用户明确只要清时间线，别顺手扩大）。
预约倒计时存原始日期、`buildCountdown()` 按打开当天实时算，**别写死天数**。
**05 物品按 4 类分组（2026-09-15 加）**：`packing.groups = ['药品','必要品','生活品','其他']`，
每项 `{group, name}`，页面按白名单顺序聚合成 `packingGroups`、空组不渲染，表单上方 `gear__cat` chips 选分类；
**分类白名单 mock 与 `api/trip.js` 各存一份，改一处必须同步另一处**（照 `costs.categories` / `traffic.modes`）。
折叠范式：布尔字段 + `wx:if`，切换后**必须在 `setData` 回调里调 `measureSections()`**；
预览片段一律渲染成展开态（别拿预览判断默认状态）。样式模板见 detail。

## 交通记录（07）
用户自记交通并入逐日时间线。**合并只「插入」不「重排」**（「落地后」「晚上」这类无时刻项必须留在原地）；
`_baseTimeline` 是原始底稿，每次从它重算。时间线 **`wx:key` 用 `k`（`p-{序号}` / `u-{id}`），不能用 `t`**
（撞点会静默不渲染）。条目带 `mine:true` + `commute:true`，时间线统一出**实心「交通」徽标**
（说的是「这条是什么」，不标「谁加的」；`.tl__mine` 已删，别再捡回来）。
来源 `src` 支持微信小程序链接（`#小程序://…`），解析收在 `api/trip.js` 的 `parseSource()`；
有 `link` 才出可点胶囊，走 `wx.navigateToMiniProgram({ shortLink })`（不用 appId），
时间线里的胶囊必须 `catchtap`。字段定义与跳转细节见 detail。

## 数据层
全站走 mock：`isMock:true` + `baseUrl:''`，`app.js` 用 WxMock 接管 `wx.request`。
**每趟行程**的 `mock/trips/{id}.js` 顶层：`hero / daysDesc / routesDesc / sections / dayTabs / days /
routes / booking / packing / costs / traffic / footer`（**已无 `budget`**，`overviewDesc` 也已删）。
`dayTabs` 数量必须与 `days` 对齐，否则第二行 DAY 选项卡点空。
**写新行程的 mock 必须照 `chuanxi.js` 的字段形状，别照自己上一版的形状**（两个已踩过的坑）：
① `days[].city` **必填**，缺了 `api/weather.js` 的 CITY_POINTS 匹配不上 →
七天条与逐日预报**整块不渲染**（不报错）；
② `routes.stops` 必须是 **`{label, hot}` 对象数组**，写成字符串数组 →
wxml 取 `s.label` 取不到，渲染成一排**空白方框**（同样不报错）。
`days[]` 每天必须有 `date` + `city` + 非空 `timeline`，`timeline` 每条必须有 `t` 与 `c`。
共享三链 **05 物品 / 06 记账 / 07 交通**：mock 只给配置，真实读写走 `api/trip.js`，**云优先、本机兜底**，
统一返回 `{list, online}`。本机 key `trip_packing_{id}`/`trip_costs_{id}`/`trip_traffic_{id}`；
云集合均已建好。**两个改 `days` 的异步请求必须走「指定路径」setData**（`loadWeekWeather` 只写 `days[i].live`、
`paintTraffic` 只写 `days[i].timeline`），整份回写会互相覆盖。
云端读表**必须翻页**（`cloudGet` 按 20 一页翻到 200）。**云库为空不会回落本机**（空数组算成功）。
**05 物品的初值走文件导入，代码不自动灌**（2026-09-15 用户明确要求）：工作区根 `packing-import.json`
是云开发导库用的 JSONL（36 条，字段 `name/group/done/who/createdAt`），用户在控制台
「数据库 → packing → 导入」灌一次；云端空就是空，否则用户把清单删空后又会自己长回来。
`mock` 的 `packing.preset` 与它内容一致，但只供「没配云时的本机兜底」与预览渲染，**两处要一起改**。
`check-json.js` 的 `countJsonLines()` 按内容识别 JSONL、不认文件名，导入文件放根目录就能被认。
**AI 无法直接往云库写**，最后一步永远要用户自己点（生成导入文件就是那条「控制台」路）。云库细节见 detail。

## 交付 / 校验
- **改完首页内容跑 `.workbuddy/_post.js` 一条龙**：分片 → 预览 → 天气自测 → 全套离线校验，
  日志落 `.workbuddy/_out-post.txt`；或 `node .workbuddy/_check-all.js`（六项串行 → `_out-all.txt`），再 Read 那个 txt。
- **⚠️ `_check-all.js` 在本会话沙箱里会整片失败**：node 无法再 spawn node，报
  `spawnSync ... EBUSY`。六项全挂时**先怀疑这个，别去改代码**。
  更阴的是 `_syntax-check.js` 会因此报**一堆假的语法错误**（stderr 全空就是症状）。
  **可靠的处置：写一个 `.mjs` 用 `await import()` 动态加载目标模块做结构断言，再用绝对路径
  node 直接跑它**（临时目录建在 `.workbuddy/` 下，`.mjs` 走 ESM）。
  **注意 `_run.js` 不能用来绕** —— 它内部也是 spawn，一样 EBUSY；`exit=null(Error: ... EBUSY)` 就是中招了。
  自检里最值得写的一条：**断言倒计时 `lead` 文案（「提前 N 天」）与 `open → use` 的实际日期差值一致**，
  这类文案最容易写错，光看日期对不对查不出来。
- **bash 的坑**：含 `cp` 的复合命令容易被沙箱决策层拦掉（报
  `sandbox-center cmd decisionRecord missing actual resource subject`），写 `/tmp` 也会被拦；
  **写文件优先用 Write 工具**。`node` 不在 PATH，必须用绝对路径。
- **`_syntax-check.js` 的默认文件列表是硬编码的**：加新文件必须同步加进去，否则新文件不被检查。
  它按「路径含 `cloudfunctions/` 或以 `_gen-1home.js` 结尾」判 CommonJS，其余当 ESM。
- **搬动mock 文件要同步这三处硬编码路径**：`.workbuddy/_check-consistency.js`、
  `preview/_gen-1home.js`、`.workbuddy/_syntax-check.js`。漏了不会立刻报错，只是校验静默跑旧文件。
- **`.workbuddy/` 脚本一律用 `path.resolve(__dirname, '..')` 推项目根，禁止再写绝对路径**
  （2026-10-08 已把 17 处 `D:/LZB/LIN` 全改掉）。技能脚本与 node workspace 路径也换成本机用户名
  `C:/Users/LZB/...`。同项目原生写法一致（`preview/_gen-1home.js` 本来就自推导）。新写脚本照此办。
- **`check-json.js`（技能版）不认 JSONL**：`costs-import.json`、`packing-import.json` 是每行一条 JSON，
  技能版会报 `Unexpected non-whitespace character after JSON`，**是误报**；只有项目自己的
  `_check-json.js`（技能脚本里被覆写成 `countJsonLines()`）才认。别因此去改数据文件。
- **绕 spawn EBUSY 的现成工具：`.workbuddy/_syntax-nospawn.mjs`**（进程内 `new Function` 剥离
  ESM 语法后校验，不 spawn）。注意它对 CJS 文件含模板字符串会误报（如 `preview/_gen-1home.js`），
  那类文件**直接运行它**即是最可靠的验证。
- **本机 Bash 工具不可用**（`dirname`/`head` 都缺）；跑脚本一律走
  `node .workbuddy/_run.js <标签> <绝对路径 node> <脚本...>`（自己落盘 `_out-run.txt`）。PowerShell 取输出要转 UTF-8。
- 首页预览片段由 `node preview/_gen-1home.js` 从 `mock/trips/chuanxi.js` 生成，**别手改**（只出川西一份）。
  列表页可视预览是 `preview/plans-preview.html`（片段在 `preview/_screens/0-plans.html`）。
- **删区块 / 子组件的联动清单**（**漏一处不报错**）：wxml → less → mock 常量 → mock export →
  `sections[]` 锚点 → `_gen-1home.js` 分片 → `.workbuddy/` 自检里硬编码的期望。
  挂在条目上的子组件还要多清：js 交互方法 + `loadData` 注入的 UI 状态字段 + 预览渲染与统计 + 自检选择器。
- **发现「内容变少了」先跑 `_check-all.js`**：自检里硬编码的期望值会告诉你是有意改动还是文件损坏。
- 锚点跳转 / sticky / `onPageScroll` / 云读写 / 原生 picker 弹层 / 卡片跳转**离线验证不了**，必须开发者工具实机确认。
- 新增页面后 `project.config.json` 无需改，但**开发者工具要清全部缓存再编译**（幽灵 ENOENT）。
