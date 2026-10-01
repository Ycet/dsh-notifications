import assert from "node:assert/strict";
import test from "node:test";
import { eventEnabled, isNormalizedNotificationEvent, shouldSurfaceEvent } from "../lib/client-policy.js";

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
