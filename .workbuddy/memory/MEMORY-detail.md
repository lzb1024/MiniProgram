# LIN 项目长尾细节

> `MEMORY.md` 只留「每次都要遵守」的约定；这里放**只在动到相应模块时才需要**的细节。
> 当天做了什么见 `YYYY-MM-DD.md`。

## 内容真源
产物 = `E:\WorkBuddy\2026-09-01-20-46-17\chuanxi-site\index.html`（山野手账浅色 · 9 天 8 晚 9.25-10.3）。
小程序内容逐字对齐它；**只有三样是小程序自己的**：`pages/release` 页、dataCenter 费用页、
wx.cloud 数据层（`api/trip.js`，不用产物的 Node 后端）。

## 换肤补充
`app.json` 的 `window` 段（`backgroundColor*` / `navigationBarBackgroundColor` / `backgroundTextStyle`）
与页面 json 的 `backgroundColor` 也是皮肤的一部分。不跟着改，下拉刷新底色和导航栏还是旧色
（第四轮漏了 `app.json` 与 `pages/home/index.json`）。

## 已下线的块（别当丢失去恢复）
**04 费用预算整块 2026-09-12 移除**（用户要求「去除费用预算相关内容」）：wxml `sec-budget`、
`index.less` 的 `.bud`、mock 的 `budget` 常量与 export 字段、`sections` 里的锚点、
`hero.meta` 的「人均预算约 3900 至 5500 元」标签**全删**，`preview/_gen-1home.js` 分片同步。
**07 花费统计与共享记账链路保留**，逐日正文里的票价数字也保留。

## 首页细节
- 花费分类总价**恒列 7 类**，未记账显示 ¥0 并置灰。
- `days[].stay` **只写酒店名**：不带「宿」前缀、也不带「· 海拔 NNN 米」（每天海拔在 `alt` 里已有一条，
  别重复）。总览卡 `.ovcard__stay` 与逐日卡 `.day__foot` 共用这一个字段，改一处两处都变。
- `days[].stayGeo` 指向 mock 顶层 `stays`（5 个住宿点，腾讯 **GCJ-02** 坐标，`wx.openLocation` 直接用、
  别转 BD-09）；DAY 9 已返程无此字段。点住宿栏**整条**即开**微信内置腾讯地图**（跳不了高德 / 百度，
  也**不需要** `scope.userLocation`，app.json 无需改）：总览卡绑 `.ovcard__stay`、逐日卡绑 `.day__foot`，
  两处都 `catchtap`（外层有 `goDay` / `onDayTap`）。逐日卡脚部的折叠箭头已移除，卡片靠整卡
  `bindtap="onDayTap"` 收起；`.day__geo` 只是纯视觉提示，不单独绑事件。
- `days[]` 每天带 `date`（`2026-09-25`）与 `city`（成都 / 四姑娘山 / 九寨沟），供 `api/weather.js` 对齐
  日期与映射坐标；wxml 不引用，但**别删**。
- 预览示意数据：`preview/_gen-1home.js` 有 `PREVIEW_TRAFFIC` / `PREVIEW_COSTS` / `WEEK_SAMPLE` 三组 ——
  真机首次打开是空的，空态下这些控件根本不渲染，预览里看不到；**别拿预览判断默认状态**。

## 天气链路（全部细节）
- **云函数 `cloudfunctions/`**（`project.config.json` 的 `cloudfunctionRoot` 指向它）：`weather` = 腾讯位置
  服务天气中转，Key 走云函数环境变量 `QQMAP_KEY`，前端只调 `wx.cloud.callFunction`，
  因此**不需要配 request 合法域名**。
- **`api/weather.js` 两个出口**：`fetchWeather(days)` 管顶部实况条；`fetchWeekWeather(days)` 返回
  `{week, daily}` —— `week` 恒 7 格喂 `.wstrip`，`daily` 只含窗口内的行程日喂逐日卡 `item.live`。
  **同源合并成一次云函数调用**，别拆成两次查同一批城市。缓存 key `weather_week_cache`，
  tag = `窗口首日|城市列表`（跨午夜或换城市自动失效）。
  没配云环境 / 没部署 / 没配 Key 一律返回 null，天气条整块不渲染，其余功能不受影响。
