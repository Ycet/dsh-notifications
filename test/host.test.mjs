import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { apply, CONFIG_PATH, DEBUG_PATH, EVENTS_PATH, VIEWED_PATH, isSubagentSession, normalizeConfig, notificationEnabled, trustedRequest } from "../index.js";

test("normalizes incomplete configuration to defaults", () => {
  assert.deepEqual(normalizeConfig({ enabled: false }), {
    enabled: false,
    approvalPendingEnabled: true,
    questionPendingEnabled: true,
    taskSucceededEnabled: true,
    taskFailedEnabled: true,
    subagentTaskEndedEnabled: true,
    faviconEnabled: true
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

function mockContext() {
  let value = {};
  let revision = 1;
  const routes = new Map();
  const handlers = new Map();
  const cleanups = [];
  const settings = {
    register() { return { get: () => normalizeConfig(value) }; },
    describe() { return [{ ns: "dsh-notifications", revision }]; },
    async update(_namespace, patch, expectedRevision) {
      if (expectedRevision !== undefined && expectedRevision !== revision) {
        const error = new Error("conflict");
        error.code = "SETTINGS_CONFLICT";
        throw error;
      }
      value = { ...value, ...patch };
      revision += 1;
    },
    async replace(_namespace, next) { value = next; revision += 1; }
  };
  const ctx = {
    settings,
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
  return { ctx, routes, handlers, dispose: () => cleanups.reverse().forEach((cleanup) => cleanup()) };
}

test("host config route reads, validates, updates, and resets settings", async () => {
  const runtime = mockContext();
  apply(runtime.ctx);
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
  assert.equal(JSON.parse(reset.body).value.faviconEnabled, true);
  runtime.dispose();
});

test("favicon state machine broadcasts levels over SSE and the viewed route clears them", async () => {
  const runtime = mockContext();
  apply(runtime.ctx);
  const emit = (session, event) => (runtime.handlers.get("session/event") || []).forEach((handler) => handler(session, event));

  const stream = new MockResponse();
  const closeStream = runtime.routes.get(EVENTS_PATH)(new MockRequest("GET"), stream);
  assert.doesNotMatch(stream.chunks ?? "", /event: state/);

  // 非子代理会话失败 → 红色
  emit({ id: "s1", header: {} }, { type: "turn/start", seq: 1, data: {} });
  emit({ id: "s1", header: {} }, { type: "turn/end", seq: 2, data: { reason: { kind: "error" } } });
  assert.match(stream.chunks, /event: state[\s\S]*"level":"red"/);

  // 子代理会话的失败不参与聚合
  const subagent = { id: "sub1", header: { origin: "subagent", delegationDepth: 1 } };
  emit(subagent, { type: "turn/start", seq: 1, data: {} });
  emit(subagent, { type: "turn/end", seq: 2, data: { reason: { kind: "error" } } });
  assert.equal((stream.chunks.match(/event: state/g) || []).length, 1);

  // 点开对应会话 → 恢复默认
  const viewed = new MockResponse();
  await runtime.routes.get(VIEWED_PATH)(new MockRequest("POST", { sessionId: "s1" }), viewed);
  assert.equal(viewed.status, 200);
  assert.equal(JSON.parse(viewed.body).ok, true);
  assert.equal(JSON.parse(viewed.body).level, null);
  assert.match(stream.chunks, /"level":null/);

  // 缺少 sessionId → 400；GET → 405
  const bad = new MockResponse();
  await runtime.routes.get(VIEWED_PATH)(new MockRequest("POST", {}), bad);
  assert.equal(bad.status, 400);
  assert.equal(JSON.parse(bad.body).ok, false);
  const wrongMethod = new MockResponse();
  await runtime.routes.get(VIEWED_PATH)(new MockRequest("GET"), wrongMethod);
  assert.equal(wrongMethod.status, 405);

  // faviconEnabled 配置可写
  const write = new MockResponse();
  await runtime.routes.get(CONFIG_PATH)(new MockRequest("POST", { patch: { faviconEnabled: false }, expectedRevision: 1 }), write);
  assert.equal(write.status, 200);
  assert.equal(JSON.parse(write.body).value.faviconEnabled, false);

  closeStream();
  runtime.dispose();
});

test("debug endpoint exposes the tracker snapshot", async () => {
  const runtime = mockContext();
  apply(runtime.ctx);
  const read = new MockResponse();
  await runtime.routes.get(DEBUG_PATH)(new MockRequest("GET"), read);
  assert.equal(read.status, 200);
  const body = JSON.parse(read.body);
  assert.equal(body.ok, true);
  assert.equal(body.level, null);
  assert.ok(Array.isArray(body.sessions));

  // 触发一个 pending 事件后，快照应反映状态
  const emit = (session, event) => (runtime.handlers.get("session/event") || []).forEach((handler) => handler(session, event));
  emit({ id: "s9", header: {} }, { type: "approval/asked", seq: 1, data: { id: "approval-9" } });
  const after = new MockResponse();
  await runtime.routes.get(DEBUG_PATH)(new MockRequest("GET"), after);
  const snapshot = JSON.parse(after.body);
  assert.equal(snapshot.level, "yellow");
  assert.deepEqual(snapshot.sessions.find((item) => item.sessionId === "s9").pending, ["a:approval-9"]);

  const wrongMethod = new MockResponse();
  await runtime.routes.get(DEBUG_PATH)(new MockRequest("POST", {}), wrongMethod);
  assert.equal(wrongMethod.status, 405);
  runtime.dispose();
});
