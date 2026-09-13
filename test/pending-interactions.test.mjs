import assert from "node:assert/strict";
import test from "node:test";
import { createStateController } from "../src/client.js";

function snapshotStore(value) {
  const listeners = new Set();
  return {
    getSnapshot() { return value; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

test("pending interaction snapshots drive plan-review favicon state and focus acknowledgement", () => {
  const original = {
    fetch: globalThis.fetch,
    document: globalThis.document,
    window: globalThis.window
  };
  let focused = true;
  const requests = [];
  const documentListeners = new Map();
  const windowListeners = new Map();
  const levels = [];
  const snapshot = {
    current: "current",
    byId: {
      current: { origin: undefined, running: false },
      background: { origin: undefined, running: false }
    }
  };

  globalThis.fetch = (_path, options) => {
    requests.push(options);
    return Promise.resolve();
  };
  globalThis.document = {
    visibilityState: "visible",
    hasFocus: () => focused,
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    removeEventListener(type) { documentListeners.delete(type); }
  };
  globalThis.window = {
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    removeEventListener(type) { windowListeners.delete(type); }
  };

  try {
    const state = createStateController({
      controller: { apply(level) { levels.push(level); } },
      store: snapshotStore({ value: { faviconEnabled: true } }),
      sessions: { list: { getSnapshot: () => snapshot, subscribe: () => () => {} } }
    });
    const dispose = state.start();
    requests.length = 0;

    state.setPendingInteractions(new Map([["background", { kind: "plan-review" }]]));
    assert.equal(state.getLevel(), "yellow");
    assert.equal(levels.at(-1), "yellow");

    state.setPendingInteractions(new Map([["current", { kind: "approval" }]]));
    assert.equal(state.getLevel(), null, "the current plan-safe pending is excluded from the favicon");
    windowListeners.get("focus")();
    assert.equal(requests.length, 1, "returning acknowledges pending reminders too");

    state.setPendingInteractions(new Map());
    windowListeners.get("focus")();
    assert.equal(requests.length, 2);
    assert.deepEqual(JSON.parse(requests[0].body), { sessionId: "current" });
    state.setPendingInteractions(new Map([["current", { kind: "plan-review" }]]));
    assert.equal(state.getLevel(), null);
    focused = false;
    windowListeners.get("blur")();
    assert.equal(state.getLevel(), "yellow", "switching apps includes the selected session");
    focused = true;
    windowListeners.get("focus")();
    assert.equal(state.getLevel(), null);
    globalThis.document.visibilityState = "hidden";
    documentListeners.get("visibilitychange")();
    assert.equal(state.getLevel(), "yellow", "switching tabs includes the selected session");
    globalThis.document.visibilityState = "visible";
    documentListeners.get("visibilitychange")();
    assert.equal(state.getLevel(), null);
    dispose();
    assert.equal(windowListeners.size, 0);
    assert.equal(documentListeners.size, 0);
  } finally {
    globalThis.fetch = original.fetch;
    if (original.document === undefined) delete globalThis.document;
    else globalThis.document = original.document;
    if (original.window === undefined) delete globalThis.window;
    else globalThis.window = original.window;
  }
});
