import React from "react";
// 官方开关组件由宿主前端静态模块表提供，构建时外部化，保证与官方设置页视觉完全一致。
import { Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import { shouldSurfaceEvent } from "../lib/client-policy.js";
import { installNotificationNavIcon, notificationNavIcon, NOTIFICATION_NAV_ICON_CSS } from "../lib/settings-nav-icon.js";

const NS = "dshNotifications";
const CONFIG_PATH = "/dsh-notifications/api/config";
const EVENTS_PATH = "/dsh-notifications/api/events";
const DEFAULTS = Object.freeze({
  enabled: true,
  approvalPendingEnabled: true,
  questionPendingEnabled: true,
  taskSucceededEnabled: true,
  taskFailedEnabled: true,
  subagentTaskEndedEnabled: true
});

const FLAG_BY_TYPE = Object.freeze({
  approval_pending: "approvalPendingEnabled",
  question_pending: "questionPendingEnabled",
  task_succeeded: "taskSucceededEnabled",
  task_failed: "taskFailedEnabled"
});

const zh = {
  title: "消息通知",
  description: "审批、提问和任务结果提醒。",
  master: "启用消息通知",
  masterDesc: "关闭后不会接收任何会话通知。",
  approval: "待审批",
  approvalDesc: "会话等待你批准操作时通知。",
  question: "等待回答",
  questionDesc: "Agent 发起结构化提问时通知。",
  succeeded: "任务成功",
  succeededDesc: "任务正常完成时通知。",
  failed: "任务失败",
  failedDesc: "任务异常结束时通知。",
  subagentEnded: "子代理任务结束",
  subagentEndedDesc: "子代理任务成功或失败时通知。",
  permission: "通知权限",
  permissionDesc: "Web 通知由浏览器按 DSH 地址授权；实际提醒还受操作系统通知设置影响。",
  desktopPermissionDesc: "桌面应用使用系统通知。请在系统设置中允许 DeepSeek Harness 通知，并检查专注模式。",
  desktopPermissionFailed: "通知 API 未授权。请在系统设置中检查 DeepSeek Harness 的通知权限。",
  testFailed: "测试通知发送失败，请检查通知权限后重试。",
  testSent: "已请求显示测试通知；若未看到提醒，请检查系统通知权限和专注模式。",
  connection: "提醒事件连接",
  connectionDesc: "断线时自动重连；长时间中断时请重启应用或刷新页面。",
  connectionConnecting: "正在连接",
  connectionConnected: "已连接",
  connectionReconnecting: "重连中",
  connectionUnavailable: "连接不可用",
  connectionClosed: "已关闭",
  permissionUnsupported: "不支持",
  permissionDefault: "未授权",
  permissionGranted: "已授权",
  permissionDenied: "已拒绝",
  authorize: "授权通知",
  recheck: "重新检查",
  test: "发送测试通知",
  save: "保存",
  saving: "保存中…",
  reset: "恢复默认",
  expand: "展开设置",
  collapse: "收起设置",
  unsaved: "未保存",
  enabled: "开启",
  disabled: "关闭",
  unavailable: "设置服务不可用，当前使用默认配置。",
  conflict: "配置已在其他窗口更新，请重新加载后保存。",
  saveFailed: "保存失败，请稍后重试。",
  permissionFailed: "浏览器未授予通知权限。请在站点设置中允许通知。",
  testTitle: "DSH 测试通知",
  testBody: "消息通知插件工作正常。",
  notificationApproval: "DSH：等待审批",
  notificationQuestion: "DSH：等待回答",
  notificationSucceeded: "DSH：任务已完成",
  notificationFailed: "DSH：任务失败",
  conversation: "会话"
};

const en = {
  title: "Notifications",
  description: "Alerts for approvals, questions, and task outcomes.",
  master: "Enable notifications",
  masterDesc: "Turn off to suppress all conversation notifications.",
  approval: "Approval required",
  approvalDesc: "Notify when a conversation needs your approval.",
  question: "Answer required",
  questionDesc: "Notify when the agent asks a structured question.",
  succeeded: "Task succeeded",
  succeededDesc: "Notify when a task completes successfully.",
  failed: "Task failed",
  failedDesc: "Notify when a task ends with an error.",
  subagentEnded: "Subagent task ended",
  subagentEndedDesc: "Notify when a subagent task succeeds or fails.",
  permission: "Notification permission",
  permissionDesc: "The browser grants Web notification access per DSH origin. Delivery also depends on OS notification settings.",
  desktopPermissionDesc: "Desktop uses system notifications. Allow DeepSeek Harness in OS settings and check Focus mode.",
  desktopPermissionFailed: "Notification API access was not granted. Check DeepSeek Harness in OS notification settings.",
  testFailed: "The test notification could not be sent. Check notification access and try again.",
  testSent: "A test notification was requested. If it is missing, check OS notification access and Focus mode.",
  connection: "Alert stream connection",
  connectionDesc: "Reconnects automatically. Restart the app or refresh the page if the interruption persists.",
  connectionConnecting: "Connecting",
  connectionConnected: "Connected",
  connectionReconnecting: "Reconnecting",
  connectionUnavailable: "Unavailable",
  connectionClosed: "Closed",
  permissionUnsupported: "Unsupported",
  permissionDefault: "Not granted",
  permissionGranted: "Granted",
  permissionDenied: "Denied",
  authorize: "Allow notifications",
  recheck: "Check again",
  test: "Send test notification",
  save: "Save",
  saving: "Saving…",
  reset: "Reset defaults",
  expand: "Show settings",
  collapse: "Hide settings",
  unsaved: "Unsaved",
  enabled: "Enabled",
  disabled: "Disabled",
  unavailable: "Settings are unavailable; defaults are active.",
  conflict: "Settings changed in another window. Reload and try again.",
  saveFailed: "Settings could not be saved.",
  permissionFailed: "Notification permission was not granted. Allow it in the browser's site settings.",
  testTitle: "DSH test notification",
  testBody: "The notifications plugin is working.",
  notificationApproval: "DSH: approval required",
  notificationQuestion: "DSH: answer required",
  notificationSucceeded: "DSH: task completed",
  notificationFailed: "DSH: task failed",
  conversation: "Conversation"
};

const CSS = `
.dsh-notify-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s;color:var(--dsw-alias-label-primary)}
.dsh-notify-card:hover{border-color:var(--dsw-alias-label-dimmed)}.dsh-notify-card[data-open=true]{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.dsh-notify-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:transparent;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}.dsh-notify-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-notify-headText{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0}.dsh-notify-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.dsh-notify-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.dsh-notify-pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.dsh-notify-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.dsh-notify-chevron[data-open=true]{transform:rotate(180deg)}
.dsh-notify-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}.dsh-notify-body>.dsh-notify-row:first-child{border-top:0}
.dsh-notify-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2)}
.dsh-notify-rowText{display:flex;min-width:0;flex-direction:column;gap:2px}.dsh-notify-rowText strong{font-size:14px}.dsh-notify-rowText span{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dsh-notify-permission{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.dsh-notify-badge{border-radius:5px;padding:2px 7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.dsh-notify-badge[data-state=granted]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}.dsh-notify-badge[data-state=denied],.dsh-notify-badge[data-state=unsupported]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dsh-notify-actions{border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;flex-wrap:wrap}.dsh-notify-actions button,.dsh-notify-permission button{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}.dsh-notify-actions button[data-primary=true]{border-color:transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.dsh-notify-actions button:disabled,.dsh-notify-permission button:disabled{opacity:.4;cursor:default}.dsh-notify-actions button:focus-visible,.dsh-notify-permission button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-notify-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);margin:0}.dsh-notify-status[data-error=true]{color:var(--dsw-alias-state-error-primary)}
.dsh-notify-page{max-width:760px;margin:0;padding:0;list-style:none}
@media (max-width:720px){.dsh-notify-row{align-items:flex-start;flex-direction:column;gap:8px}.dsh-notify-permission{justify-content:flex-start}}
@media (prefers-reduced-motion:reduce){.dsh-notify-card,.dsh-notify-chevron{transition:none}}
` + NOTIFICATION_NAV_ICON_CSS;

function normalizeConfig(value) {
  const config = {};
  for (const key of Object.keys(DEFAULTS)) config[key] = !(value && value[key] === false);
  return config;
}

function createConfigStore() {
  let snapshot = { value: DEFAULTS, revision: undefined, writable: false, status: "loading" };
  const listeners = new Set();
  const set = (next) => { snapshot = next; listeners.forEach((listener) => listener()); };
  const request = async (options) => {
    const response = await fetch(CONFIG_PATH, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true) {
      const error = new Error(body?.error?.message || "settings request failed");
      error.code = body?.error?.code;
      throw error;
    }
    const next = { value: normalizeConfig(body.value), revision: body.revision, writable: body.writable === true, status: "ready" };
    set(next);
    return next;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async load() {
      try { return await request({ method: "GET", credentials: "same-origin" }); }
      catch { set({ value: DEFAULTS, revision: undefined, writable: false, status: "unavailable" }); return snapshot; }
    },
    save(patch) {
      return request({
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patch, expectedRevision: snapshot.revision })
      });
    },
    reset() {
      return request({
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reset: true, expectedRevision: snapshot.revision })
      });
    }
  };
}

