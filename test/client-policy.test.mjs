import assert from "node:assert/strict";
import test from "node:test";
import { detectPendingPlanReview, eventEnabled, isNormalizedNotificationEvent, shouldSurfaceEvent } from "../lib/client-policy.js";

const config = {
  enabled: true,
  approvalPendingEnabled: true,
  questionPendingEnabled: true,
  taskSucceededEnabled: true,
  taskFailedEnabled: true
};
const event = {
  eventId: "session-a:1:approval_pending",
  type: "approval_pending",
  sessionId: "session-a",
  occurredAt: 1000
};

test("validates the normalized privacy-preserving event envelope", () => {
  assert.equal(isNormalizedNotificationEvent(event), true);
  assert.equal(isNormalizedNotificationEvent({ ...event, type: "assistant/message" }), false);
  assert.equal(isNormalizedNotificationEvent({ ...event, sessionId: "" }), false);
});

test("honors master and category switches", () => {
  assert.equal(eventEnabled(config, "approval_pending"), true);
  assert.equal(eventEnabled({ ...config, enabled: false }, "approval_pending"), false);
  assert.equal(eventEnabled({ ...config, approvalPendingEnabled: false }, "approval_pending"), false);
});

test("suppresses only the visible current session", () => {
  assert.equal(shouldSurfaceEvent({ config, event, permission: "granted", visibilityState: "visible", currentSessionId: "session-a" }), false);
  assert.equal(shouldSurfaceEvent({ config, event, permission: "granted", visibilityState: "visible", currentSessionId: "session-b" }), true);
  assert.equal(shouldSurfaceEvent({ config, event, permission: "granted", visibilityState: "hidden", currentSessionId: "session-a" }), true);
  assert.equal(shouldSurfaceEvent({ config, event, permission: "granted", visibilityState: "visible", documentHasFocus: false, currentSessionId: "session-a" }), true);
});

test("requires granted permission", () => {
  assert.equal(shouldSurfaceEvent({ config, event, permission: "default", visibilityState: "hidden" }), false);
  assert.equal(shouldSurfaceEvent({ config, event, permission: "denied", visibilityState: "hidden" }), false);
});

test("detects plan-review pending from the rc.1 pending-interaction snapshot", () => {
  const rows = {
    s1: { origin: undefined },
    s2: { origin: undefined },
    sub: { origin: "subagent" }
  };
  const pending = new Map([
    ["s1", { kind: "plan-review" }],
    ["s2", { kind: "question" }],
    ["sub", { kind: "plan-review" }]
  ]);
  // 非子代理的 plan-review 会话计入；排除子代理与当前会话
  assert.equal(detectPendingPlanReview(pending, rows, "s3"), true);
  assert.equal(detectPendingPlanReview(pending, rows, "s1"), false);
  assert.equal(detectPendingPlanReview(pending, rows, "sub"), true);
  // 仅提问不算
  assert.equal(detectPendingPlanReview(new Map([["s2", pending.get("s2")]]), { s2: rows.s2 }, "s3"), false);
  assert.equal(detectPendingPlanReview(null, rows, "s1"), false);
});
