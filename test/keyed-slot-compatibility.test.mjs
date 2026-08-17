import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("built client registers the notification card with a keyed settings slot", (t) => {
  const bundle = readFileSync(new URL("../client.js", import.meta.url), "utf8");
  const cleanups = [];
  const registrations = [];
  let client;

  const window = {
    __ModuleLoader__: {
      load(entry) {
        client = entry.factory((name) => {
          if (name === "react") return {};
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
        assert.equal(name, "settings.plugin.item");
        return factory();
      },
      register(options) {
        if (options.key === undefined) {
          throw new Error(`keyed slot ${JSON.stringify(options.name)} requires options.key`);
        }
        registrations.push(options);
        return () => {};
      }
    }
  };

  client.apply(ctx);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].key, "dsh-notifications");
  assert.equal(registrations[0].id, "notifications");
});
