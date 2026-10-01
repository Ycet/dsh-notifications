import assert from "node:assert/strict";
import test from "node:test";
import { createLeaderElector, createNotificationController, currentSessionId, openNotificationSession } from "../src/client.js";
import { notificationAddress } from "../index.js";

function environment(t, { permission = "granted", focused = false, hidden = false, throws = false } = {}) {
  const notifications = [];
  let focusCount = 0;
  let stream;
  class Notification {
    static permission = permission;
    constructor(title, options) {
      if (throws) throw new Error("OS notification unavailable");
      Object.assign(this, { title, options, closed: false });
      notifications.push(this);
    }
    close() { this.closed = true; }
  }
  class EventSource {
    listeners = new Map();
    constructor(url) { this.url = url; stream = this; }
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    send(event) { this.listeners.get("notification")({ data: JSON.stringify(event) }); }
    close() { this.closed = true; }
  }
  const replacements = {
    window: { Notification, focus() { focusCount += 1; } },
    document: { visibilityState: hidden ? "hidden" : "visible", hasFocus: () => focused },
    EventSource
  };
  for (const [key, value] of Object.entries(replacements)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
  return { notifications, get stream() { return stream; }, get focusCount() { return focusCount; } };
}

const config = { enabled: true, approvalPendingEnabled: true, questionPendingEnabled: true,
  taskSucceededEnabled: true, taskFailedEnabled: true, subagentTaskEndedEnabled: true };
const event = (id, type = "task_succeeded", extra = {}) => ({ eventId: id, sessionId: "s", type, occurredAt: 1, ...extra });
function context(binding = { key: "s" }) {
  const opened = [];
  const snapshot = { current: "stale", byId: { s: { id: "s", title: "会话标题" } } };
  return { opened, sessions: { list: { getSnapshot: () => snapshot } },
    uiSession: { adapter: { current: { getSnapshot: () => binding } } },
    uiWorkspace: { openSession(target) { opened.push(target); } } };
}
function start(ctx, value = config, leader = true) {
  let disposed = false;
  const controller = createNotificationController(ctx, { getSnapshot: () => ({ value }) }, key => key,
    { leader: { isLeader: () => leader, dispose() { disposed = true; } } });
  return { controller, stop: controller.start(), get disposed() { return disposed; } };
}

test("desktop main binding overrides stale current and respects a blank view", () => {
  assert.equal(currentSessionId(context()), "s");
  assert.equal(currentSessionId(context({ key: undefined })), undefined);
  assert.equal(currentSessionId({ sessions: { list: { getSnapshot: () => ({ byId: {
    retained: { id: "retained", retainedBy: { mainView: 1 } }
  } }) } } }), "retained");
});

for (const type of ["approval_pending", "question_pending", "task_succeeded", "task_failed"]) {
  test(`desktop ${type}: one background alert, click opens the session`, async t => {
    const env = environment(t);
    const ctx = context(); const run = start(ctx); t.after(run.stop);
    env.stream.send(event("one", type)); env.stream.send(event("one", type));
    assert.equal(env.notifications.length, 1);
    assert.equal(env.notifications[0].options.body, "conversation：会话标题");
    env.notifications[0].onclick();
    await Promise.resolve();
    assert.deepEqual(ctx.opened, ["s"]);
    assert.equal(env.focusCount, 1);
    assert.equal(env.notifications[0].closed, true);
  });
}

test("foreground suppression uses the desktop binding; another session still alerts", t => {
  const env = environment(t, { focused: true }); const ctx = context();
  const run = start(ctx); t.after(run.stop);
  env.stream.send(event("current"));
  env.stream.send(event("other", "task_succeeded", { sessionId: "other" }));
  assert.equal(env.notifications.length, 1);
  assert.equal(env.notifications[0].options.tag, "other");
});

for (const [label, value, permission, leader] of [
  ["master off", { ...config, enabled: false }, "granted", true],
  ["category off", { ...config, taskSucceededEnabled: false }, "granted", true],
  ["no permission", config, "denied", true],
  ["follower window", config, "granted", false]
]) {
  test(`${label} suppresses delivery`, t => {
    const env = environment(t, { permission }); const run = start(context(), value, leader); t.after(run.stop);
    env.stream.send(event("one")); assert.equal(env.notifications.length, 0);
  });
}

test("subagent switch suppresses replayed task results but allows interactive alerts", t => {
  const env = environment(t); const run = start(context(), { ...config, subagentTaskEndedEnabled: false }); t.after(run.stop);
  env.stream.send(event("end", "task_succeeded", { subagent: true }));
  env.stream.send(event("approval", "approval_pending", { subagent: true }));
  assert.equal(env.notifications.length, 1);
  assert.equal(env.notifications[0].options.tag, "approval");
});

test("newly discovered child opens by address even if it is absent from the list", async t => {
  environment(t); const ctx = context();
  const address = { parentSessionId: "parent", childSessionId: "child", mode: "continuable" };
  assert.equal(await openNotificationSession(ctx, event("child-end", "task_succeeded", {
    sessionId: "child", subagent: true, address
  })), true);
  assert.deepEqual(ctx.opened, [address]);
});

test("legacy Web opens discovered child and root; deleted targets only focus", async t => {
  const env = environment(t); const ctx = context(); delete ctx.uiWorkspace;
  ctx.sessions.open = id => ctx.opened.push(id);
  ctx.sessions.openSubagent = address => ctx.opened.push(address);
  const address = { parentSessionId: "parent", childSessionId: "child", mode: "one-shot" };
  ctx.sessions.subagentAddress = id => id === "child" ? address : undefined;
  assert.equal(await openNotificationSession(ctx, event("root")), true);
  assert.equal(await openNotificationSession(ctx, event("child", "task_succeeded", { sessionId: "child" })), true);
  assert.equal(await openNotificationSession(ctx, event("deleted", "task_succeeded", { sessionId: "deleted" })), false);
  assert.deepEqual(ctx.opened, ["s", address]); assert.equal(env.focusCount, 3);
});

test("Host child address exposes only ids and descriptor mode", () => {
  const address = notificationAddress({ id: "child", header: { origin: "subagent", parentSession: "parent" } },
    { get: () => ({ stateOf: () => ({ identity: { mode: "one-shot", label: "private", seq: 1 } }) }) });
  assert.deepEqual(address, { parentSessionId: "parent", childSessionId: "child", mode: "one-shot" });
});

test("notification failure and plugin disposal do not throw or keep sending", t => {
  const env = environment(t, { throws: true }); const run = start(context());
  assert.doesNotThrow(() => env.stream.send(event("one")));
  assert.equal(run.controller.test(), false);
  run.stop(); assert.equal(env.stream.closed, true); assert.equal(run.disposed, true);
  assert.equal(run.controller.test(), false);
});

test("test notification works without generating session navigation", t => {
  const env = environment(t); const ctx = context(); const run = start(ctx); t.after(run.stop);
  assert.equal(run.controller.test(), true); env.notifications[0].onclick();
  assert.equal(env.focusCount, 1); assert.deepEqual(ctx.opened, []);
});

test("stream status reports open, interruption, reconnection and disposal", t => {
  const env = environment(t); const run = start(context());
  const states = [];
  run.controller.subscribe(() => states.push(run.controller.getSnapshot()));
  assert.equal(run.controller.getSnapshot(), "Connecting");
  env.stream.listeners.get("open")();
  env.stream.listeners.get("error")();
  env.stream.listeners.get("open")();
  run.stop();
  env.stream.listeners.get("open")();
  assert.deepEqual(states, ["Connected", "Reconnecting", "Connected", "Closed"]);
});

test("shared fallback lease allows one window and transfers on disposal", t => {
  const descriptors = new Map(); const values = new Map();
  for (const [key, value] of Object.entries({ BroadcastChannel: undefined,
    localStorage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) } })) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => { for (const [key, descriptor] of descriptors) descriptor
    ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; });
  const a = createLeaderElector({ id: "a", now: () => 1 }), b = createLeaderElector({ id: "b", now: () => 1 });
  t.after(() => { a.dispose(); b.dispose(); });
  assert.equal(a.isLeader(), true); assert.equal(b.isLeader(), false);
  a.dispose(); assert.equal(b.isLeader(), true);
});
