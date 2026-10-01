import assert from "node:assert/strict";
import test from "node:test";
import { installNotificationNavIcon } from "../lib/settings-nav-icon.js";

const MARK = "data-dsh-notifications-nav-icon";
function fixture() {
  let observer;
  const button = textContent => {
    const attributes = new Map();
    return {
      textContent, firstElementChild: { localName: "svg", children: [{ glyph: "native" }] },
      onclick: () => {},
      hasAttribute: name => attributes.has(name),
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: name => attributes.delete(name)
    };
  };
  const notifications = button("消息通知");
  const account = button("账户");
  const document = {
    body: {},
    querySelectorAll: selector => selector === `[${MARK}]`
      ? [notifications, account].filter(row => row.hasAttribute(MARK))
      : [notifications, account]
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe(target, options) { this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  return { document, MutationObserver, notifications, account, get observer() { return observer; } };
}

test("notification icon fallback affects only its settings row and preserves native nodes and actions", () => {
  const env = fixture();
  const svg = env.notifications.firstElementChild;
  const action = env.notifications.onclick;
  const dispose = installNotificationNavIcon(() => "消息通知", env);
  assert.equal(env.notifications.hasAttribute(MARK), true);
  assert.equal(env.account.hasAttribute(MARK), false);
  assert.equal(env.notifications.firstElementChild, svg);
  assert.equal(svg.children[0].glyph, "native");
  assert.equal(env.notifications.onclick, action);
  dispose();
});

test("navigation icon follows locale changes and removes a stale match", () => {
  const env = fixture(); let label = "消息通知";
  const dispose = installNotificationNavIcon(() => label, env);
  label = "Notifications"; env.notifications.textContent = label;
  env.observer.callback();
  assert.equal(env.notifications.hasAttribute(MARK), true);
  env.notifications.textContent = "Unrelated settings";
  env.observer.callback();
  assert.equal(env.notifications.hasAttribute(MARK), false);
  dispose();
});

test("icon observation does not watch its own attributes and is released on disposal", () => {
  const env = fixture();
  const dispose = installNotificationNavIcon(() => "消息通知", env);
  assert.equal(env.observer.options.attributes, undefined);
  env.observer.callback();
  dispose();
  assert.equal(env.observer.disconnected, true);
  assert.equal(env.notifications.hasAttribute(MARK), false);
});