- **腾讯位置服务天气接口硬上限是「当天 + 未来 6 天」**（`get_md=1`）。**别想找「一次覆盖 9 天」的免费源** ——
  和风天气免费版同样只有 7 天，10/15/30 天一律付费订阅（2026-09 核实）。顶部「实时天气」条只做
  「当前关注城市」一个点：行程未开始看出发地、进行中看当天城市。
- **顶部实况条里的两个温度别混**（2026-09-13）：大号那串是**今天这一天的区间**
  （`todayRange()` → `17~25℃`），当前实况温度让到次行 `meta` 里写成「实况 19℃ · 南风 1-2级 · 湿度 100%」。
  上游没回「今天」那条（跨零点边界）时 `todayRange` 返回空串、`temp` 退回实况温度，不会空着。
  `tempRange(low, high)` 与逐日卡、出发日提示三处共用，别再各写一遍区间拼接。
- **「未来七天」＝ 恒 7 格，放在 02 逐日安排顶部**（2026-09-13 立，`.wstrip` + `weekWeather`）。
  排列是 **4 列 × 2 行网格（4 + 3，靠左不拉伸）**；`&__rail` 用 `display: grid` +
  `repeat(4, 1fr)`，跟 01 总览的 `.ov` 同一套写法（**不再横滑** —— 用户 2026-09-13 明确说
  「改成两行吧，不要横滑了」；此前是 `scroll-view scroll-x`，已换回普通 `<view>`）。
  格子是**日历日**（今天起 7 天，每打开一次整体前移），**城市由那天自己的行程决定**：在行程里就按那天
  的城市查并挂 `DAY n` 徽标，不在就回落出发地；行程结束后整块下线。
  **用户说的「每格对应它自己那一天」与「永远今天起 7 天」是同一件事的两面** —— 别再理解成「行程 9 格」
  或「今天起 7 格全用同一个城市」（2026-09-13 为此返工过一轮，用户原话「思路不对，要的是对应的，
  比如 Day1 就看成都 Day2 要看四姑娘山」）。
- **格子里天气与温度是两个字段、分两行渲染**（2026-09-13 修「这部分 UI 都看不见了」）：
  `wstrip__text`（`text`）+ `wstrip__temp`（`temp`）+ 空态 `wstrip__wait`。四列网格下每格约 149rpx，
  减掉左右 padding 只剩 129rpx，「阵雨转晴 17~25℃」一行根本放不下；当年横滑版更糟 ——
  那是 `white-space: nowrap`，**溢出的「℃」会被后一格不透明的 `@card-strong` 底色盖掉**，
  症状是「℃ 消失 / 内容看不见」，**不是 scroll-view 的问题，只需拆行**。
  宽度红线：21rpx 字号下 5 字约 105rpx、「17~25℃」约 78rpx，`DAY1 · 今天` 约 104rpx。
  `week[].line` 只剩日志与自检在拼读，**别拿它当 UI 数据源**。
- 逐日只能给**预报**，实况只有当天有；别用「每天的实时天气」这种说法，用户要的其实是逐日预报。
- 上游的天气词**同一列里混写**（9.13 那份真实响应白天给「阵雨」、夜间给「晴天」），
  `trimWeather()` 把「X天」统一收成单字：只吃「晴 / 阴 / 雨 / 雪 + 天」这种尾巴，不碰「多云」「小雨」。
- **接口返回的嵌套形态反直觉，别按常识猜**：`result.realtime` 与 `result.forecast` **都是数组**
  （官方标 `array of object`），而 `realtime.infos` 是**对象**、`forecast.infos` 才是**数组**。
  直接把 `result.realtime` 当对象取 `.infos` 会拿到 `undefined`，上游 `status` 却仍是 `0`，
  现象是「日志说成功但天气条不出现」。云函数里已用 `unwrap()`（数组取 `[0]`、对象原样）统一吃下两种形态；
  解析失败时 `errors` 会带 `shapeOf()` 打出的真实结构，照那行日志认字段即可。
