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