export function permissionOf() {
  try { return typeof window.Notification === "function" ? window.Notification.permission : "unsupported"; }
  catch { return "unsupported"; }
}

function isDesktop() {
  return window.location?.protocol === "dsh-app:" && window.dshDesktop?.protocolVersion === 1;
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createLeaderElector(options = {}) {
  const id = options.id || randomId();
  const now = options.now || Date.now;
  const peers = new Map([[id, now()]]);
  const channelName = "dsh-notifications:leader";
  const leaseKey = "dsh-notifications:leader-lease";
  let channel;
  try { if (typeof BroadcastChannel === "function") channel = new BroadcastChannel(channelName); } catch {}

  const announce = () => {
    peers.set(id, now());
    channel?.postMessage({ id, at: now() });
  };
  if (channel) {
    channel.onmessage = (message) => {
      const value = message.data;
      if (value && typeof value.id === "string" && typeof value.at === "number") peers.set(value.id, value.at);
    };
    announce();
  }
  const timer = setInterval(announce, 2_000);

  const localLeader = () => {
    const currentTime = now();
    let lease;
    try { lease = JSON.parse(localStorage.getItem(leaseKey) || "null"); } catch {}
    if (!lease || typeof lease.expires !== "number" || lease.expires <= currentTime || lease.id === id) {
      const candidate = { id, expires: currentTime + 6_000 };
      try {
        localStorage.setItem(leaseKey, JSON.stringify(candidate));
        lease = JSON.parse(localStorage.getItem(leaseKey) || "null");
      } catch { return true; }
    }
    return lease?.id === id;
  };

  return {
    isLeader() {
      if (!channel) return localLeader();
      const cutoff = now() - 6_000;
      for (const [peerId, at] of peers) if (at < cutoff) peers.delete(peerId);
      peers.set(id, now());
      return [...peers.keys()].sort()[0] === id;
    },
    dispose() {
      clearInterval(timer);
      channel?.close();
      try {
        const lease = JSON.parse(localStorage.getItem(leaseKey) || "null");
        if (lease?.id === id) localStorage.removeItem(leaseKey);
      } catch {}
    }
  };
}

function sessionTitle(ctx, sessionId) {
  try {
    const session = ctx.sessions.list.getSnapshot().byId[sessionId];
    return session?.displayTitle || session?.title || sessionId;
  } catch { return sessionId; }
}

function notificationTitle(t, type) {
  return t({
    approval_pending: "notificationApproval",
    question_pending: "notificationQuestion",
    task_succeeded: "notificationSucceeded",
    task_failed: "notificationFailed"
  }[type]);
}

/** 新版主视图绑定优先，避免读取已经撤下的 list.current。 */
export function currentSessionId(ctx) {
  try {
    const uiSession = typeof ctx.get === "function" ? ctx.get("uiSession") : ctx.uiSession;
    const binding = uiSession?.adapter?.current?.getSnapshot();
    if (binding !== undefined && binding !== null) return binding.key;
    const snapshot = ctx.sessions.list.getSnapshot();
    const retained = Object.values(snapshot.byId || {}).find(row => (row.retainedBy?.mainView ?? 0) > 0);
    return retained?.id ?? snapshot.current;
  } catch { return undefined; }
}

function validAddress(address, sessionId) {
  return address && typeof address.parentSessionId === "string" && address.parentSessionId !== ""
    && address.parentSessionId !== sessionId && address.childSessionId === sessionId
    && (address.mode === "one-shot" || address.mode === "continuable");
}

/** 新版工作区导航支持尚未打开的子代理；旧版 Web 使用原有接口。 */
export async function openNotificationSession(ctx, event) {
  window.focus();
  const sessionId = event.sessionId;
  try {
    const knownAddress = ctx.sessions.subagentAddress?.(sessionId);
    const address = validAddress(event.address, sessionId) ? event.address
      : validAddress(knownAddress, sessionId) ? knownAddress : undefined;
    const workspace = typeof ctx.get === "function" ? ctx.get("uiWorkspace") : ctx.uiWorkspace;
    if (address !== undefined) {
      if (typeof workspace?.openSession === "function") { await workspace.openSession(address); return true; }
      if (typeof ctx.sessions.openSubagent === "function") { await ctx.sessions.openSubagent(address); return true; }
      return false;
    }
    // 缺少父子地址时不把子代理误当成顶层会话。已删除的普通会话仅聚焦。
    if (event.subagent === true) return false;
    if (ctx.sessions.list.getSnapshot().byId[sessionId] === undefined) await ctx.sessions.refresh?.();
    if (ctx.sessions.list.getSnapshot().byId[sessionId] === undefined) return false;
    if (typeof workspace?.openSession === "function") { await workspace.openSession(sessionId); return true; }
    if (typeof ctx.sessions.open === "function") { await ctx.sessions.open(sessionId); return true; }
    return false;
  } catch (error) {
    ctx.logger?.warn?.("dsh-notifications: could not open notification session", error);
    return false;
  }
}

export function createNotificationController(ctx, store, t, options = {}) {
  const seen = new Set();
  const leader = options.leader || createLeaderElector();
  let source;
  let disposed = false;
  let connection = "Connecting";
  const listeners = new Set();
  const setConnection = (next) => {
    if (connection === next) return;
    connection = next;
    for (const listener of listeners) listener();
  };

  const remember = (id) => {
    seen.add(id);
    if (seen.size > 512) seen.delete(seen.values().next().value);
  };

  const show = (title, details, onClick) => {
    try {
      const notification = new window.Notification(title, details);
      notification.onclick = () => { void onClick(); notification.close(); };
      return true;
    } catch (error) {
      ctx.logger?.warn?.("dsh-notifications: notification could not be sent", error);
      return false;
    }
  };

  const handle = (event) => {
    if (disposed || !event || typeof event.eventId !== "string" || typeof event.sessionId !== "string" || !(event.type in FLAG_BY_TYPE)) return;
    if (seen.has(event.eventId)) return;
    remember(event.eventId);
    if (!leader.isLeader() || !shouldSurfaceEvent({
      config: store.getSnapshot().value,
      event,
      permission: permissionOf(),
      visibilityState: document.visibilityState,
      documentHasFocus: typeof document.hasFocus === "function" ? document.hasFocus() : true,
      currentSessionId: currentSessionId(ctx)
    })) return;
    show(notificationTitle(t, event.type), {
      body: `${t("conversation")}：${sessionTitle(ctx, event.sessionId)}`,
      tag: event.eventId,
      renotify: false
    }, () => openNotificationSession(ctx, event));
  };

  return {
    getSnapshot: () => connection,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start() {
      try {
        if (typeof EventSource === "function") {
          // 桌面官方同源协议支持 SSE，并在主进程代理中保留认证和取消信号。
          source = new EventSource(EVENTS_PATH);
          source.addEventListener("open", () => { if (!disposed) setConnection("Connected"); });
          source.addEventListener("error", () => { if (!disposed) setConnection("Reconnecting"); });
          source.addEventListener("notification", (message) => {
            try { handle(JSON.parse(message.data)); }
            catch { ctx.logger?.warn?.("dsh-notifications: invalid notification event"); }
          });
        } else setConnection("Unavailable");
      } catch { setConnection("Unavailable"); ctx.logger?.warn?.("dsh-notifications: notification stream unavailable"); }
      return () => {
        disposed = true;
        source?.close();
        leader.dispose();
        setConnection("Closed");
      };
    },
    test() {
      if (disposed || permissionOf() !== "granted") return false;
      return show(t("testTitle"), { body: t("testBody"), tag: `dsh-notifications:test:${Date.now()}` }, () => window.focus());
    }
  };
}

function useStore(store) {
  const [snapshot, setSnapshot] = React.useState(store.getSnapshot());
  React.useEffect(() => store.subscribe(() => setSnapshot(store.getSnapshot())), [store]);
  return snapshot;
}

function ToggleRow({ title, description, checked, disabled = false, onChange }) {
  const h = React.createElement;
  // 尺寸、配色、禁用态与焦点环全部由官方 Switch 组件提供，与官方设置页保持同款外观。
  return h("div", { className: "dsh-notify-row" },
    h("div", { className: "dsh-notify-rowText" }, h("strong", null, title), h("span", null, description)),
    h(Switch, { checked, disabled, label: title, onChange: (next) => onChange(next) })
  );
}

function Chevron({ open }) {
  const h = React.createElement;
  return h("svg", {
    className: "dsh-notify-chevron",
    "data-open": open ? "true" : undefined,
    width: 14,
    height: 14,
    viewBox: "0 0 14 14",
    fill: "none",
    "aria-hidden": "true"
  }, h("path", {
    d: "M3 5.25 7 9.25 11 5.25",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}

function configsEqual(left, right) {
  return Object.keys(DEFAULTS).every((key) => left[key] === right[key]);
}

function SettingsCard({ store, controller, t }) {
  const snapshot = useStore(store);
  const connection = useStore(controller);
  const [draft, setDraft] = React.useState(snapshot.value);
  const [permission, setPermission] = React.useState(permissionOf());
  const [state, setState] = React.useState({ saving: false, error: "" });
  const [open, setOpen] = React.useState(true);
  const [testResult, setTestResult] = React.useState("");
  React.useEffect(() => setDraft(snapshot.value), [snapshot.value]);
  const dirty = !configsEqual(draft, snapshot.value);
  const patch = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const authorize = async () => {
    setState((current) => ({ ...current, error: "" }));
    try {
      if (permissionOf() === "default") await window.Notification.requestPermission();
      const next = permissionOf();
      setPermission(next);
      if (next !== "granted") setState((current) => ({ ...current, error: t(isDesktop() ? "desktopPermissionFailed" : "permissionFailed") }));
    } catch { setPermission(permissionOf()); setState((current) => ({ ...current, error: t(isDesktop() ? "desktopPermissionFailed" : "permissionFailed") })); }
  };
  const save = async () => {
    setState({ saving: true, error: "" });
    try { await store.save(draft); setState({ saving: false, error: "" }); }
    catch (error) {
      setState({ saving: false, error: error?.code === "settings-conflict" ? t("conflict") : t("saveFailed") });
      await store.load();
    }
  };
  const reset = async () => {
    setState({ saving: true, error: "" });
    try { await store.reset(); setState({ saving: false, error: "" }); }
    catch { setState({ saving: false, error: t("saveFailed") }); }
  };
  const testNotification = () => {
    // 发送操作放在事件处理器中，避免 React 重复执行状态更新器时重复通知。
    const sent = controller.test();
    setTestResult(sent ? t("testSent") : "");
    setState((current) => ({ ...current, error: sent ? "" : t("testFailed") }));
  };
  const h = React.createElement;
  return h("li", { className: "dsh-notify-card", "data-open": open ? "true" : undefined },
    h("button", {
      type: "button",
      className: "dsh-notify-header",
      "aria-expanded": open,
      "aria-label": `${t(open ? "collapse" : "expand")}：${t("title")}`,
      onClick: () => setOpen((current) => !current)
    },
      h("span", { className: "dsh-notify-headText" },
        h("span", { className: "dsh-notify-name" }, t("title")),
        h("span", { className: "dsh-notify-description" }, t("description"))
      ),
      dirty ? h("span", { className: "dsh-notify-pending" }, t("unsaved")) : null,
      h(Chevron, { open })
    ),
    open ? h("div", { className: "dsh-notify-body" },
      h(ToggleRow, { title: t("master"), description: t("masterDesc"), checked: draft.enabled, onChange: (value) => patch("enabled", value) }),
      h(ToggleRow, { title: t("approval"), description: t("approvalDesc"), checked: draft.approvalPendingEnabled, disabled: !draft.enabled, onChange: (value) => patch("approvalPendingEnabled", value) }),
      h(ToggleRow, { title: t("question"), description: t("questionDesc"), checked: draft.questionPendingEnabled, disabled: !draft.enabled, onChange: (value) => patch("questionPendingEnabled", value) }),
      h(ToggleRow, { title: t("succeeded"), description: t("succeededDesc"), checked: draft.taskSucceededEnabled, disabled: !draft.enabled, onChange: (value) => patch("taskSucceededEnabled", value) }),
      h(ToggleRow, { title: t("failed"), description: t("failedDesc"), checked: draft.taskFailedEnabled, disabled: !draft.enabled, onChange: (value) => patch("taskFailedEnabled", value) }),
      h(ToggleRow, { title: t("subagentEnded"), description: t("subagentEndedDesc"), checked: draft.subagentTaskEndedEnabled, disabled: !draft.enabled, onChange: (value) => patch("subagentTaskEndedEnabled", value) }),
      h("div", { className: "dsh-notify-row" },
        h("div", { className: "dsh-notify-rowText" }, h("strong", null, t("connection")), h("span", null, t("connectionDesc"))),
        h("span", { className: "dsh-notify-badge", role: "status" }, t(`connection${connection}`))
      ),
      h("div", { className: "dsh-notify-row" },
        h("div", { className: "dsh-notify-rowText" }, h("strong", null, t("permission")), h("span", null, t(isDesktop() ? "desktopPermissionDesc" : "permissionDesc"))),
        h("div", { className: "dsh-notify-permission" },
          h("span", { className: "dsh-notify-badge", "data-state": permission }, t(`permission${permission[0]?.toUpperCase()}${permission.slice(1)}`)),
          h("button", { type: "button", disabled: permission === "unsupported" || permission === "granted", onClick: authorize }, t("authorize")),
          h("button", { type: "button", onClick: () => setPermission(permissionOf()) }, t("recheck")),
          h("button", { type: "button", disabled: permission !== "granted", onClick: testNotification }, t("test"))
        )
      ),
      snapshot.status === "unavailable" ? h("p", { className: "dsh-notify-status", "data-error": "true" }, t("unavailable")) : null,
      state.error ? h("p", { className: "dsh-notify-status", "data-error": "true" }, state.error) : null,
      testResult ? h("p", { className: "dsh-notify-status", role: "status" }, testResult) : null,
      h("div", { className: "dsh-notify-actions" },
        h("button", { type: "button", "data-primary": "true", disabled: state.saving || !snapshot.writable || !dirty, onClick: save }, state.saving ? t("saving") : t("save")),
        h("button", { type: "button", disabled: state.saving || !snapshot.writable, onClick: reset }, t("reset"))
      )
    ) : null
  );
}

export const inject = ["slots", "locale", "sessions"];

export function apply(ctx) {
  const store = createConfigStore();
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-notifications: locale");
  const t = ctx.locale.bind(NS);
  const controller = createNotificationController(ctx, store, t);
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-notifications";
    tag.textContent = CSS;
    document.head.appendChild(tag);
    return () => tag.remove();
  }, "dsh-notifications: styles");
  ctx.effect(() => controller.start(), "dsh-notifications: event stream");
  // 使用独立设置分区，不再依赖「内置插件」页挂载；打开页面即展示所有配置。
  const SettingsPage = (props) => React.createElement("ul", { className: "dsh-notify-page" }, React.createElement(SettingsCard, props));
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "dsh-notifications",
    order: 70,
    label: () => t("title"),
    icon: notificationNavIcon(React),
    locale: NS,
    inject: () => ({ store, controller, t })
  }, SettingsPage));
  ctx.effect(() => installNotificationNavIcon(t), "dsh-notifications: settings nav icon");
  void store.load();
}