- **Key 只存在云端环境变量里、不在仓库任何文件**（`config.js` 只是说明文档），AI 无从核实 ——
  判断链路只看云函数返回：`NO_KEY` = 环境变量没进运行时（**改完环境变量要重新部署**，
  `const MAP_KEY = process.env.QQMAP_KEY` 是模块加载时读一次，旧实例缓存的是空值）；
  `UPSTREAM` + 一串数字 = Key 已读到但被腾讯位置服务拒（110 来源未授权 / 112 IP 未授权 /
  113 功能未授权 / 190 无效 Key / 199 未开启 WebServiceAPI / 120 配额），照那串数字查。

## 云数据库
- 批量灌数据走云开发控制台「数据库 → 集合 → 导入」，只支持 CSV / JSON，且 **JSON 是 JSON Lines**
  （每条记录一行、`\n` 分隔，**不是数组**）；时间字段必须写成 ISODate
  `{"$date":"2026-09-13T02:00:00.000Z"}`；不要带 `_id`（Insert 模式遇重复 `_id` 会报错）；
  文件须 UTF-8。字段要与 `api/trip.js` 写入的一致（如 costs：`amount/note/category/who/createdAt`）。
  工作区根那个 `costs-import.json` 就是这种文件，`check-json.js` 已能识别 JSONL、不再误报。
- **AI 无法直接往云库写**：写入只有四条路 —— 小程序端 / 云函数 / 控制台 / HTTP API。前两条要跑在云环境内，
  控制台要用户的微信登录态，HTTP API 要 `access_token`，而它只能用 **AppSecret** 去换（`cgi-bin/token`）。
  要由 AI 包办就必须用户交出 AppSecret（**最高权限凭据，不建议**），否则最后一步永远要用户自己点。
  另：`databasemigrateimport` 的 `file_path` 要求文件**先上传到同环境云存储**
  （`getUploadTcbFileLink` 或开发者工具），不是本地路径直传。
- `config.js` 的 `cloudEnv` **已填** `cloud1-d8ggp5yeb4ac58051`（2026-09-12），`useCloud` 随之 true。
  集合 `packing` / `costs` / `guides` / `traffic` 均已建好并配自定义安全规则，云函数 `weather` 已上传部署。
- **新版云开发控制台的基础权限里没有「所有用户可读写」**（只有 4 个预设 + 自定义安全规则）。
  要让同行人都能读改，集合权限必须选「自定义安全规则」并填 `{"read": true, "write": true}`。
  `api/trip.js` 的读写都是无条件查询与 `doc().update/remove`，在 read/write 双 true 下全部放行
  （官方那条「doc 操作要转 where 操作」只针对带条件的规则，全放行不受影响）。

## 小程序跳转（交通记录「来源」在用）
- **`wx.navigateToMiniProgram` 现在不需要在 `app.json` 里声明 `navigateToMiniProgramAppIdList`**，
  使用限制只剩两条：必须由用户点击触发（基础库 2.3.0+）、跳转前微信统一弹确认框
  （取消 → `fail cancel`，`onOpenSource` 里已过滤，别当错误弹 toast）。
- **`appId` 不是必填**：传 `shortLink`（基础库 2.18.1+）即可跳，链接就是用户在微信里对目标小程序
  点「… → 复制链接」拿到的 `#小程序://名称/页面/短码`（名称夹在 `//` 和第一个 `/` 之间，
  `parseSource()` 靠这个把展示名抠出来）。所以**不用维护任何 appid 映射表**，用户粘什么跳什么。
- 开发者工具里调用**不会真跳**，但会校验这次调用是否合法（appid 无效会走 `fail`）；
  真跳只能在真机验。`envVersion` 仅当前小程序是开发版 / 体验版时有效。
- **坑（2026-09-15 实测踩到，用户「还是无法跳转」的真因）：工具里校验通过时走 `success`，
  `fail` 根本不触发。** 所以「开发者工具不会真跳」这句提示**必须拦在调用之前**，
  写在 `fail` 回调里等于白写：症状是工具里点一下毫无反应、连 toast 都没有，
  看着完全像功能坏了。现在 `onOpenSource` 先判 `devicePlatform() === 'devtools'`
  直接 toast 再 return，压根不发起调用。
