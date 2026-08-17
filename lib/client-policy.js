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
