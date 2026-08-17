import z from "schemastery";
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
  taskFailedEnabled: true
});

export const SettingsSchema = z.object({
  enabled: z.boolean().default(DEFAULTS.enabled),
  approvalPendingEnabled: z.boolean().default(DEFAULTS.approvalPendingEnabled),
  questionPendingEnabled: z.boolean().default(DEFAULTS.questionPendingEnabled),
  taskSucceededEnabled: z.boolean().default(DEFAULTS.taskSucceededEnabled),
  taskFailedEnabled: z.boolean().default(DEFAULTS.taskFailedEnabled)
});

export const CONFIG_PATH = "/dsh-notifications/api/config";
export const EVENTS_PATH = "/dsh-notifications/api/events";
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

function configOf(scope) {
  try { return scope === undefined ? DEFAULTS : { ...DEFAULTS, ...scope.get() }; }
  catch { return DEFAULTS; }
}

export function normalizeConfig(value) {
  return { ...DEFAULTS, ...(isPlainObject(value) ? value : {}) };
}

function configView(settings, scope) {
  const descriptor = settings.describe({ redactSecrets: true }).find((candidate) => String(candidate.ns) === SETTINGS_NAMESPACE);
  return {
    value: configOf(scope),
    revision: descriptor?.revision,
    writable: scope !== undefined
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

function enabledFor(config, type) {
  const flag = FLAG_BY_TYPE[type];
  return config.enabled === true && flag !== undefined && config[flag] === true;
}

export function apply(ctx) {
  let scope;
  try { scope = ctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema); }
  catch (error) { ctx.logger?.warn?.(`dsh-notifications: settings registration failed: ${String(error)}`); }

  const classifier = createEventClassifier();
  const hub = createEventHub();
  const diagnostics = new Map();

  const offSession = ctx.on("session/event", (session, event) => {
    const sessionId = session?.id;
    if (typeof sessionId !== "string") return;
    try {
      const notification = classifier.classify(sessionId, event);
      if (notification !== undefined && enabledFor(configOf(scope), notification.type)) hub.publish(notification);
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
  });

  const offDisposed = ctx.on("session/disposed", (session) => {
    if (typeof session?.id === "string") classifier.disposeSession(session.id);
  });

  ctx.effect(() => {
    const offConfig = ctx.webServer.register({
      kind: "exact",
      path: CONFIG_PATH,
      handler: async (req, res) => {
        if (!trustedRequest(req, ctx)) return sendJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
        try {
          if (req.method === "GET") return sendJson(res, 200, { ok: true, ...configView(ctx.settings, scope) });
          if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
          if (scope === undefined) return sendJson(res, 503, { ok: false, error: { code: "settings-unavailable", message: "settings service is unavailable" } });
          const body = await readJson(req);
          if (!isPlainObject(body)) throw new Error("request body must be an object");
          const expectedRevision = typeof body.expectedRevision === "number" ? body.expectedRevision : undefined;
          if (body.reset === true) await ctx.settings.replace(SETTINGS_NAMESPACE, {}, expectedRevision);
          else await ctx.settings.update(SETTINGS_NAMESPACE, normalizePatch(body.patch), expectedRevision);
          return sendJson(res, 200, { ok: true, ...configView(ctx.settings, scope) });
        } catch (error) {
          const conflict = error !== null && typeof error === "object" && error.code === "SETTINGS_CONFLICT";
          return sendJson(res, conflict ? 409 : 400, {
            ok: false,
            error: { code: conflict ? "settings-conflict" : "settings-rejected", message: error instanceof Error ? error.message : String(error) }
          });
        }
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
      offConfig();
      hub.close();
      offSession();
      offDisposed();
    };
  }, "dsh-notifications: routes and event subscriptions");
}

export { createEventHub };
