import React from "react";
import { shouldSurfaceEvent } from "../lib/client-policy.js";

const NS = "dshNotifications";
const CONFIG_PATH = "/dsh-notifications/api/config";
const EVENTS_PATH = "/dsh-notifications/api/events";
const DEFAULTS = Object.freeze({
  enabled: true,
  approvalPendingEnabled: true,
  questionPendingEnabled: true,
  taskSucceededEnabled: true,
  taskFailedEnabled: true
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
  permission: "浏览器权限",
  permissionDesc: "通知权限由当前浏览器按 DSH 地址管理。",
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
  permission: "Browser permission",
  permissionDesc: "Permission is managed by this browser for the current DSH origin.",
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
.dsh-notify-settings{max-width:680px;display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary)}
.dsh-notify-header{display:flex;flex-direction:column;gap:3px}.dsh-notify-header h3{font-size:16px;margin:0}.dsh-notify-header p{font-size:13px;color:var(--dsw-alias-label-secondary);margin:0;line-height:20px}
.dsh-notify-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2)}
.dsh-notify-rowText{display:flex;min-width:0;flex-direction:column;gap:2px}.dsh-notify-rowText strong{font-size:14px}.dsh-notify-rowText span{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dsh-notify-switch{position:relative;flex:none;width:42px;height:24px;border:0;border-radius:12px;background:var(--dsw-alias-border-l2);cursor:pointer}.dsh-notify-switch[data-active=true]{background:var(--dsw-alias-state-business-primary)}.dsh-notify-switch span{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform 120ms ease}.dsh-notify-switch[data-active=true] span{transform:translateX(18px)}
.dsh-notify-permission{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.dsh-notify-badge{border-radius:5px;padding:2px 7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.dsh-notify-badge[data-state=granted]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}.dsh-notify-badge[data-state=denied],.dsh-notify-badge[data-state=unsupported]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dsh-notify-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dsh-notify-actions button,.dsh-notify-permission button{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);padding:6px 10px;font:inherit;font-size:13px;cursor:pointer}.dsh-notify-actions button[data-primary=true]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:#fff}.dsh-notify-actions button:disabled,.dsh-notify-permission button:disabled{opacity:.5;cursor:default}
.dsh-notify-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);margin:0}.dsh-notify-status[data-error=true]{color:var(--dsw-alias-state-error-primary)}
@media (max-width:720px){.dsh-notify-row{align-items:flex-start;flex-direction:column;gap:8px}.dsh-notify-permission{justify-content:flex-start}}
@media (prefers-reduced-motion:reduce){.dsh-notify-switch span{transition:none}}
`;

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

function permissionOf() {
  return typeof window.Notification === "function" ? window.Notification.permission : "unsupported";
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

export function createNotificationController(ctx, store, t) {
  const seen = new Set();
  const leader = createLeaderElector();
  let source;

  const remember = (id) => {
    seen.add(id);
    if (seen.size > 512) seen.delete(seen.values().next().value);
  };

  const shouldNotify = (event) => {
    let current;
    try { current = ctx.sessions.list.getSnapshot().current; } catch {}
    return shouldSurfaceEvent({
      config: store.getSnapshot().value,
      event,
      permission: permissionOf(),
      visibilityState: document.visibilityState,
      documentHasFocus: document.hasFocus(),
      currentSessionId: current
    });
  };

  const openSession = (sessionId) => {
    window.focus();
    try {
      if (ctx.sessions.list.getSnapshot().byId[sessionId] !== undefined) ctx.sessions.open?.(sessionId);
    } catch {}
  };

  const handle = (event) => {
    if (!event || typeof event.eventId !== "string" || typeof event.sessionId !== "string" || !(event.type in FLAG_BY_TYPE)) return;
    if (seen.has(event.eventId)) return;
    remember(event.eventId);
    if (!leader.isLeader() || !shouldNotify(event)) return;
    const notification = new window.Notification(notificationTitle(t, event.type), {
      body: `${t("conversation")}：${sessionTitle(ctx, event.sessionId)}`,
      tag: event.eventId,
      renotify: false
    });
    notification.onclick = () => {
      openSession(event.sessionId);
      notification.close();
    };
  };

  return {
    start() {
      if (typeof EventSource !== "function") return () => leader.dispose();
      source = new EventSource(EVENTS_PATH);
      source.addEventListener("notification", (message) => {
        try { handle(JSON.parse(message.data)); }
        catch (error) { console.warn("[dsh-notifications] invalid event", error); }
      });
      return () => {
        source?.close();
        leader.dispose();
      };
    },
    test() {
      if (permissionOf() !== "granted") return false;
      const notification = new window.Notification(t("testTitle"), { body: t("testBody"), tag: `dsh-notifications:test:${Date.now()}` });
      notification.onclick = () => { window.focus(); notification.close(); };
      return true;
    }
  };
}

function useStore(store) {
  const [snapshot, setSnapshot] = React.useState(store.getSnapshot());
  React.useEffect(() => store.subscribe(() => setSnapshot(store.getSnapshot())), [store]);
  return snapshot;
}

function ToggleRow({ title, description, checked, onChange }) {
  const h = React.createElement;
  return h("div", { className: "dsh-notify-row" },
    h("div", { className: "dsh-notify-rowText" }, h("strong", null, title), h("span", null, description)),
    h("button", { type: "button", className: "dsh-notify-switch", role: "switch", "aria-checked": checked, "data-active": checked ? "true" : undefined, onClick: () => onChange(!checked) }, h("span", null))
  );
}

function SettingsCard({ store, controller, t }) {
  const snapshot = useStore(store);
  const [draft, setDraft] = React.useState(snapshot.value);
  const [permission, setPermission] = React.useState(permissionOf());
  const [state, setState] = React.useState({ saving: false, error: "" });
  React.useEffect(() => setDraft(snapshot.value), [snapshot.value]);
  const patch = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const authorize = async () => {
    setState((current) => ({ ...current, error: "" }));
    try {
      if (permissionOf() === "default") await window.Notification.requestPermission();
      const next = permissionOf();
      setPermission(next);
      if (next !== "granted") setState((current) => ({ ...current, error: t("permissionFailed") }));
    } catch { setPermission(permissionOf()); setState((current) => ({ ...current, error: t("permissionFailed") })); }
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
  const h = React.createElement;
  return h("section", { className: "dsh-notify-settings" },
    h("div", { className: "dsh-notify-header" }, h("h3", null, t("title")), h("p", null, t("description"))),
    h(ToggleRow, { title: t("master"), description: t("masterDesc"), checked: draft.enabled, onChange: (value) => patch("enabled", value) }),
    h(ToggleRow, { title: t("approval"), description: t("approvalDesc"), checked: draft.approvalPendingEnabled, onChange: (value) => patch("approvalPendingEnabled", value) }),
    h(ToggleRow, { title: t("question"), description: t("questionDesc"), checked: draft.questionPendingEnabled, onChange: (value) => patch("questionPendingEnabled", value) }),
    h(ToggleRow, { title: t("succeeded"), description: t("succeededDesc"), checked: draft.taskSucceededEnabled, onChange: (value) => patch("taskSucceededEnabled", value) }),
    h(ToggleRow, { title: t("failed"), description: t("failedDesc"), checked: draft.taskFailedEnabled, onChange: (value) => patch("taskFailedEnabled", value) }),
    h("div", { className: "dsh-notify-row" },
      h("div", { className: "dsh-notify-rowText" }, h("strong", null, t("permission")), h("span", null, t("permissionDesc"))),
      h("div", { className: "dsh-notify-permission" },
        h("span", { className: "dsh-notify-badge", "data-state": permission }, t(`permission${permission[0]?.toUpperCase()}${permission.slice(1)}`)),
        h("button", { type: "button", disabled: permission === "unsupported" || permission === "granted", onClick: authorize }, t("authorize")),
        h("button", { type: "button", onClick: () => setPermission(permissionOf()) }, t("recheck")),
        h("button", { type: "button", disabled: permission !== "granted", onClick: () => controller.test() }, t("test"))
      )
    ),
    snapshot.status === "unavailable" ? h("p", { className: "dsh-notify-status", "data-error": "true" }, t("unavailable")) : null,
    state.error ? h("p", { className: "dsh-notify-status", "data-error": "true" }, state.error) : null,
    h("div", { className: "dsh-notify-actions" },
      h("button", { type: "button", "data-primary": "true", disabled: state.saving || !snapshot.writable, onClick: save }, state.saving ? t("saving") : t("save")),
      h("button", { type: "button", disabled: state.saving || !snapshot.writable, onClick: reset }, t("reset"))
    )
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
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    id: "notifications",
    order: 70,
    inject: () => ({ store, controller, t })
  }, SettingsCard));
  void store.load();
}
