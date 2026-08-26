const DEFAULT_LIMIT = 256;
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

function notificationFrame(event) {
  return `id: ${event.eventId}\nevent: notification\ndata: ${JSON.stringify(event)}\n\n`;
}

function stateFrame(seq, level) {
  return `id: state:${seq}\nevent: state\ndata: ${JSON.stringify({ level })}\n\n`;
}

export function createEventHub(options = {}) {
  const limit = options.limit || DEFAULT_LIMIT;
  const maxAgeMs = options.maxAgeMs || DEFAULT_MAX_AGE_MS;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const clients = new Set();
  const keepalives = new Map();
  let entries = [];
  let currentLevel = null;
  let stateSequence = 0;

  const prune = () => {
    const cutoff = now() - maxAgeMs;
    entries = entries.filter((entry) => entry.storedAt >= cutoff);
    if (entries.length > limit) entries = entries.slice(entries.length - limit);
  };

  return {
    publish(event) {
      const stored = { event, storedAt: now() };
      entries.push(stored);
      prune();
      const payload = notificationFrame(event);
      for (const client of [...clients]) {
        try { client.write(payload); }
        catch { clients.delete(client); }
      }
    },
    /**
     * Broadcast the aggregate favicon level and remember it so every
     * subsequently attached client receives it immediately. State frames are
     * not stored in the replay buffer (replay concerns notifications only).
     */
    publishState(level) {
      currentLevel = level;
      const payload = stateFrame(++stateSequence, level);
      for (const client of [...clients]) {
        try { client.write(payload); }
        catch { clients.delete(client); }
      }
    },
    attach(req, res) {
      prune();
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store",
        "connection": "keep-alive",
        "x-accel-buffering": "no"
      });
      res.write(": connected\n\n");
      if (currentLevel !== null) res.write(stateFrame(stateSequence, currentLevel));
      const lastId = req.headers["last-event-id"];
      if (typeof lastId === "string" && lastId !== "") {
        const index = entries.findIndex((entry) => entry.event.eventId === lastId);
        if (index >= 0) {
          for (const entry of entries.slice(index + 1)) res.write(notificationFrame(entry.event));
        }
      }
      clients.add(res);
      const keepalive = setInterval(() => {
        try { res.write(": keepalive\n\n"); }
        catch { clients.delete(res); }
      }, 20_000);
      keepalives.set(res, keepalive);
      const close = () => {
        clearInterval(keepalive);
        keepalives.delete(res);
        clients.delete(res);
      };
      req.on("close", close);
      req.on("error", close);
      return close;
    },
    close() {
      for (const [client, keepalive] of keepalives) {
        clearInterval(keepalive);
        try { client.end(); } catch {}
      }
      keepalives.clear();
      clients.clear();
      entries = [];
      currentLevel = null;
      stateSequence = 0;
    },
    snapshot() {
      prune();
      return entries.map((entry) => entry.event);
    }
  };
}
