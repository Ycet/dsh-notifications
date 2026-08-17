const APPROVAL_TYPES = new Set([
  "approval/asked",
  "approval/request",
  "approval/pending",
  "permission/request",
  "permission/pending",
  "tool/approval",
  "tool/approval-request"
]);

const QUESTION_TYPES = new Set([
  "question/request",
  "question/pending",
  "input/request",
  "input/pending",
  "user-input/request",
  "user-input/pending"
]);

const QUESTION_TOOLS = new Set([
  "request_user_input",
  "request-user-input",
  "ask_user",
  "ask-user",
  "ask_user_question"
]);

const FAILED_TYPES = new Set([
  "turn/error",
  "turn/failed",
  "agent/error",
  "agent/failed",
  "task/error",
  "task/failed"
]);

const CANCELLED_TYPES = new Set([
  "turn/cancel",
  "turn/cancelled",
  "turn/aborted",
  "agent/cancelled",
  "agent/aborted",
  "task/cancelled",
  "task/aborted"
]);

const FAILED_OUTCOMES = new Set(["error", "failed", "failure"]);
const CANCELLED_OUTCOMES = new Set(["abort", "aborted", "cancel", "cancelled", "canceled", "killed", "stopped"]);

export const NOTIFICATION_EVENT_TYPES = Object.freeze([
  "approval_pending",
  "question_pending",
  "task_succeeded",
  "task_failed"
]);

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function token(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[._:]+/g, "/") : "";
}

function outcomeOf(data) {
  for (const value of [data.outcome, data.status, data.result, data.finishReason, data.finish_reason]) {
    const normalized = token(value);
    if (normalized !== "") return normalized;
  }
  const directReason = token(data.reason);
  if (directReason !== "") return directReason;
  const reason = record(data.reason);
  for (const value of [reason.kind, reason.status, reason.outcome, reason.reason]) {
    const normalized = token(value);
    if (normalized !== "") return normalized;
  }
  if (data.error !== undefined && data.error !== null && data.error !== false) return "error";
  if (reason.error !== undefined && reason.error !== null && reason.error !== false) return "error";
  return "";
}

function isPendingKind(type, data, word) {
  if (!type.includes(word)) return false;
  const state = token(data.status || data.state || data.phase);
  return type.includes("request") || type.includes("pending") || state === "request" || state === "requested" || state === "pending" || state === "waiting";
}

function classifyType(event) {
  const type = token(event && event.type);
  const data = record(event && event.data);

  if (APPROVAL_TYPES.has(type) || isPendingKind(type, data, "approval") || isPendingKind(type, data, "permission")) {
    return "approval_pending";
  }
  if (QUESTION_TYPES.has(type) || isPendingKind(type, data, "question") || isPendingKind(type, data, "user-input")) {
    return "question_pending";
  }
  if (type === "tool/call") {
    const name = token(data.name || record(data.tool).name).replaceAll("/", "_");
    if (QUESTION_TOOLS.has(name) || QUESTION_TOOLS.has(token(data.name || record(data.tool).name))) {
      return "question_pending";
    }
  }

  if (CANCELLED_TYPES.has(type)) return undefined;
  if (FAILED_TYPES.has(type)) return "task_failed";
  if (type === "turn/end" || type === "agent/end" || type === "task/end" || type === "task/completed") {
    const outcome = outcomeOf(data);
    if (CANCELLED_OUTCOMES.has(outcome)) return undefined;
    if (FAILED_OUTCOMES.has(outcome)) return "task_failed";
    return "task_succeeded";
  }
  return undefined;
}

function eventSequence(event, fallback) {
  const seq = event && event.seq;
  if (typeof seq === "number" && Number.isFinite(seq)) return seq;
  if (typeof seq === "string" && seq !== "") return seq;
  return fallback;
}

export function createEventClassifier(options = {}) {
  const states = new Map();
  let fallbackSequence = 0;
  const now = typeof options.now === "function" ? options.now : Date.now;

  return {
    classify(sessionId, event) {
      if (typeof sessionId !== "string" || sessionId === "" || event === null || typeof event !== "object") return undefined;
      const type = classifyType(event);
      if (type === undefined) return undefined;

      const seq = eventSequence(event, `local-${++fallbackSequence}`);
      const state = states.get(sessionId) || { seen: new Set(), latestNumericSeq: -1 };
      if (typeof seq === "number" && seq < state.latestNumericSeq) return undefined;
      if (typeof seq === "number") state.latestNumericSeq = Math.max(state.latestNumericSeq, seq);
      const identity = `${String(seq)}:${type}`;
      if (state.seen.has(identity)) return undefined;
      state.seen.add(identity);
      if (state.seen.size > 512) state.seen.delete(state.seen.values().next().value);
      states.set(sessionId, state);

      const time = event.time;
      return {
        eventId: `${sessionId}:${String(seq)}:${type}`,
        type,
        sessionId,
        occurredAt: typeof time === "number" && Number.isFinite(time) ? time : now()
      };
    },
    disposeSession(sessionId) {
      states.delete(sessionId);
    }
  };
}

export function eventContract(event) {
  const data = record(event && event.data);
  return {
    type: typeof (event && event.type) === "string" ? event.type : "",
    dataKeys: Object.keys(data).sort()
  };
}
