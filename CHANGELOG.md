# 变更记录 / Changelog

本文件记录 dsh-notifications 的版本变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

- 本文件于 2026-09-11 依据本仓库 git 提交历史回填；版本号与日期取自本目录 `package.json` 的 `version` 与实际提交时间。
- 上游仓库：[Ycet/dsh-notifications](https://github.com/Ycet/dsh-notifications)。
- **版本口径**：`0.2.3` 未写入本仓库的 `package.json`，其改动与 `0.2.4` 一并通过 `22fa0dc` 补上版本递增，故合并在 `[0.2.4]` 小节记录（上游插件仓库另有 `v0.2.3` 标签）。
- 条目末尾的短哈希（如 `a57cb0c`）为对应提交，便于追溯。

## [0.2.6] - 2026-09-12

### 修复 / Fixed

- 修复打开运行中的会话后，“已查看”标记抑制同一轮后续完成、失败提醒的问题；新审批、提问和任务结果重新标记为未查看。
- 统一切回浏览器标签页、切回应用和打开会话的确认语义：仅在页面可见且有焦点时确认当前会话已有的提醒，不再被运行状态或待处理快照阻止；其他会话的提醒继续保留。
- 修复计划审批始终排除当前选中会话的问题：切换到其他标签页或应用后，当前会话的计划审批也参与黄色状态聚合。
- 防止后台初始化或后台切换会话误报已查看，并在前台收到延迟状态帧时补报。
- 为异步 SVG 着色增加请求序号，防止旧请求覆盖恢复默认色或较新的颜色。
- 新增前后台切换、四类提醒、计划审批、同轮多次提醒及 SVG 异步乱序回归测试；本地核对 DSH `0.1.5-rc.1` 的快照与挂载接口。尚未在运行中的浏览器实测。

## [0.2.5] - 2026-09-07

### 修复 / Fixed

- **兼容 DSH `0.1.2-rc.1` 的待处理交互（pending interaction）快照**（`a57cb0c`）。rc.1 把待处理状态移出会话列表行，原先依赖 `row.pendingInteraction === "plan-review"` 的判断失效，plan-review 待审批时鲸鱼图标不再变黄。
  - `detectPendingPlanReview()` 签名改为 `(pendingBySession, byId, currentSessionId)`，改从按会话 id 索引的待处理快照读取 `pending?.kind === "plan-review"`（同时兼容 `Map` 与普通对象）；
  - `isCurrentSessionBusy()` 同样改用该快照判断当前会话是否处于待处理 / 运行态；
  - 新增经 `shell.overlay` 挂载的桥接组件：接收 rc.1 提供的根待处理交互 Hook（本身不渲染内容），在设置面板关闭时仍保持挂载，因此后台的 plan-review 依旧能驱动 favicon 变色；快照通过 `setPendingInteractions()` 注入状态机。
- 新增 `test/pending-interactions.test.mjs`（约 78 行），并同步调整 `client-policy` / keyed-slot 兼容与包结构测试。
- English: Adapted to DSH `0.1.2-rc.1`, which moved pending interactions out of session-list rows. Plan-review detection now reads a session-id keyed pending snapshot (Map or plain object) and a headless `shell.overlay` bridge keeps receiving that snapshot while Settings is closed, so background plan reviews still turn the favicon yellow.

## [0.2.4] - 2026-09-06

### 修复 / Fixed

- 修复切回页面时**误清除活跃会话**状态的问题（`7d16fa5`，提交信息标为 v0.2.4）：
  - `tool/result` 的 `callId` 兼容处理，避免提问已被回答却仍停留为待处理；
  - 调整待处理（pending）与「已查看（viewed）」的判定优先级，pending 优先。
- 修复切回页面时**已读会话颜色残留**的问题；新增 `visibilitychange` / `focus` 监听，页面重新可见时自动上报「当前会话已查看」（`767c6a1`，提交信息标为 v0.2.3，改动并入本版本发布）。

### 变更 / Changed

- 修正 `package.json` 版本号至 `0.2.4`，补上 `v0.2.3` / `v0.2.4` 两次提交遗漏的版本递增（`22fa0dc`）。

## [0.2.2] - 2026-08-27

### 修复 / Fixed

- 修复 plan-review 待审批时鲸鱼图标不变黄的问题：改由客户端会话列表检测待处理状态（`835c2d8`）。

## [0.2.1] - 2026-08-27

### 修复 / Fixed

- 修复鲸鱼图标着色失效与提问状态残留（`04c4be8`）。
- 新增调试端点与状态显示，便于排查颜色状态机。

## [0.2.0] - 2026-08-26

### 新增 / Added

- 新增**标签页鲸鱼图标状态变色**：会话待处理 / 失败 / 完成时图标变为黄 / 红 / 绿，优先级 **黄 ＞ 红 ＞ 绿**，点开对应会话后清除该会话的颜色贡献；提供独立开关，无需浏览器通知权限（`aec34e0`）。

## [0.1.5] - 2026-08-19

### 变更 / Changed

- 按 AGENTS 规范重构中英文 README，并更新界面截图（`94db0b0`）。

## [0.1.4] - 2026-08-18

### 修复 / Fixed

- 修复总开关关闭时子项仍可交互的问题（`e014faa`）。

## [0.1.3] - 2026-08-18

### 新增 / Added

- 新增**子代理任务结束通知**独立开关，关闭后不影响顶层任务通知（`e319273`）。

## [0.1.2] - 2026-08-17

### 修复 / Fixed

- 适配 DSH `0.1.0-rc.7` 的 keyed slot，并补充兼容性回归测试（`239168f`）。

## [0.1.1] - 2026-08-17

### 变更 / Changed

- 优化设置页折叠配置卡片，并补充中英文文档（`436026f`）。
- README 文档修订（`b84e5a5`）。

## [0.1.0] - 2026-08-17

### 新增 / Added

- 首个版本：监听全部 DSH 会话，在待审批、结构化提问、任务成功 / 失败时发送浏览器通知（点击通知打开对应会话），并在「设置 → 插件 → 插件配置」提供独立配置模块；通知事件不含聊天正文、问题内容、审批参数与工具参数（`cf73b73`）。

---

> 本文件覆盖 `package.json` 中实际出现过的版本号（`0.1.0` – `0.2.5`）；更细的提交级改动可通过 `git log -- dsh-notifications` 查询。
