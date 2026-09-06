const QUESTION_TOOLS = new Set([
  "request_user_input",
  "request-user-input",
  "ask_user",
  "ask-user",
  "ask_user_question"
]);

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function token(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[._:]+/g, "/") : "";
}

function questionName(data) {
  const source = data.name || record(data.tool).name;
  const name = token(source).replaceAll("/", "_");
  if (QUESTION_TOOLS.has(name) || QUESTION_TOOLS.has(token(source))) return name;
  return "";
}

function turnEndKind(data) {
  const kind = typeof data.reason?.kind === "string" ? data.reason.kind : "";
  if (kind !== "") return kind;
  return token(data.status || data.outcome || "");
}

/**
 * Per-session favicon state tracker.
 *
 * Consumed with non-subagent `session/event` events only (the plugin filters
 * subagent sessions before feeding this tracker). Each session holds a
 * `pending` key set (approval ids / question call ids), a `failed` bit, a
 * `completed` bit and a `viewed` bit. `markViewed` is sticky until the
 * session's next `turn/start`, so "open the conversation" clears its color
 * contribution for the whole current round. Events are idempotent (keyed
 * sets and seq guard) and out-of-order resolution events are safe no-ops.
 */
export function createStateTracker() {
  const sessions = new Map();
  const viewedIds = new Set();

  const fresh = (sessionId) => ({
    pending: new Set(),
    failed: false,
    completed: false,
    sequence: -1,
    viewed: viewedIds.has(sessionId)
  });

  return {
    apply(sessionId, event) {
      if (typeof sessionId !== "string" || sessionId === "" || event === null || typeof event !== "object") return;
      const type = token(event.type);
      const data = record(event.data);
      let session = sessions.get(sessionId);
      const seq = typeof event.seq === "number" && Number.isFinite(event.seq) ? event.seq : undefined;
      if (session === undefined) {
        if (typeof seq === "number" && seq <= -1) return;
        session = fresh(sessionId);
        sessions.set(sessionId, session);
      } else if (typeof seq === "number" && seq <= session.sequence) {
        return;
      }
      if (typeof seq === "number") session.sequence = seq;

      if (type === "approval/asked") {
        const id = typeof data.id === "string" ? data.id : "";
        if (id !== "") session.pending.add(`a:${id}`);
      } else if (type === "approval/decided") {
        const id = typeof data.id === "string" ? data.id : "";
        if (id !== "") session.pending.delete(`a:${id}`);
      } else if (type === "tool/call") {
        const name = questionName(data);
        if (name !== "") {
          const callId = typeof data.callId === "string" ? data.callId : "";
          const key = callId !== "" ? `q:${callId}` : `q:seq:${session.sequence}`;
          session.pending.add(key);
        }
      } else if (type === "tool/result") {
        // callId 的层级在 DSH 事件流中演变过：顶层 data.callId、
        // data.message.callId 与当前版本 data.message.source.callId 均兼容。
        const source = typeof data.message?.source === "object" && data.message.source !== null ? data.message.source : {};
        const callId = typeof data.callId === "string"
          ? data.callId
          : typeof source.callId === "string"
            ? source.callId
            : typeof data.message?.callId === "string" ? data.message.callId : "";
        if (callId !== "") session.pending.delete(`q:${callId}`);
      } else if (type === "turn/start") {
        session.pending.clear();
        session.failed = false;
        session.completed = false;
        session.viewed = false;
        viewedIds.delete(sessionId);
      } else if (type === "turn/end") {
        const kind = turnEndKind(data);
        session.pending.clear();
        if (kind === "error") {
          session.failed = true;
          session.completed = false;
        } else if (kind === "completed") {
          session.failed = false;
          session.completed = true;
        } else if (kind !== "") {
          session.failed = false;
          session.completed = false;
        }
      }
    },

    /**
     * Mark a session as viewed (its color contribution stops counting).
     * Sticky across event arrival order; reset only by the next turn/start.
     * With `pendingSafe: true` the mark is refused while the session still has
     * pending asks (approvals / questions awaiting the user): coming back to
     * the page must not hide an unanswered reminder. Explicitly opening the
     * conversation (`pendingSafe: false`, default) clears regardless.
     *
     * Note: pending always outranks viewed in `aggregate()` — an unanswered
     * ask is a live action reminder, so a session that was opened earlier
     * still colors yellow until the ask resolves.
     * @returns whether the viewed set actually changed.
     */
    markViewed(sessionId, options) {
      if (typeof sessionId !== "string" || sessionId === "" || viewedIds.has(sessionId)) return false;
      const session = sessions.get(sessionId);
      if (options?.pendingSafe === true && session !== undefined && session.pending.size > 0) return false;
      viewedIds.add(sessionId);
      if (session !== undefined) {
        session.viewed = true;
        // 明确打开会话（而非切回页面）：待回答/待审批提醒一并视为已见。
        // pending 保留的话 aggregate 仍会显示黄色（pending 优先于 viewed）。
        session.pending.clear();
      }
      return true;
    },

    disposeSession(sessionId) {
      sessions.delete(sessionId);
      viewedIds.delete(sessionId);
    },

    /** Aggregate level with priority yellow > red > green; null when neutral. */
    aggregate() {
      let yellow = false;
      let red = false;
      let green = false;
      for (const session of sessions.values()) {
        // pending 是实时行动提醒：即使会话已点开（viewed）也先于 viewed 生效，
        // 保证"待回答/待审批 → 黄"在切回页面后依然成立；viewed 只压制失败/完成等过去状态。
        if (session.pending.size > 0) {
          yellow = true;
          continue;
        }
        if (session.viewed) continue;
        if (session.failed) red = true;
        else if (session.completed) green = true;
      }
      return yellow ? "yellow" : red ? "red" : green ? "green" : null;
    },

    snapshot() {
      return [...sessions.entries()].map(([sessionId, state]) => ({
        sessionId,
        pending: [...state.pending],
        failed: state.failed,
        completed: state.completed,
        viewed: state.viewed
      }));
    }
  };
}