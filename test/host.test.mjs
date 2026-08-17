import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { apply, CONFIG_PATH, normalizeConfig, trustedRequest } from "../index.js";

test("normalizes incomplete configuration to defaults", () => {
  assert.deepEqual(normalizeConfig({ enabled: false }), {
    enabled: false,
    approvalPendingEnabled: true,
    questionPendingEnabled: true,
    taskSucceededEnabled: true,
    taskFailedEnabled: true
  });
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
    on() { return () => {}; },
    effect(fn) {
      const cleanup = fn();
      if (typeof cleanup === "function") cleanups.push(cleanup);
    }
  };
  return { ctx, routes, dispose: () => cleanups.reverse().forEach((cleanup) => cleanup()) };
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

  const invalid = new MockResponse();
  await handler(new MockRequest("POST", { patch: { taskFailedEnabled: "no" } }), invalid);
  assert.equal(invalid.status, 400);

  const reset = new MockResponse();
  await handler(new MockRequest("POST", { reset: true, expectedRevision: 2 }), reset);
  assert.equal(reset.status, 200);
  assert.equal(JSON.parse(reset.body).value.taskFailedEnabled, true);
  runtime.dispose();
});
