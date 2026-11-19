import z from "@deepseek-ai/schemastery";
import { createEventClassifier, eventContract } from "./lib/classifier.js";
import { createEventHub } from "./lib/event-hub.js";

// 插件名必须等于 package.json 的 name（npm 发布名为 @ycet/dsh-notifications）。
export const name = "@ycet/dsh-notifications";
export const inject = ["webServer", "settings"];

export const SETTINGS_NAMESPACE = "dsh-notifications";
export const DEFAULTS = Object.freeze({
  enabled: true,
  approvalPendingEnabled: true,
  questionPendingEnabled: true,
  taskSucceededEnabled: true,
  taskFailedEnabled: true,
  subagentTaskEndedEnabled: true
});

export const SettingsSchema = z.object({
  enabled: z.boolean().default(DEFAULTS.enabled),
  approvalPendingEnabled: z.boolean().default(DEFAULTS.approvalPendingEnabled),
  questionPendingEnabled: z.boolean().default(DEFAULTS.questionPendingEnabled),
  taskSucceededEnabled: z.boolean().default(DEFAULTS.taskSucceededEnabled),
  taskFailedEnabled: z.boolean().default(DEFAULTS.taskFailedEnabled),
  subagentTaskEndedEnabled: z.boolean().default(DEFAULTS.subagentTaskEndedEnabled)
});

/** 新版 DSH 从插件 Config 的 volatile 字段生成持久化设置表单。 */
export const Config = z.object(Object.fromEntries(
  Object.entries(DEFAULTS).map(([key, value]) => [key, z.boolean().default(value).volatile()])
));

export const CONFIG_PATH = "/dsh-notifications/api/config";
export const EVENTS_PATH = "/dsh-notifications/api/events";
export const DEBUG_PATH = "/dsh-notifications/api/debug";
// 审批提醒宽限期：官方在 never 策略或信号已中止时会立即补写 approval/decided，
// 这类请求并不真的等待用户，短暂等待可避免弹出空的“等待审批”提醒。
export const APPROVAL_GRACE_MS = 1500;
const FLAG_BY_TYPE = Object.freeze({
  approval_pending: "approvalPendingEnabled",
  question_pending: "questionPendingEnabled",
  task_succeeded: "taskSucceededEnabled",
  task_failed: "taskFailedEnabled"
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/**
 * 浏览器信任围栏（Host + Origin + 浏览器凭据）。
 *
 * 首选官方 Host `connection` 服务的 `requestRejection(request)`：它一次判完
 * 回环 / 绑定地址 / trustedHosts / sec-fetch-site / Origin，并要求请求携带已认证
 * 的浏览器 Peer，返回 403、401 或 undefined。该服务自 0.2.1 起就已存在
 * （`@deepseek-ai/dsh-client-connection`），是官方给「非内建 Web 路由」准备的口子。
 *
 * 服务缺失（更老的 dsh、或未挂载 Web 载体的进程）时退回本地判定，放行集合与
 * 旧实现保持一致：回环一律放行，非回环必须命中受信主机列表。
 *
 * @param {{ headers: Record<string, unknown> }} req 原始 HTTP 请求（只需要 headers）
 * @param {*} ctx 宿主上下文
 * @returns {boolean} 该请求是否可信
 */
export function trustedRequest(req, ctx) {
  const connection = ctx?.get?.("connection");
  if (connection !== null && connection !== undefined && typeof connection.requestRejection === "function") {
    try {
      // 官方语义：undefined 表示放行；403/401 表示拒绝。
      return connection.requestRejection({ headers: req.headers }) === undefined;
    } catch {
      /* 服务异常时退回本地判定 */
    }
  }
  return localTrustedRequest(req, ctx, connection);
}

/**
 * 本地信任判定（回退路径）：回环 / 受信主机列表 + 非跨站 + 同源。
 * 受信主机来源取官方 `connection.trustedHosts`，其次 `webStartup.trustedHosts`；
 * 旧实现读的 `webRuntime` 服务在任何 dsh 版本中都不存在，已移除。
 */
function localTrustedRequest(req, ctx, connection) {
  const host = req.headers.host;
  if (typeof host !== "string" || host === "") return false;
  let hostname;
  try { hostname = new URL(`http://${host}`).hostname; }
  catch { return false; }
  if (!isLoopbackHostname(hostname)) {
    const trustedHosts = connection?.trustedHosts ?? ctx?.get?.("webStartup")?.trustedHosts;
    if (!Array.isArray(trustedHosts)) return false;
    const accepted = trustedHosts.some(
      (candidate) => typeof candidate === "string" && (candidate === host || candidate.split(":")[0] === hostname)
    );
    if (!accepted) return false;
  }
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try { return new URL(origin).host === host; }
  catch { return false; }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += buffer.length;
    if (total > 64 * 1024) throw new Error("request body too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("request body is not valid JSON"); }
}

function configOf(config) {
  const result = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    const field = config?.[key];
    try {
      const value = typeof field?.get === "function" ? field.get() : field;
      if (typeof value === "boolean") result[key] = value;
    } catch { /* 服务关闭时保留默认值。 */ }
  }
  return result;
}

export function normalizeConfig(value) {
  // 只接受仍在使用的开关，旧版图标设置和其他未知字段不再进入通知配置。
  return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) =>
    [key, typeof value?.[key] === "boolean" ? value[key] : fallback]
  ));
}