- **`parseSource` 的正则不带 `^` 锚点**：链接常夹在一整条聊天消息里被一起复制过来，
  要求严格开头的话整段会被当成「来源名称」，跳转胶囊根本不渲染。切法分两种：
  整段即链接（`#小程序://` 开头）→ 取第一行原样，名称里万一有空格不会被切坏；
  夹在文字里 → 从 `#小程序://` 起按空白切成第一个 token，免得尾巴拖上「挺好用」让链接失效。
  `_tmp-parse-source.js` 式的自测要**从 `api/trip.js` 源码里抠函数体再执行**，别抄一份 ——
  抄一份测的就不是线上那段代码了。

## 离线校验链路（细节）
- 技能 `miniprogram-theme-retrofit` 在 `~/.workbuddy/skills/`：`lesscheck.js` / `selftest.js` /
  `check-json.js`（支持 JSONL 逐行合法，含 `countJsonLines()`）/ `check-components.js` / `build-preview.js`。
  跑法：`NODE_PATH=<node 工作区>/node_modules <绝对路径 node> <脚本> D:/LZB/LIN`（`less@4.9.1` 装在工作区）。
- `.workbuddy/` 下项目自检（绝对路径 node 跑，参数是相对工作区的路径）：
  `_syntax-check.js`（JS 语法，云函数按 `.cjs` 查）、`_check-consistency.js`（wxml class ↔ less、
  `trip.*` 字段 ↔ mock 对账）、`_check-preview.js`（编译产物选择器对账，`need[]` 是硬编码期望）、
  `_test-weather.js`（天气链路 31 项：云函数入参分支 + 顶部实况条 + 七天条 / 逐日组装，用 wx 替身跑）、
  `_slice.js`（分片核对：`node .workbuddy/_slice.js <起锚点> [止锚点]` → `.workbuddy/_check.html`）、
  `_post.js` / `_check-all.js` / `_run.js`（跑法见 `MEMORY.md`）。
- **`.workbuddy/_probe-week.js`**：把一段云函数真实响应塞进桩里跑前端组装，输出 7 格与逐日注入的实际结果
  → `.workbuddy/_out-week.txt`。**云端拿到的响应想确认「前端会长成什么样」就改这里的 `PAYLOAD` 再跑**，
  比进开发者工具翻 console 快。跑法同 `_post.js`（`_run.js` 标签换 `week`）。
- 预览链：`preview/_screens/*.html` → `interface-preview.html`。**首页片段由 `node preview/_gen-1home.js`
  从 mock 生成，别手改**；其余 6 个片段**是手写的、不走 LESS**，换肤时里面的内联色要逐个翻，
  否则预览新旧色混杂。
- **数 less 里的类不能拿全名**：嵌套写法是 `&__geo`，源码里没有 `day__geo` 这个字符串，
  拿全名去 `count()` 会得 0 而误判「样式丢了」。要么数 `&__xxx`，要么编译成 CSS 后再查选择器。
- **发现「内容变少了」时先跑 `_check-all.js` 再动手**：自检里硬编码的期望值会直接告诉你那是有意改动
  还是文件损坏（`_check-consistency.js` 的「无 budget 字段=true」就是这种哨兵）。
  2026-09-12 差点把用户特意下线的「04 费用预算」当成丢失去恢复。
- **删首页区块的联动清单**（漏一处不报错）：wxml 区块 → less 样式 → mock 常量 → mock export 字段 →
  mock `sections[]` 锚点（漏了会留一个点了没反应的导航项）→ `_gen-1home.js` 分片 →
  `.workbuddy/` 自检脚本里硬编码的期望（`_check-preview.js` 的 `need[]`、`_check-consistency.js` 的统计行，
  不改会直接 MISS / TypeError）。删前对关键词全量 grep（含 `hero.meta` 这种区块外文案）。
- 锚点跳转 / sticky / `onPageScroll` / 云读写 / 原生 picker 弹层 **离线验证不了**，必须开发者工具实机确认。

