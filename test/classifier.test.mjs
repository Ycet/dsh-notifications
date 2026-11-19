import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEventClassifier, eventContract } from "../lib/classifier.js";

test("classifies approval, structured question, success, and failure", () => {
  const classifier = createEventClassifier({ now: () => 1000 });
  assert.equal(classifier.classify("s1", { type: "approval/request", seq: 1, time: 10, data: {} }).type, "approval_pending");
  assert.equal(classifier.classify("s1", { type: "tool/call", seq: 2, data: { name: "request_user_input" } }).type, "question_pending");
  assert.equal(classifier.classify("s1", { type: "turn/end", seq: 3, data: {} }).type, "task_succeeded");
  assert.equal(classifier.classify("s1", { type: "turn/end", seq: 4, data: { status: "failed" } }).type, "task_failed");
  assert.equal(classifier.classify("s1", { type: "agent/error", seq: 5, data: {} }).type, "task_failed");
});

test("ignores ordinary questions, cancellations, duplicates, and older events", () => {
  const classifier = createEventClassifier();
  assert.equal(classifier.classify("s1", { type: "assistant/message", seq: 1, data: { message: { content: [{ type: "text", text: "Continue?" }] } } }), undefined);
  assert.equal(classifier.classify("s1", { type: "turn/end", seq: 2, data: { reason: "cancelled" } }), undefined);
  const event = { type: "question/request", seq: 4, data: {} };
  assert.equal(classifier.classify("s1", event).type, "question_pending");
  assert.equal(classifier.classify("s1", event), undefined);
  assert.equal(classifier.classify("s1", { type: "approval/request", seq: 3, data: {} }), undefined);
});

test("requires an explicit pending state for generic approval and question types", () => {
  const classifier = createEventClassifier();
  assert.equal(classifier.classify("s1", { type: "approval/changed", seq: 1, data: { status: "approved" } }), undefined);
  assert.equal(classifier.classify("s1", { type: "approval/changed", seq: 2, data: { status: "pending" } }).type, "approval_pending");
  assert.equal(classifier.classify("s1", { type: "question/changed", seq: 3, data: { state: "answered" } }), undefined);
  assert.equal(classifier.classify("s1", { type: "question/changed", seq: 4, data: { state: "waiting" } }).type, "question_pending");
});

test("carries the approval id only for approval notifications", () => {
  const classifier = createEventClassifier();
  // 宿主用它把 approval/asked 与 approval/decided 配对，其他类型不得携带。
  const approval = classifier.classify("s1", { type: "approval/asked", seq: 1, data: { id: "a-1", toolName: "bash" } });
  assert.equal(approval.type, "approval_pending");
  assert.equal(approval.approvalId, "a-1");
  assert.equal("approvalId" in classifier.classify("s1", { type: "turn/end", seq: 2, data: {} }), false);
  // 不可用或异常的 id 不参与配对。
  assert.equal("approvalId" in classifier.classify("s1", { type: "approval/asked", seq: 3, data: { id: 7 } }), false);
  assert.equal("approvalId" in classifier.classify("s1", { type: "approval/asked", seq: 4, data: { id: "x".repeat(129) } }), false);
});

test("event contract contains keys but never values", () => {
  assert.deepEqual(eventContract({ type: "tool/call", data: { arguments: "secret", name: "request_user_input" } }), {
    type: "tool/call",
    dataKeys: ["arguments", "name"]
  });
});

test("classifies the redacted DSH 0.1.0-rc.6 contract fixtures", async () => {
  const fixtures = JSON.parse(await readFile(new URL("./fixtures/dsh-0.1.0-rc.6-events.json", import.meta.url), "utf8"));
  const classifier = createEventClassifier();
  const actual = fixtures.map((event) => classifier.classify("fixture-session", event)?.type);
  assert.deepEqual(actual, ["approval_pending", "question_pending", "task_succeeded", "task_failed", undefined]);
});