function configView(settings, config, entryId) {
  const descriptor = settings.describe({ redactSecrets: true }).find((candidate) => String(candidate.ns) === entryId);
  return {
    value: configOf(config),
    revision: descriptor?.revision,
    writable: descriptor !== undefined && settings.writable !== false
  };
}

function normalizePatch(value) {
  if (!isPlainObject(value)) throw new Error("patch must be an object");
  const patch = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in value)) continue;
    if (typeof value[key] !== "boolean") throw new Error(`${key} must be boolean`);
    patch[key] = value[key];
  }
  if (Object.keys(patch).length === 0) throw new Error("no supported settings supplied");
  return patch;
}

export function isSubagentSession(session) {
  const header = isPlainObject(session?.header) ? session.header : {};
  return header.origin === "subagent"
    || (Number.isSafeInteger(header.delegationDepth) && header.delegationDepth > 0);
}

/** 子代理点击必须携带官方直接父子地址，不能当作普通顶层会话打开。 */
export function notificationAddress(session, ctx) {
  if (!isSubagentSession(session) || typeof session.header.parentSession !== "string") return undefined;
  const mode = subagentMode(session, ctx);
  if (mode === undefined) return undefined;
  return { parentSessionId: session.header.parentSession, childSessionId: session.id, mode };
}

/**
 * 读取子代理描述模式。
 *
 * 首选官方非弃用读取 `sessionProjections.snapshot(session, ["subagent"])`：
 * 它返回该投影的 wire 视图（`{ mode, label, seq }` 或 null），也是官方子代理
 * 模块自己使用的方式。更老的 0.2.1 只提供已弃用的 `stateOf`，此时退回读取；
 * 两者都不可用时不提供地址，客户端会退化为仅聚焦窗口。
 *
 * @param {*} session 会话对象
 * @param {*} ctx 宿主上下文
 * @returns {"one-shot" | "continuable" | undefined} 可用的子代理模式
 */
function subagentMode(session, ctx) {
  const projections = ctx?.get?.("sessionProjections");
  if (projections === null || projections === undefined) return undefined;
  try {
    const identity = projections.snapshot?.(session, ["subagent"])?.values?.subagent;
    if (identity?.mode === "one-shot" || identity?.mode === "continuable") return identity.mode;
  } catch { /* 旧版没有 snapshot 时继续尝试弃用读取。 */ }
  try {
    const identity = projections.stateOf?.(session, "subagent")?.identity;
    if (identity?.mode === "one-shot" || identity?.mode === "continuable") return identity.mode;
  } catch { /* 两种读取都不可用时不给地址。 */ }
  return undefined;
}

export function notificationEnabled(config, type, session) {
  const flag = FLAG_BY_TYPE[type];
  if (config.enabled !== true || flag === undefined || config[flag] !== true) return false;
  const taskEnded = type === "task_succeeded" || type === "task_failed";
  return !taskEnded || !isSubagentSession(session) || config.subagentTaskEndedEnabled === true;
}

/**
 * 注册通知插件。
 *
 * @param {*} ctx 宿主上下文
 * @param {*} config 已解析的插件配置
 * @param {{ approvalGraceMs?: number }} [options] 仅测试使用：覆盖审批宽限期，
 *   传 0 表示立即发布（DSH 只会传入前两个参数）。
 */
