import z from "@deepseek-ai/schemastery";
import { createEventClassifier, eventContract } from "./lib/classifier.js";
import { createEventHub } from "./lib/event-hub.js";

export const name = "dsh-notifications";
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

export function trustedRequest(req, ctx) {
  const host = req.headers.host;
  if (typeof host !== "string" || host === "") return false;
  let hostname;
  try { hostname = new URL(`http://${host}`).hostname; }
  catch { return false; }
  if (!isLoopbackHostname(hostname)) {
    const trustedHosts = ctx.get("webRuntime")?.trustedHosts;
    if (!Array.isArray(trustedHosts) || !trustedHosts.some((candidate) => candidate === host || candidate.split(":")[0] === hostname)) return false;
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
  try {
    // 使用官方投影读取身份，不扫描私有日志或调用已弃用的同步历史接口。
    const mode = ctx?.get?.("sessionProjections")?.stateOf(session, "subagent")?.identity?.mode;
    if (mode === "one-shot" || mode === "continuable") {
      return { parentSessionId: session.header.parentSession, childSessionId: session.id, mode };
    }
  } catch { /* 旧版未公开子代理投影时，客户端使用已发现的地址兜底。 */ }
  return undefined;
}

export function notificationEnabled(config, type, session) {
  const flag = FLAG_BY_TYPE[type];
  if (config.enabled !== true || flag === undefined || config[flag] !== true) return false;
  const taskEnded = type === "task_succeeded" || type === "task_failed";
  return !taskEnded || !isSubagentSession(session) || config.subagentTaskEndedEnabled === true;
}

export function apply(ctx, config = Config({})) {
  // 设置 API 以 Loader entry id 定址，不能用旧 settings.yaml 的段名。
  const entryId = ctx.fiber?.entry?.options?.id ?? "notifications";

  const classifier = createEventClassifier();
  const hub = createEventHub();
  const diagnostics = new Map();
  const offSession = ctx.on("session/event", (session, event) => {
    const sessionId = session?.id;
    if (typeof sessionId !== "string") return;
    try {
      const notification = classifier.classify(sessionId, event);
      if (notification !== undefined && notificationEnabled(configOf(config), notification.type, session)) {
        const address = notificationAddress(session, ctx);
        hub.publish({ ...notification, subagent: isSubagentSession(session),
          ...(address === undefined ? {} : { address }) });
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
      hub.close();
      offSession();
      offDisposed();
    };
  }, "dsh-notifications: routes and event subscriptions");
}

export { createEventHub };
