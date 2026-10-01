import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { apply, CONFIG_PATH, DEBUG_PATH, EVENTS_PATH, isSubagentSession, normalizeConfig, notificationEnabled, trustedRequest } from "../index.js";

test("normalizes incomplete configuration to defaults", () => {
  assert.deepEqual(normalizeConfig({ enabled: false }), {
    enabled: false,
    approvalPendingEnabled: true,
    questionPendingEnabled: true,
    taskSucceededEnabled: true,
    taskFailedEnabled: true,
    subagentTaskEndedEnabled: true
  });
});

test("identifies subagent sessions without treating ordinary forks as subagents", () => {
  assert.equal(isSubagentSession({ header: { origin: "subagent" } }), true);
  assert.equal(isSubagentSession({ header: { delegationDepth: 2 } }), true);
  assert.equal(isSubagentSession({ header: { parentSession: "parent-session" } }), false);
  assert.equal(isSubagentSession({ header: {} }), false);
});

test("subagent task-end switch does not suppress root tasks or interactive events", () => {
  const disabled = { ...normalizeConfig({}), subagentTaskEndedEnabled: false };
  const child = { header: { origin: "subagent", delegationDepth: 1 } };
  const root = { header: {} };
  assert.equal(notificationEnabled(disabled, "task_succeeded", child), false);
  assert.equal(notificationEnabled(disabled, "task_failed", child), false);
  assert.equal(notificationEnabled(disabled, "task_succeeded", root), true);
  assert.equal(notificationEnabled(disabled, "approval_pending", child), true);
  assert.equal(notificationEnabled(normalizeConfig({}), "task_succeeded", child), true);
});