export function apply(ctx, config = Config({}), options = {}) {
  // 设置 API 以 Loader entry id 定址，不能用旧 settings.yaml 的段名。
  const entryId = ctx.fiber?.entry?.options?.id ?? "notifications";
  const graceMs = Number.isFinite(options?.approvalGraceMs)
    ? Math.max(0, options.approvalGraceMs)
    : APPROVAL_GRACE_MS;

  const classifier = createEventClassifier();
  const hub = createEventHub();
  const diagnostics = new Map();
  // 审批 id → { timer, sessionId }：决定到达或会话销毁时取消宽限期内的提醒。
  const pendingApprovals = new Map();
  const cancelApproval = (id) => {
    const entry = pendingApprovals.get(id);
    if (entry === undefined) return;
    clearTimeout(entry.timer);
    pendingApprovals.delete(id);
  };
  const cancelSessionApprovals = (sessionId) => {
    for (const [id, entry] of pendingApprovals) {
      if (entry.sessionId !== sessionId) continue;
      clearTimeout(entry.timer);
      pendingApprovals.delete(id);
    }
  };
  const deliver = (notification, session) => {
    // approvalId 只用于宿主配对，不进入 SSE 帧。
    const { approvalId: _approvalId, ...envelope } = notification;
    const address = notificationAddress(session, ctx);
    hub.publish({
      ...envelope,
      subagent: isSubagentSession(session),
      ...(address === undefined ? {} : { address })
    });
  };
  const offSession = ctx.on("session/event", (session, event) => {
    const sessionId = session?.id;
    if (typeof sessionId !== "string") return;
    try {
      // 先解除配对：never 策略或立即中止会马上补写 approval/decided。
      // 事件名按分类器的同一套归一化比较，兼容 approval:decided 等写法。
      const eventType = typeof event?.type === "string"
        ? event.type.trim().toLowerCase().replace(/[._:]+/g, "/")
        : "";
      if (eventType === "approval/decided") cancelApproval(event?.data?.id);
      const notification = classifier.classify(sessionId, event);
      if (notification !== undefined && notificationEnabled(configOf(config), notification.type, session)) {
        if (graceMs === 0 || notification.approvalId === undefined) {
          deliver(notification, session);
        } else {
          // 只有真正挂起超过宽限期的审批才提醒；同一 id 只保留最新定时器。
          cancelApproval(notification.approvalId);
          const timer = setTimeout(() => {
            pendingApprovals.delete(notification.approvalId);
            deliver(notification, session);
          }, graceMs);
          pendingApprovals.set(notification.approvalId, { timer, sessionId });
        }
      }
      if (notification === undefined && typeof event?.type === "string") {
        const previous = diagnostics.get(event.type) || 0;
        if (Date.now() - previous > 5 * 60 * 1000) {
          diagnostics.set(event.type, Date.now());
          const contract = eventContract(event);
          ctx.logger?.debug?.(`dsh-notifications: observed ${contract.type} [${contract.dataKeys.join(",")}]`);
        }
      }
    } catch (error) {
      ctx.logger?.warn?.(`dsh-notifications: event classification failed for ${String(event?.type || "unknown")}: ${String(error)}`);
    }
  }, { global: true });

  const offDisposed = ctx.on("session/disposed", (session) => {
    if (typeof session?.id === "string") {
      classifier.disposeSession(session.id);
      cancelSessionApprovals(session.id);
    }
  }, { global: true });

  ctx.effect(() => {
    const offConfig = ctx.webServer.register({
      kind: "exact",
      path: CONFIG_PATH,
      handler: async (req, res) => {
        if (!trustedRequest(req, ctx)) return sendJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
        try {
          if (req.method === "GET") return sendJson(res, 200, { ok: true, ...configView(ctx.settings, config, entryId) });
          if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
          if (!configView(ctx.settings, config, entryId).writable) return sendJson(res, 503, { ok: false, error: { code: "settings-unavailable", message: "settings service is unavailable" } });
          const body = await readJson(req);
          if (!isPlainObject(body)) throw new Error("request body must be an object");
          const expectedRevision = typeof body.expectedRevision === "number" ? body.expectedRevision : undefined;
          if (body.reset === true) await ctx.settings.replace(entryId, {}, expectedRevision);
          else await ctx.settings.update(entryId, normalizePatch(body.patch), expectedRevision);
          return sendJson(res, 200, { ok: true, ...configView(ctx.settings, config, entryId) });
        } catch (error) {
          const conflict = error !== null && typeof error === "object" && error.code === "SETTINGS_CONFLICT";
          return sendJson(res, conflict ? 409 : 400, {
            ok: false,
            error: { code: conflict ? "settings-conflict" : "settings-rejected", message: error instanceof Error ? error.message : String(error) }
          });
        }
      }
    });
    const offDebug = ctx.webServer.register({
      kind: "exact",
      path: DEBUG_PATH,
      handler: (req, res) => {
        if (!trustedRequest(req, ctx)) return sendJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
        if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
        return sendJson(res, 200, { ok: true, clients: hub.clientCount(), bufferedEvents: hub.snapshot().length });
      }
    });
    const offEvents = ctx.webServer.register({
      kind: "exact",
      path: EVENTS_PATH,
      handler: (req, res) => {
        if (!trustedRequest(req, ctx)) return sendJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
        if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
        return hub.attach(req, res);
      }
    });
    return () => {
      offEvents();
      offDebug();
      offConfig();
      // 释放宽限期定时器，避免卸载后仍发布提醒。
      for (const entry of pendingApprovals.values()) clearTimeout(entry.timer);
      pendingApprovals.clear();
      hub.close();
      offSession();
      offDisposed();
    };
  }, "dsh-notifications: routes and event subscriptions");
}

export { createEventHub };
