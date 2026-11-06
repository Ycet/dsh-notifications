import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("built client registers its own settings section plus the official section-icon slot", (t) => {
  const bundle = readFileSync(new URL("../client.js", import.meta.url), "utf8");
  const cleanups = [];
  const registrations = [];
  let client;

  const window = {
    __ModuleLoader__: {
      load(entry) {
        client = entry.factory((name) => {
          if (name === "react") return { createElement: (type, props, ...children) => ({ type, props, children }) };
          // 官方 Switch 由宿主静态模块表提供；该用例只校验注册行为，用桩组件即可。
          if (name === "@deepseek-ai/dsh-client-ui-primitives") return { Switch: (props) => ({ type: "Switch", props }) };
          throw new Error(`unexpected client dependency: ${name}`);
        });
      }
    }
  };
  const document = {
    head: { appendChild() {} },
    createElement() {
      return { dataset: {}, remove() {} };
    }
  };

  vm.runInNewContext(bundle, {
    window,
    document,
    BroadcastChannel: undefined,
    EventSource: undefined,
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ ok: true, value: {}, writable: true })
    }),
    console,
    Date,
    Math,
    JSON,
    Object,
    Set,
    Map,
    Number,
    Promise,
    Error,
    setInterval,
    clearInterval
  });

  t.after(() => {
    for (const cleanup of cleanups.reverse()) cleanup();
  });

  assert.ok(client?.apply, "client bundle did not export apply()");
  const ctx = {
    locale: {
      register() { return () => {}; },
      bind() { return (key) => key; }
    },
    sessions: {},
    effect(factory) {
      const cleanup = factory();
      if (typeof cleanup === "function") cleanups.push(cleanup);
      return cleanup;
    },
    slots: {
      inject(name, factory) {
        // 只允许注入本插件自己的分区槽与官方 0.2.2 新增的分区图标槽。
        assert.ok(name === "settings.section" || name === "settings.section.icon", `unexpected slot: ${name}`);
        return factory();
      },
      register(options) {
        registrations.push(options);
        return () => {};
      }
    }
  };

  client.apply(ctx);
  const settings = registrations.find((registration) => registration.name === "settings.section");
  assert.equal(settings?.id, "dsh-notifications");
  assert.equal(settings?.order, 70);
  assert.equal(settings?.icon.type, "svg");
  assert.equal(settings?.icon.props.viewBox, "0 0 1024 1024");
  assert.equal(settings?.icon.children[0].props.fill, "currentColor");
  // 官方 0.2.2 起新增 settings.section.icon：注册 id 必须等于分区 id，否则壳层不渲染。
  const icon = registrations.find((registration) => registration.name === "settings.section.icon");
  assert.equal(icon?.id, "dsh-notifications");
  assert.equal(icon?.order, 70);
  assert.equal(registrations.length, 2);
});
