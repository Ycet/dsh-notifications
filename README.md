# dsh-notifications

[English](./README.en.md)

DeepSeek Harness（DSH）Web 消息通知插件。当会话等待审批、发起结构化提问、成功完成或失败时，通过浏览器通知提醒用户，并支持点击通知打开对应会话。

## 功能特性

- 监听全部 DSH 会话，不限于当前打开的会话。
- 支持待审批、等待回答、任务成功、任务失败四类通知。
- 可单独开启或关闭子代理任务成功与失败通知。
- 当前会话正在前台查看时自动抑制重复提醒。
- 多个 DSH 标签页只由一个标签页发送通知。
- 点击通知聚焦 DSH 并打开对应会话。
- 在「设置 → 插件 → 插件配置」提供独立配置模块。
- 通知事件不包含聊天正文、问题内容、审批参数或工具参数。
- 中英文界面。

## 目录

- [兼容性](#兼容性)
- [安装](#安装)
- [使用方法](#使用方法)
- [配置 UI](#配置-ui)
- [配置说明](#配置说明)
- [工作原理](#工作原理)
- [开发与测试](#开发与测试)
- [已知限制](#已知限制)
- [如何获取帮助](#如何获取帮助)
- [如何贡献](#如何贡献)
- [许可证](#许可证)

## 兼容性

- DeepSeek Harness `0.1.0-rc.6`、`0.1.0-rc.7` 系列。
- Windows、macOS、Linux。
- 桌面版 Chrome、Edge、Brave、Chromium 等 Chromium 内核浏览器。
- DSH 页面必须保持打开；浏览器关闭后不能通知。
- 浏览器必须授予当前 DSH 地址通知权限。回环地址可使用 Web Notification API，非安全远程 HTTP 地址可能被浏览器拒绝。

## 安装

前提：已安装 DSH，且 pnpm 主版本与当前 profile 使用的 store 版本一致。

```bash
dsh plugin --profile web add dsh-notifications@file:/absolute/path/to/dsh-notifications
```

`file:` 安装是快照。更新源码后需要重新执行安装命令，再重启 `dsh web`；不要使用 `link:` 安装。

卸载：

```bash
dsh plugin --profile web remove dsh-notifications
```

## 使用方法

1. 安装插件并重启 `dsh web`。
2. 打开「设置 → 插件 → 插件配置」。
3. 展开「消息通知」模块。
4. 点击「授权通知」，在浏览器权限提示中选择允许。
5. 点击「发送测试通知」验证浏览器设置。
6. 按需开关各类通知及子代理任务结束通知并保存。

默认只有在 DSH 标签页处于后台，或事件来自非当前会话时才通知。点击通知会聚焦 DSH 并打开对应会话；若目标会话已经不存在，则只聚焦页面。

## 配置 UI

插件配置列表：

![消息通知插件配置列表](./docs/images/notification-settings-ui-01.png)

展开后的消息通知配置：

![消息通知插件展开配置](./docs/images/notification-settings-ui-02.png)

## 配置说明

配置存储在 DSH settings 服务的 `dsh-notifications` namespace：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `approvalPendingEnabled` | `true` | 待审批通知 |
| `questionPendingEnabled` | `true` | 结构化提问通知 |
| `taskSucceededEnabled` | `true` | 任务成功通知 |
| `taskFailedEnabled` | `true` | 任务失败通知 |
| `subagentTaskEndedEnabled` | `true` | 子代理任务成功或失败通知；关闭后不影响顶层任务通知 |

浏览器权限不写入 DSH 配置，由浏览器按 DSH origin 独立保存。

## 工作原理

```mermaid
flowchart LR
    E["DSH session/event"] --> C["Host 事件分类器"]
    C --> S["同源 SSE 事件流"]
    S --> F["配置与前台过滤"]
    F --> L["多标签页负责人选举"]
    L --> N["Web Notification API"]
    N --> O["点击后 sessions.open"]
```

Host 订阅 DSH `session/event`，只将事件归一化为以下安全结构：

```json
{
  "eventId": "session-id:sequence:event-type",
  "type": "approval_pending",
  "sessionId": "session-id",
  "occurredAt": 1786953600000
}
```

同源接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/dsh-notifications/api/config` | 读取配置与 revision |
| `POST` | `/dsh-notifications/api/config` | 保存或恢复默认配置 |
| `GET` | `/dsh-notifications/api/events` | SSE 通知事件流 |

SSE 仅在连接短暂中断时补发事件：Host 内存最多保存 256 条、5 分钟；首次连接和 Host 重启后不回放历史事件。

## 开发与测试

```bash
pnpm install
pnpm build
pnpm test
pnpm check
```

事件分类器采用显式结构契约：审批或提问必须是对应的 pending/request 事件，结构化提问也支持 `tool/call` 中的 `request_user_input` 等明确工具名；普通 assistant 文本不会按问号识别。`turn/end` 默认为成功，明确的失败结果映射为失败，取消和中止不通知。子代理通过 DSH 官方会话元数据 `origin: "subagent"` 或正数 `delegationDepth` 识别，不通过标题或 DOM 文本推断。

## 已知限制

- DSH 尚未公开完整事件 schema。插件会在 debug 日志中仅记录未知事件的类型和字段名，便于升级适配，不记录字段值。
- 如果目标 DSH 版本没有为某类状态提供官方事件，该类通知不会触发；插件不会通过 DOM 文案或 CSS 选择器猜测状态。
- Firefox 和 Safari 未列入首版验收范围。
- 不提供原生 Node 通知、浏览器关闭后的推送、自定义通知音或外部消息渠道。
- 多标签页采用 BroadcastChannel，并在不支持时用短期 localStorage 租约兜底；极端浏览器崩溃后最多等待约 6 秒重新选举。

## 如何获取帮助

提交 Issue 时请提供 DSH 版本、浏览器与操作系统版本、触发的事件类型以及脱敏后的 debug 日志。不要提交聊天正文、审批参数或凭据。

## 如何贡献

1. Fork 仓库并创建功能分支。
2. 修改 Host、Client 或事件 fixture。
3. 运行 `pnpm test`、`pnpm check` 和 `pnpm build`。
4. 提交 PR，并说明新增事件契约及兼容版本。

## 许可证

[MIT](./LICENSE)
