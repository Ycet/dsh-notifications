import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createEventHub } from "../lib/event-hub.js";

class FakeResponse {
  constructor() { this.headers = undefined; this.status = undefined; this.output = ""; this.ended = false; }
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  write(value) { this.output += value; }
  end() { this.ended = true; }
}

function request(lastEventId) {
  const req = new EventEmitter();
  req.headers = lastEventId ? { "last-event-id": lastEventId } : {};
  return req;
}

function event(id) {
  return { eventId: id, type: "task_succeeded", sessionId: "s1", occurredAt: 1 };
}

test("initial clients receive only live events", () => {
  const hub = createEventHub();
  hub.publish(event("one"));
  const req = request();
  const res = new FakeResponse();
  const close = hub.attach(req, res);
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.output, /data:/);
  hub.publish(event("two"));
  assert.match(res.output, /id: two/);
  assert.doesNotMatch(res.output, /secret|arguments|content/);
  close();
  hub.close();
});

test("reconnecting clients replay events after Last-Event-ID", () => {
  const hub = createEventHub();
  hub.publish(event("one"));
  hub.publish(event("two"));
  hub.publish(event("three"));
  const req = request("one");
  const res = new FakeResponse();
  const close = hub.attach(req, res);
  assert.doesNotMatch(res.output, /id: one/);
  assert.match(res.output, /id: two/);
  assert.match(res.output, /id: three/);
  close();
  hub.close();
});

test("buffer enforces count and age limits", () => {
  let current = 0;
  const hub = createEventHub({ limit: 2, maxAgeMs: 10, now: () => current });
  hub.publish(event("one"));
  current = 5;
  hub.publish(event("two"));
  current = 9;
  hub.publish(event("three"));
  assert.deepEqual(hub.snapshot().map((item) => item.eventId), ["two", "three"]);
  current = 20;
  assert.deepEqual(hub.snapshot(), []);
  hub.close();
});

test("state broadcasts to connected clients and to newly attached clients", () => {
  const hub = createEventHub();
  const first = new FakeResponse();
  const firstClose = hub.attach(request(), first);
  assert.doesNotMatch(first.output, /event: state/);
  hub.publishState("yellow");
  assert.match(first.output, /event: state/);
  assert.match(first.output, /data: \{"level":"yellow"\}/);
  // 新客户端 attach 时立即收到当前 level
  const second = new FakeResponse();
  const secondClose = hub.attach(request(), second);
  assert.match(second.output, /event: state/);
  assert.match(second.output, /data: \{"level":"yellow"\}/);
  hub.publishState(null);
  assert.match(first.output, /data: \{"level":null\}/);
  // 之后 attach 的客户端不再收到 state 帧
  const third = new FakeResponse();
  const thirdClose = hub.attach(request(), third);
  assert.doesNotMatch(third.output, /event: state/);
  firstClose();
  secondClose();
  thirdClose();
  hub.close();
});

test("state frames are not stored in the replay buffer and do not disturb replay", () => {
  const hub = createEventHub();
  hub.publish(event("one"));
  hub.publishState("red");
  hub.publish(event("two"));
  const req = request("one");
  const res = new FakeResponse();
  const close = hub.attach(req, res);
  assert.match(res.output, /id: two/);
  // attach 推送一次当前 state，重放部分不再出现 state 帧
  assert.equal((res.output.match(/event: state/g) || []).length, 1);
  assert.match(res.output, /data: \{"level":"red"\}/);
  assert.deepEqual(hub.snapshot().map((item) => item.eventId), ["one", "two"]);
  close();
  hub.close();
});
