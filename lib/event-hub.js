const DEFAULT_LIMIT = 256;
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

function frame(event) {
  return `id: ${event.eventId}\nevent: notification\ndata: ${JSON.stringify(event)}\n\n`;
}

export function createEventHub(options = {}) {
  const limit = options.limit || DEFAULT_LIMIT;
  const maxAgeMs = options.maxAgeMs || DEFAULT_MAX_AGE_MS;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const clients = new Set();
  let entries = [];

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
      const payload = frame(event);
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
      const lastId = req.headers["last-event-id"];
      if (typeof lastId === "string" && lastId !== "") {
        const index = entries.findIndex((entry) => entry.event.eventId === lastId);
        if (index >= 0) {
          for (const entry of entries.slice(index + 1)) res.write(frame(entry.event));
        }
      }
      clients.add(res);
      const keepalive = setInterval(() => {
        try { res.write(": keepalive\n\n"); }
        catch { clients.delete(res); }
      }, 20_000);
      const close = () => {
        clearInterval(keepalive);
        clients.delete(res);
      };
      req.on("close", close);
      req.on("error", close);
      return close;
    },
    close() {
      for (const client of clients) {
        try { client.end(); } catch {}
      }
      clients.clear();
      entries = [];
    },
    snapshot() {
      prune();
      return entries.map((entry) => entry.event);
    }
  };
}