test("trust fence accepts loopback same-origin and rejects cross-site requests", () => {
  const ctx = { get: () => undefined };
  assert.equal(trustedRequest({ headers: { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" } }, ctx), true);
  assert.equal(trustedRequest({ headers: { host: "localhost:3080", "sec-fetch-site": "cross-site" } }, ctx), false);
  assert.equal(trustedRequest({ headers: { host: "example.test:3080" } }, ctx), false);
});

class MockRequest extends EventEmitter {
  constructor(method, body) {
    super();
    this.method = method;
    this.headers = { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" };
    this.body = body;
  }

  async *[Symbol.asyncIterator]() {
    if (this.body !== undefined) yield Buffer.from(JSON.stringify(this.body));
  }
}

class MockResponse {
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  write(chunk) { this.chunks = `${this.chunks ?? ""}${chunk}`; }
  end(body = "") { this.body = body; this.ended = true; }
}

function mockContext({ descriptorMissing = false } = {}) {
  let value = {};
  let revision = 1;
  const routes = new Map();
  const handlers = new Map();
  const cleanups = [];
  const settings = {
    writable: true,
    describe() { return descriptorMissing ? [] : [{ ns: "notifications", revision }]; },
    async update(namespace, patch, expectedRevision) {
      assert.equal(namespace, "notifications");
      if (expectedRevision !== undefined && expectedRevision !== revision) {
        const error = new Error("conflict");
        error.code = "SETTINGS_CONFLICT";
        throw error;
      }
      value = { ...value, ...patch };
      revision += 1;
    },
    async replace(namespace, next) { assert.equal(namespace, "notifications"); value = next; revision += 1; }
  };
  const config = Object.fromEntries(Object.keys(normalizeConfig({})).map((key) => [key, { get: () => normalizeConfig(value)[key] }]));
  const ctx = {
    settings,
    fiber: { entry: { options: { id: "notifications" } } },
    webServer: {
      register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path); }
    },
    get() { return undefined; },
    on(name, handler) {
      const list = handlers.get(name) || [];
      list.push(handler);
      handlers.set(name, list);
      return () => {
        const index = list.indexOf(handler);
        if (index >= 0) list.splice(index, 1);
      };
    },
    effect(fn) {
      const cleanup = fn();
      if (typeof cleanup === "function") cleanups.push(cleanup);
    }
  };
  return { ctx, config, routes, handlers, dispose: () => cleanups.reverse().forEach((cleanup) => cleanup()) };
}

test("host config route reads, validates, updates, and resets settings", async () => {
  const runtime = mockContext();
  apply(runtime.ctx, runtime.config);
  const handler = runtime.routes.get(CONFIG_PATH);

  const read = new MockResponse();
  await handler(new MockRequest("GET"), read);
  assert.equal(read.status, 200);
  assert.equal(JSON.parse(read.body).value.enabled, true);

  const write = new MockResponse();
  await handler(new MockRequest("POST", { patch: { taskFailedEnabled: false }, expectedRevision: 1 }), write);
  assert.equal(write.status, 200);
  assert.equal(JSON.parse(write.body).value.taskFailedEnabled, false);

  const subagentWrite = new MockResponse();
  await handler(new MockRequest("POST", { patch: { subagentTaskEndedEnabled: false }, expectedRevision: 2 }), subagentWrite);
  assert.equal(subagentWrite.status, 200);
  assert.equal(JSON.parse(subagentWrite.body).value.subagentTaskEndedEnabled, false);

  const invalid = new MockResponse();
  await handler(new MockRequest("POST", { patch: { taskFailedEnabled: "no" } }), invalid);
  assert.equal(invalid.status, 400);

  const reset = new MockResponse();
  await handler(new MockRequest("POST", { reset: true, expectedRevision: 3 }), reset);
  assert.equal(reset.status, 200);
  assert.equal(JSON.parse(reset.body).value.taskFailedEnabled, true);
  assert.equal(JSON.parse(reset.body).value.subagentTaskEndedEnabled, true);
  assert.equal("faviconEnabled" in JSON.parse(reset.body).value, false);
  runtime.dispose();
});

test("host config route rejects unavailable forms and stale revisions", async () => {
  const unavailable = mockContext({ descriptorMissing: true });
  apply(unavailable.ctx, unavailable.config);
  const blocked = new MockResponse();
  await unavailable.routes.get(CONFIG_PATH)(new MockRequest("POST", { patch: { enabled: false } }), blocked);
  assert.equal(blocked.status, 503);
  unavailable.dispose();

  const runtime = mockContext();
  apply(runtime.ctx, runtime.config);
  const conflict = new MockResponse();
  await runtime.routes.get(CONFIG_PATH)(new MockRequest("POST", { patch: { enabled: false }, expectedRevision: 0 }), conflict);
  assert.equal(conflict.status, 409);
  assert.equal(JSON.parse(conflict.body).error.code, "settings-conflict");
  runtime.dispose();
});

test("desktop Host SSE emits all four types without body text or icon frames", () => {
  const runtime = mockContext();
  apply(runtime.ctx, runtime.config);
  const stream = new MockResponse();
  const close = runtime.routes.get(EVENTS_PATH)(new MockRequest("GET"), stream);
  const emit = event => runtime.handlers.get("session/event").forEach(fn => fn({ id: "root", header: {} }, event));
  emit({ type: "approval/asked", seq: 0, data: { id: "a", arguments: "private-argument" } });
  emit({ type: "tool/call", seq: 1, data: { name: "ask_user_question", arguments: "private-question" } });
  emit({ type: "turn/end", seq: 2, data: { reason: { kind: "completed" } } });
  emit({ type: "turn/end", seq: 3, data: { reason: { kind: "error" } } });
  emit({ type: "turn/end", seq: 4, data: { reason: { kind: "aborted" } } });
  const frames = [...stream.chunks.matchAll(/^data: (.+)$/gm)].map(match => JSON.parse(match[1]));
  assert.deepEqual(frames.map(x => x.type), ["approval_pending", "question_pending", "task_succeeded", "task_failed"]);
  assert.doesNotMatch(stream.chunks, /private-|arguments|event: state/);
  assert.equal(runtime.routes.has("/dsh-notifications/api/viewed"), false);
  close(); runtime.dispose();
});

test("debug exposes stream health without session state or secrets", async () => {
  const runtime = mockContext(); apply(runtime.ctx, runtime.config);
  const response = new MockResponse();
  await runtime.routes.get(DEBUG_PATH)(new MockRequest("GET"), response);
  assert.deepEqual(JSON.parse(response.body), { ok: true, clients: 0, bufferedEvents: 0 });
  runtime.dispose();
});

test("legacy icon fields are ignored while supported switches survive migration", () => {
  const value = normalizeConfig({ faviconEnabled: true, taskFailedEnabled: false, extra: "private" });
  assert.equal(value.taskFailedEnabled, false);
  assert.equal("faviconEnabled" in value, false);
  assert.equal("extra" in value, false);
});