## 取脚本输出的正确姿势
- 真实原因是**管道按 GBK 解码了 python 的 UTF-8 输出**，中文必乱码
  （`川西消费明细` → `宸濊タ娑堣垂鏄庣粏`），**看着像文件名坏了其实是对的**。要 PowerShell 取输出时：

  ```powershell
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $env:PYTHONIOENCODING="utf-8"
  $out = & $py script.py 2>&1
  [System.IO.File]::WriteAllText($log, ($out -join "`n"), (New-Object System.Text.UTF8Encoding $false))
  ```

  比 `| Out-File -Encoding utf8` 可靠（后者仍受管道编码影响）。
- **Bash 工具在本机不可用**：`dirname` / `head` 这类基础命令都缺，一律走 PowerShell 或 `_run.js`。

## 本地 xlsx 生成链路（2026-09-13 立）
- **本机既没有 LibreOffice，也没装 `formulas` 引擎**。office 技能链默认的 `recalc.py` 必然返回
  `error`（`neither engine produced a complete set of cached values`），而 openpyxl 只写公式**字符串**、
  不带缓存值 → 公式格在预览器（微信 / 邮件附件、`data_only=True`、pandas）里读出来是**空白**。
- 所以**别走 openpyxl + recalc**。直接用 **xlsxwriter**：`ws.write_formula(row, col, 公式, fmt, value)`
  能同时写公式与缓存结果，一步成型、零外部依赖。缓存值用 Python 自己算好（同一份数据既喂公式也喂
  缓存值，天然自洽）。读回校验双开：`load_workbook(p)` 看公式、`load_workbook(p, data_only=True)`
  看缓存值，两者对不上就是缓存值没写进去。
- 隔离 venv：`C:\Users\Administrator\.workbuddy\binaries\python\envs\default`
  （已装 `openpyxl` + `xlsxwriter`），调用 `envs\default\Scripts\python.exe`。

## 从 MEMORY.md 下移的长尾（2026-09-15 精简）
### picker 百分比高度坑（2026-09-13 踩）
picker 组件内部有一层包装节点、高度 auto，子元素 `height: 100%` 相对它算不出结果 →
容器塌成内容高度 → `align-items: center` 无处可施。症状是**内容贴着格子上沿、上下不居中**，
而同排其他字段正常，容易误判成水平方向的问题。修法：高度写实（`.cform__catbox` → `height: 76rpx`）。
对照：「记一笔」按钮靠 `line-height: 76rpx` 居中，因为写死了高度所以没这毛病。

### 折叠交互样式模板
`__btn`（`@card-strong` 底 + `@border` 描边 + `@radius-sm`）、`__btn-t`（`@pine-deep` 24rpx 粗体 +
`letter-spacing: 1rpx`，`flex: 1`）、右侧 chevron `#8C9A94`。
花费明细 `costOpen` 默认收起，头条文案 `{{ costOpen ? '收起明细' : '展开全部 ' + costCount + ' 笔' }}`，
整块加 `wx:if="{{ costs.length }}"`（免得 0 笔时显示「展开全部 0 笔」），`onAddCost` 成功后置 true。

### 交通记录 07 的字段与形态
全陶土棕 `@clay`：`tform` / `tchip` / `tlist` / `titem`；日期与时间用原生 `picker`
（`start`/`end` 取自行程首尾日），方式 6 枚 chips，起止两个 input + 班次号。
字段 `{date, time, mode, from, to, no, src, link, who, createdAt}`：`date`/`time` 必填且格式卡死
（页面靠它排序落位），`from`/`to`/`no` 至少填一项、每项 ≤ 20 字，`mode` 6 项白名单兜底成「其他」，
`src` ≤ 30 字、`link` 是小程序链接（无链接则空）。
07 列表里来源独立一行（`.titem__src`，有 `link` 才 `.is-go`）；逐日时间线里是独立胶囊 `.tl__src`，
**必须 `catchtap="onOpenSource"`**（日卡里还有住宿行等可点元素，容器内可点元素一律拦冒泡）。
有 `link` 才出胶囊、副行只写「方式 · 班次号」；只写名称没链接的没有胶囊，来源名留在副行文字里。

### 组件 / API 补充
- `wx.switchTab` 在无 tabBar 下静默失效。
- `usingComponents` 必须与 wxml 标签一致（`t-toast`/`t-message`/`t-progress` 最易漏）。
- **同名 class 别跨区块复用**（班次表当年因此改名 `.sched`）。
- `wx.pageScrollTo` 别用裸 selector / `offsetTop`，自查 `boundingClientRect` + `scrollOffset` 再减吸顶条高度。
