import React from "react";
import { detectPendingPlanReview, shouldSurfaceEvent } from "../lib/client-policy.js";

const NS = "dshNotifications";
const CONFIG_PATH = "/dsh-notifications/api/config";
const EVENTS_PATH = "/dsh-notifications/api/events";
const VIEWED_PATH = "/dsh-notifications/api/viewed";
const DEFAULTS = Object.freeze({
  enabled: true,
  approvalPendingEnabled: true,
  questionPendingEnabled: true,
  taskSucceededEnabled: true,
  taskFailedEnabled: true,
  subagentTaskEndedEnabled: true,
  faviconEnabled: true
});

const FAVICON_COLORS = Object.freeze({
  yellow: "F5C518",
  red: "E5484D",
  green: "30A46C"
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
  favicon: "鲸鱼图标状态变化",
  faviconDesc: "会话待处理、失败或完成时改变标签页鲸鱼图标颜色。",
  faviconLegend: "颜色优先级：黄（待审批/待回答）＞红（失败）＞绿（已完成，未查看）；点开对应会话后恢复默认色。",
  faviconStatus: "当前图标状态",
  faviconStatusDesc: "实时显示聚合状态与着色结果。",
  favLevelYellow: "黄色（待处理）",
  favLevelRed: "红色（失败）",
  favLevelGreen: "绿色（已完成）",
  favLevelNone: "默认色",
  favLevelDisabled: "已关闭",
  favErrorUnavailable: "favicon 不可用",
  favErrorNoFill: "favicon 无可用着色点",
  favErrorOk: "着色正常",
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
  favicon: "Favicon status indicator",
  faviconDesc: "Recolor the tab whale icon when sessions are pending, failed, or completed.",
  faviconLegend: "Color priority: yellow (pending) > red (failed) > green (completed, unviewed); opening the matching conversation restores the default.",
  faviconStatus: "Current status",
  faviconStatusDesc: "Live aggregate status and coloring result.",
  favLevelYellow: "Yellow (pending)",
  favLevelRed: "Red (failed)",
  favLevelGreen: "Green (completed)",
  favLevelNone: "Default",
  favLevelDisabled: "Disabled",
  favErrorUnavailable: "favicon unavailable",
  favErrorNoFill: "no recolorable fill",
  favErrorOk: "coloring OK",
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
.dsh-notify-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2)}.dsh-notify-row[data-disabled=true]{opacity:.48}
.dsh-notify-rowText{display:flex;min-width:0;flex-direction:column;gap:2px}.dsh-notify-rowText strong{font-size:14px}.dsh-notify-rowText span{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dsh-notify-switch{position:relative;flex:none;width:42px;height:24px;border:0;border-radius:12px;background:var(--dsw-alias-border-l2);cursor:pointer}.dsh-notify-switch[data-active=true]{background:var(--dsw-alias-state-business-primary)}.dsh-notify-switch:disabled{background:var(--dsw-alias-border-l2);cursor:not-allowed}.dsh-notify-switch:disabled[data-active=true]{background:var(--dsw-alias-label-tertiary)}.dsh-notify-switch span{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform 120ms ease}.dsh-notify-switch[data-active=true] span{transform:translateX(18px)}
.dsh-notify-permission{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.dsh-notify-badge{border-radius:5px;padding:2px 7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.dsh-notify-badge[data-state=granted]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}.dsh-notify-badge[data-state=denied],.dsh-notify-badge[data-state=unsupported]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dsh-notify-badge[data-fav=yellow]{color:#F5C518;background:color-mix(in srgb,#F5C518 12%,transparent)}
.dsh-notify-badge[data-fav=red]{color:#E5484D;background:color-mix(in srgb,#E5484D 12%,transparent)}
.dsh-notify-badge[data-fav=green]{color:#30A46C;background:color-mix(in srgb,#30A46C 12%,transparent)}
.dsh-notify-badge[data-fav-error=true]{color:var(--dsw-alias-state-error-primary)}
.dsh-notify-actions{border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;flex-wrap:wrap}.dsh-notify-actions button,.dsh-notify-permission button{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}.dsh-notify-actions button[data-primary=true]{border-color:transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.dsh-notify-actions button:disabled,.dsh-notify-permission button:disabled{opacity:.4;cursor:default}.dsh-notify-actions button:focus-visible,.dsh-notify-permission button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-notify-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);margin:0}.dsh-notify-status[data-error=true]{color:var(--dsw-alias-state-error-primary)}
.dsh-notify-legend{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0 2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}.dsh-notify-legendDot{width:14px;height:14px;border-radius:4px;flex:none}
@media (max-width:720px){.dsh-notify-row{align-items:flex-start;flex-direction:column;gap:8px}.dsh-notify-permission{justify-content:flex-start}}
@media (prefers-reduced-motion:reduce){.dsh-notify-card,.dsh-notify-chevron,.dsh-notify-switch span{transition:none}}
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

/**
 * Recolors the page favicon (the DSH whale) by rewriting the served SVG's
 * fill color into a data URL. The original SVG is fetched once and cached;
 * restore() switches back to the original href. Failures keep the default
 * icon and warn once.
 */
export function createFaviconController() {
  let link = null;
  let originalHref = "";
  let template = null;
  let warned = false;
  let lastError = null;

  const findLink = () => {
    if (link && link.isConnected) return link;
    link = document.querySelector('link[rel="icon"]');
    return link;
  };

  const loadTemplate = async () => {
    const current = findLink();
    if (!current || typeof current.href !== "string" || current.href === "") return null;
    const href = current.href.startsWith("data:") && originalHref !== "" ? originalHref : current.href;
    if (template === null || originalHref !== href) {
      const response = await fetch(href);
      if (!response.ok) return null;
      const text = await response.text();
      if (!/<svg[\s\S]*<\/svg>/i.test(text)) return null;
      originalHref = href;
      template = text
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/fill="#0{3}(?:0{3})?"/gi, 'fill="__DSH_FILL__"');
    }
    return template;
  };

  return {
    async apply(level) {
      lastError = null;
      if (level !== "yellow" && level !== "red" && level !== "green") {
        const current = findLink();
        if (current && originalHref !== "" && current.href !== originalHref) current.href = originalHref;
        return;
      }
      try {
        const source = await loadTemplate();
        if (source === null) {
          lastError = "unavailable";
          if (!warned) { warned = true; console.warn("[dsh-notifications] favicon is unavailable, keeping the default icon"); }
          return;
        }
        if (!source.includes("__DSH_FILL__")) {
          lastError = "no-fill";
          if (!warned) { warned = true; console.warn("[dsh-notifications] favicon has no recolorable fill, keeping the default icon"); }
          return;
        }
        const svg = source.replaceAll("__DSH_FILL__", `#${FAVICON_COLORS[level]}`);
        const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        const current = findLink();
        if (current && current.href !== url) current.href = url;
        warned = false;
      } catch (error) {
        lastError = String(error);
        if (!warned) { warned = true; console.warn("[dsh-notifications] favicon update failed", error); }
      }
    },
    getStatus() { return { lastError }; }
  };
}

/**
 * Combines host-pushed pending/failed levels (SSE "state" events) with the
 * client-side "completed and unviewed" sessions from the live session list.
 * Reports opened sessions (current changes) to the host so their color
 * contribution clears. Priority yellow > red > green is applied last.
 */
export function createStateController({ controller, store, sessions }) {
  let yellow = false;
  let red = false;
  let green = false;
  let planReviewPending = false;
  let lastCurrentId;
  const listeners = new Set();

  const currentLevel = () => {
    if (store.getSnapshot().value.faviconEnabled !== true) return null;
    return (yellow || planReviewPending) ? "yellow" : red ? "red" : green ? "green" : null;
  };

  const apply = () => {
    controller.apply(currentLevel());
    listeners.forEach((listener) => { try { listener(); } catch {} });
  };

  const refreshGreen = () => {
    let next = false;
    try {
      const byId = sessions.list.getSnapshot().byId || {};
      for (const id of Object.keys(byId)) {
        const row = byId[id];
        if (row && row.completed === true && row.origin !== "subagent") { next = true; break; }
      }
    } catch {}
    if (next !== green) { green = next; apply(); }
  };

  const refreshPlanReview = () => {
    let next = false;
    try {
      const snapshot = sessions.list.getSnapshot();
      next = detectPendingPlanReview(snapshot.byId || {}, snapshot.current);
    } catch {}
    if (next !== planReviewPending) { planReviewPending = next; apply(); }
  };

  const reportViewed = (sessionId) => {
    if (typeof sessionId !== "string" || sessionId === "") return;
    const body = JSON.stringify({ sessionId });
    fetch(VIEWED_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body
    }).catch(() => {});
  };

  const watchCurrent = () => {
    let current;
    try { current = sessions.list.getSnapshot().current; } catch { return; }
    if (typeof current === "string" && current !== "" && current !== lastCurrentId) reportViewed(current);
    lastCurrentId = current;
  };

  const reportCurrentViewed = () => {
    let current;
    try { current = sessions.list.getSnapshot().current; } catch { return; }
    reportViewed(current);
  };

  return {
    handleState(message) {
      try {
        const payload = JSON.parse(message.data);
        const nextYellow = payload?.level === "yellow";
        const nextRed = payload?.level === "red";
        if (nextYellow !== yellow || nextRed !== red) {
          yellow = nextYellow;
          red = nextRed;
          apply();
        }
      } catch {}
    },
    start() {
      const disposers = [store.subscribe(() => apply())];
      try { disposers.push(sessions.list.subscribe(() => { refreshGreen(); refreshPlanReview(); watchCurrent(); })); } catch {}
      refreshGreen();
      refreshPlanReview();
      watchCurrent();
      // 页面重新获得焦点/回到可见状态时（从其他标签页或应用切回 DSH），
      // 当前会话视为已打开：上报 viewed 清除其颜色贡献，
      // 避免"任务完成后切回页面图标仍残留颜色，需切换会话才能恢复"的问题。
      const onVisibility = () => { if (document.visibilityState === "visible") reportCurrentViewed(); };
      const onFocus = () => reportCurrentViewed();
      if (typeof document?.addEventListener === "function" && typeof window?.addEventListener === "function") {
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("focus", onFocus);
        disposers.push(() => {
          document.removeEventListener("visibilitychange", onVisibility);
          window.removeEventListener("focus", onFocus);
        });
      }
      return () => disposers.forEach((dispose) => { try { dispose(); } catch {} });
    },
    getLevel() { return currentLevel(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}

export function createNotificationController(ctx, store, t, options = {}) {
  const seen = new Set();
  const leader = createLeaderElector();
  let source;
  const onState = typeof options.onState === "function" ? options.onState : null;
  const onDispose = typeof options.onDispose === "function" ? options.onDispose : null;

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
      if (typeof EventSource !== "function") return () => { leader.dispose(); onDispose?.(); };
      source = new EventSource(EVENTS_PATH);
      source.addEventListener("notification", (message) => {
        try { handle(JSON.parse(message.data)); }
        catch (error) { console.warn("[dsh-notifications] invalid event", error); }
      });
      if (onState !== null) source.addEventListener("state", onState);
      return () => {
        source?.close();
        leader.dispose();
        onDispose?.();
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

function ToggleRow({ title, description, checked, disabled = false, onChange }) {
  const h = React.createElement;
  return h("div", { className: "dsh-notify-row", "data-disabled": disabled ? "true" : undefined },
    h("div", { className: "dsh-notify-rowText" }, h("strong", null, title), h("span", null, description)),
    h("button", { type: "button", className: "dsh-notify-switch", role: "switch", "aria-label": title, disabled, "aria-checked": checked, "aria-disabled": disabled, "data-active": checked ? "true" : undefined, onClick: () => onChange(!checked) }, h("span", null))
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

function SettingsCard({ store, controller, t, stateController, favicon }) {
  const snapshot = useStore(store);
  const [draft, setDraft] = React.useState(snapshot.value);
  const [permission, setPermission] = React.useState(permissionOf());
  const [state, setState] = React.useState({ saving: false, error: "" });
  const [open, setOpen] = React.useState(false);
  const [favState, setFavState] = React.useState(() => ({ level: stateController.getLevel(), error: favicon.getStatus().lastError }));
  React.useEffect(() => setDraft(snapshot.value), [snapshot.value]);
  React.useEffect(() => stateController.subscribe(() => {
    setFavState({ level: stateController.getLevel(), error: favicon.getStatus().lastError });
  }), [stateController, favicon]);
  const dirty = !configsEqual(draft, snapshot.value);
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
      h(ToggleRow, { title: t("favicon"), description: t("faviconDesc"), checked: draft.faviconEnabled, onChange: (value) => patch("faviconEnabled", value) }),
      h("div", { className: "dsh-notify-legend" },
        h("span", { className: "dsh-notify-legendDot", style: { background: "#F5C518" } }),
        h("span", { className: "dsh-notify-legendDot", style: { background: "#E5484D" } }),
        h("span", { className: "dsh-notify-legendDot", style: { background: "#30A46C" } }),
        h("span", null, t("faviconLegend"))
      ),
      h("div", { className: "dsh-notify-row" },
        h("div", { className: "dsh-notify-rowText" }, h("strong", null, t("faviconStatus")), h("span", null, t("faviconStatusDesc"))),
        h("div", { className: "dsh-notify-permission" },
          h("span", { className: "dsh-notify-badge", "data-fav": favState.level || "none" },
            t(favState.level ? `favLevel${favState.level[0]?.toUpperCase()}${favState.level.slice(1)}` : (snapshot.value.faviconEnabled === true ? "favLevelNone" : "favLevelDisabled"))),
          h("span", { className: "dsh-notify-badge", "data-fav-error": favState.error ? "true" : undefined },
            favState.error ? t(`favError${favState.error === "no-fill" ? "NoFill" : "Unavailable"}`) : t("favErrorOk"))
        )
      ),
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
  const favicon = createFaviconController();
  const stateController = createStateController({ controller: favicon, store, sessions: ctx.sessions });
  const controller = createNotificationController(ctx, store, t, {
    onState: (message) => stateController.handleState(message)
  });
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-notifications";
    tag.textContent = CSS;
    document.head.appendChild(tag);
    return () => tag.remove();
  }, "dsh-notifications: styles");
  ctx.effect(() => controller.start(), "dsh-notifications: event stream");
  ctx.effect(() => stateController.start(), "dsh-notifications: favicon state");
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    key: "dsh-notifications",
    id: "notifications",
    order: 70,
    inject: () => ({ store, controller, t, stateController, favicon })
  }, SettingsCard));
  void store.load();
}
