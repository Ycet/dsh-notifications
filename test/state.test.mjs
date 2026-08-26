import test from "node:test";
import assert from "node:assert/strict";
import { createStateTracker } from "../lib/state.js";

function approvalAsked(id = "approval-1", seq = 1) {
  return { type: "approval/asked", seq, data: { id } };
}

function approvalDecided(id = "approval-1", seq = 2) {
  return { type: "approval/decided", seq, data: { id, outcome: "allowed-once" } };
}

function questionAsked(callId = "call-1", seq = 1) {
  return { type: "tool/call", seq, data: { name: "ask_user_question", callId } };
}

function questionAnswered(callId = "call-1", seq = 2) {
  return { type: "tool/result", seq, data: { callId } };
}

function turnStart(seq = 1) {
  return { type: "turn/start", seq, data: {} };
}

function turnEnd(kind, seq = 2) {
  return { type: "turn/end", seq, data: { reason: { kind } } };
}

test("approval pending turns yellow and clears on decision", () => {
  const tracker = createStateTracker();
  assert.equal(tracker.apply("s1", approvalAsked()), undefined);
  assert.equal(tracker.aggregate(), "yellow");
  tracker.apply("s1", approvalDecided());
  assert.equal(tracker.aggregate(), null);
});

test("question pending turns yellow and clears when answered", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", questionAsked());
  assert.equal(tracker.aggregate(), "yellow");
  tracker.apply("s1", questionAnswered());
  assert.equal(tracker.aggregate(), null);
});

test("failed turn turns red until the next turn starts", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", turnStart());
  tracker.apply("s1", turnEnd("error"));
  assert.equal(tracker.aggregate(), "red");
  tracker.apply("s1", turnStart(3));
  assert.equal(tracker.aggregate(), null);
});

test("successful turn turns green until the next turn starts", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", turnStart());
  assert.equal(tracker.aggregate(), null);
  tracker.apply("s1", turnEnd("completed"));
  assert.equal(tracker.aggregate(), "green");
  tracker.apply("s1", turnStart(3));
  assert.equal(tracker.aggregate(), null);
});

test("aborted turn is neutral, not red", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", turnStart());
  tracker.apply("s1", turnEnd("aborted"));
  assert.equal(tracker.aggregate(), null);
  tracker.apply("s1", turnEnd("cancelled", 3));
  assert.equal(tracker.aggregate(), null);
});

test("priority across sessions: yellow beats red beats green, viewed clears one contribution", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", turnStart(1));
  tracker.apply("s1", turnEnd("completed", 2));
  tracker.apply("s2", turnStart(1));
  tracker.apply("s2", turnEnd("error", 2));
  tracker.apply("s3", approvalAsked());
  // 完成 + 失败 + 待审批 → 黄色
  assert.equal(tracker.aggregate(), "yellow");
  // 先点开已完成或失败的会话 → 仍是黄色（待审批未点开）
  tracker.markViewed("s1");
  assert.equal(tracker.aggregate(), "yellow");
  tracker.markViewed("s2");
  assert.equal(tracker.aggregate(), "yellow");
  // 点开待审批 → 三个会话都已查看 → 默认色
  tracker.markViewed("s3");
  assert.equal(tracker.aggregate(), null);
});

test("priority across sessions: opening the pending session first drops yellow to red", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", turnStart(1));
  tracker.apply("s1", turnEnd("completed", 2));
  tracker.apply("s2", turnStart(1));
  tracker.apply("s2", turnEnd("error", 2));
  tracker.apply("s3", approvalAsked());
  assert.equal(tracker.aggregate(), "yellow");
  tracker.markViewed("s3");
  assert.equal(tracker.aggregate(), "red");
  tracker.markViewed("s2");
  assert.equal(tracker.aggregate(), "green");
  tracker.markViewed("s1");
  assert.equal(tracker.aggregate(), null);
});

test("all sessions of the same color must be viewed before the color clears", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", turnStart(1));
  tracker.apply("s1", turnEnd("completed", 2));
  tracker.apply("s2", turnStart(1));
  tracker.apply("s2", turnEnd("completed", 2));
  assert.equal(tracker.aggregate(), "green");
  // 点开其中一个已完成会话 → 仍为绿色
  tracker.markViewed("s1");
  assert.equal(tracker.aggregate(), "green");
  assert.equal(tracker.snapshot().find((item) => item.sessionId === "s1").viewed, true);
  // 两个都点开 → 默认色
  tracker.markViewed("s2");
  assert.equal(tracker.aggregate(), null);
});

test("viewed state clears after the next turn restarts the session", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", turnStart(1));
  tracker.apply("s1", turnEnd("error", 2));
  assert.equal(tracker.aggregate(), "red");
  tracker.markViewed("s1");
  assert.equal(tracker.aggregate(), null);
  // 下一轮开始后，新失败重新计入红色
  tracker.apply("s1", turnStart(3));
  assert.equal(tracker.aggregate(), null);
  tracker.apply("s1", turnEnd("error", 4));
  assert.equal(tracker.aggregate(), "red");
});

test("markViewed is idempotent and applies to sessions created later", () => {
  const tracker = createStateTracker();
  assert.equal(tracker.markViewed("s1"), true);
  assert.equal(tracker.markViewed("s1"), false);
  tracker.apply("s1", approvalAsked());
  assert.equal(tracker.aggregate(), null);
  // turn/start 重置 viewed 后该会话重新计入
  tracker.apply("s1", turnStart(2));
  tracker.apply("s1", approvalAsked("3", 3));
  assert.equal(tracker.aggregate(), "yellow");
});

test("dispose removes session state", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", turnStart(1));
  tracker.apply("s1", turnEnd("error", 2));
  assert.equal(tracker.aggregate(), "red");
  tracker.disposeSession("s1");
  assert.equal(tracker.aggregate(), null);
});

test("duplicate events are idempotent", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", approvalAsked());
  tracker.apply("s1", approvalAsked());
  assert.equal(tracker.aggregate(), "yellow");
  assert.equal(tracker.snapshot().find((item) => item.sessionId === "s1").pending.length, 1);
  tracker.apply("s1", approvalDecided());
  tracker.apply("s1", approvalDecided());
  assert.equal(tracker.aggregate(), null);
  assert.equal(tracker.snapshot().find((item) => item.sessionId === "s1").pending.length, 0);
});

test("out-of-order decided before asked is a safe no-op", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", approvalDecided("a", 2));
  tracker.apply("s1", approvalAsked("a", 1));
  assert.equal(tracker.aggregate(), null);
  const entry = tracker.snapshot().find((item) => item.sessionId === "s1");
  assert.deepEqual(entry.pending, []);
  assert.equal(entry.failed, false);
  assert.equal(entry.completed, false);
});

test("events without seq still transition", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", turnStart());
  tracker.apply("s1", turnEnd("completed"));
  assert.equal(tracker.aggregate(), "green");
});

test("question tool name variants are recognized", () => {
  const tracker = createStateTracker();
  tracker.apply("s1", { type: "tool/call", seq: 1, data: { name: "ask-user", callId: "c1" } });
  assert.equal(tracker.aggregate(), "yellow");
  tracker.apply("s1", { type: "tool/call", seq: 2, data: { name: "request_user_input", callId: "c1" } });
  assert.equal(tracker.aggregate(), "yellow");
  tracker.apply("s1", questionAnswered("c1", 3));
  assert.equal(tracker.aggregate(), null);
});