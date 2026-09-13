import assert from 'node:assert/strict';
import test from 'node:test';
import { createStateController, createFaviconController } from '../src/client.js';
import { createStateTracker } from '../lib/state.js';

for (const away of ['tab', 'app']) {
  for (const [name, event, color] of [
    ['completion', { type: 'turn/end', data: { reason: { kind: 'completed' } } }, 'green'],
    ['failure', { type: 'turn/end', data: { reason: { kind: 'error' } } }, 'red'],
    ['approval', { type: 'approval/asked', data: { id: 'a' } }, 'yellow'],
    ['question', { type: 'tool/call', data: { name: 'ask_user_question', callId: 'q' } }, 'yellow'],
  ]) {
    test(`${away}: ${name} after viewing a running session colors and clears on return`, (t) => {
      const tracker = createStateTracker();
      tracker.apply('s', { type: 'turn/start', seq: 1 });
      const listeners = new Map();
      let focused = true;
      const doc = { visibilityState: 'visible', hasFocus: () => focused,
        addEventListener: (k, fn) => listeners.set(k, fn), removeEventListener: k => listeners.delete(k) };
      t.mock.method(globalThis, 'fetch', async (_url, options) => {
        const body = JSON.parse(options.body);
        tracker.markViewed(body.sessionId, body);
        state.handleState({ data: JSON.stringify({ level: tracker.aggregate() }) });
        return { ok: true };
      });
      const originalDoc = globalThis.document, originalWindow = globalThis.window;
      globalThis.document = doc; globalThis.window = doc;
      t.after(() => { globalThis.document = originalDoc; globalThis.window = originalWindow; });
      let applied;
      const state = createStateController({ controller: { apply: level => { applied = level; } },
        store: { getSnapshot: () => ({ value: { faviconEnabled: true } }), subscribe: () => () => {} },
        sessions: { list: { getSnapshot: () => ({ current: 's', byId: { s: { running: true } } }), subscribe: () => () => {} } } });
      t.after(state.start());
      focused = false; doc.visibilityState = away === 'tab' ? 'hidden' : 'visible';
      listeners.get(away === 'tab' ? 'visibilitychange' : 'blur')?.();
      tracker.apply('s', { ...event, seq: 2 });
      state.handleState({ data: JSON.stringify({ level: tracker.aggregate() }) });
      assert.equal(applied, color, 'a later event must not inherit an earlier viewed flag');
      focused = true; doc.visibilityState = 'visible';
      listeners.get(away === 'tab' ? 'visibilitychange' : 'focus')();
      assert.equal(applied, null, 'returning must clear even if the session row still says running');
    });
  }
}

test('a delayed SVG load cannot recolor after restoring the default', async (t) => {
  const originalDoc = globalThis.document;
  const link = { href: 'http://localhost/favicon.svg', isConnected: true };
  globalThis.document = { querySelector: () => link };
  t.after(() => { globalThis.document = originalDoc; });
  let release;
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { release = resolve; }));
  const favicon = createFaviconController();
  const pending = favicon.apply('green');
  await favicon.apply(null);
  release({ ok: true, text: async () => '<svg><path fill="#000"/></svg>' });
  await pending;
  assert.equal(link.href, 'http://localhost/favicon.svg');
});

for (const hidden of [true, false]) {
  test(`background initialization does not acknowledge state (hidden=${hidden})`, (t) => {
    const originalDoc = globalThis.document, originalWindow = globalThis.window;
    let focused = false, requests = 0, notifyList;
    const listeners = new Map();
    const doc = { visibilityState: hidden ? 'hidden' : 'visible', hasFocus: () => focused,
      addEventListener: (k, fn) => listeners.set(k, fn), removeEventListener: k => listeners.delete(k) };
    globalThis.document = doc; globalThis.window = doc;
    t.after(() => { globalThis.document = originalDoc; globalThis.window = originalWindow; });
    t.mock.method(globalThis, 'fetch', async () => { requests++; return { ok: true }; });
    const snapshot = { current: 's', byId: { s: { running: true } } };
    const state = createStateController({ controller: { apply() {} },
      store: { getSnapshot: () => ({ value: { faviconEnabled: true } }), subscribe: () => () => {} },
      sessions: { list: { getSnapshot: () => snapshot, subscribe: fn => { notifyList = fn; return () => {}; } } } });
    t.after(state.start());
    snapshot.current = 'other'; notifyList();
    state.handleState({ data: JSON.stringify({ level: 'green' }) });
    assert.equal(requests, 0);
    doc.visibilityState = 'visible'; listeners.get('visibilitychange')();
    assert.equal(requests, 0, 'visible without focus is not viewed');
    focused = true; listeners.get('focus')();
    assert.equal(requests, 1);
    state.handleState({ data: JSON.stringify({ level: 'red' }) });
    assert.equal(requests, 2, 'state arriving after focus is acknowledged too');
  });
}

test('latest color wins when SVG requests finish out of order', async (t) => {
  const originalDoc = globalThis.document;
  const link = { href: 'http://localhost/favicon.svg', isConnected: true };
  globalThis.document = { querySelector: () => link };
  t.after(() => { globalThis.document = originalDoc; });
  const releases = [];
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => releases.push(resolve)));
  const favicon = createFaviconController();
  const green = favicon.apply('green'), yellow = favicon.apply('yellow');
  const response = { ok: true, text: async () => '<svg><path fill="#000"/></svg>' };
  releases[1](response); await yellow;
  releases[0](response); await green;
  assert.match(decodeURIComponent(link.href), /#F5C518/);
  await favicon.apply(null);
  assert.equal(link.href, 'http://localhost/favicon.svg');
});
