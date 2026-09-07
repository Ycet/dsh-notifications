import { NOTIFICATION_EVENT_TYPES } from "./classifier.js";

const TYPE_TO_SETTING = Object.freeze({
  approval_pending: "approvalPendingEnabled",
  question_pending: "questionPendingEnabled",
  task_succeeded: "taskSucceededEnabled",
  task_failed: "taskFailedEnabled"
});

export function isNormalizedNotificationEvent(value) {
  return value !== null
    && typeof value === "object"
    && typeof value.eventId === "string"
    && value.eventId !== ""
    && NOTIFICATION_EVENT_TYPES.includes(value.type)
    && typeof value.sessionId === "string"
    && value.sessionId !== ""
    && Number.isFinite(value.occurredAt);
}

export function eventEnabled(config, eventType) {
  if (!config || config.enabled !== true) return false;
  const key = TYPE_TO_SETTING[eventType];
  return key !== undefined && config[key] === true;
}

export function shouldSurfaceEvent({ config, event, permission, visibilityState, documentHasFocus = true, currentSessionId }) {
  if (!isNormalizedNotificationEvent(event)) return false;
  if (permission !== "granted" || !eventEnabled(config, event.type)) return false;
  return visibilityState !== "visible" || documentHasFocus !== true || currentSessionId !== event.sessionId;
}

/**
 * Detect a plan-review pending from the rc.1 pending-interaction snapshot.
 * Plan review flows through `userQuestions.ask()` (exit_plan_mode), which
 * never writes a `tool/call` log event, so the host state machine cannot see
 * it. rc.1 stores that state outside session-list rows. Subagent sessions and
 * the currently selected session are excluded (opening the session is its
 * natural dismissal, mirroring the viewed semantics).
 * @param pendingBySession - pending snapshot keyed by session id (a Map in rc.1).
 * @param byId - session list rows keyed by session id.
 * @param currentSessionId - the currently selected session, if any.
 */
export function detectPendingPlanReview(pendingBySession, byId, currentSessionId) {
  if (!byId || typeof byId !== "object") return false;
  for (const id of Object.keys(byId)) {
    const row = byId[id];
    const pending = typeof pendingBySession?.get === "function"
      ? pendingBySession.get(id)
      : pendingBySession?.[id];
    if (row && pending?.kind === "plan-review" && row.origin !== "subagent" && id !== currentSessionId) return true;
  }
  return false;
}
