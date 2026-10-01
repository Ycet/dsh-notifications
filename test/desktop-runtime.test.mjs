import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { apply, Config, DEFAULTS, EVENTS_PATH } from "../index.js";

// 指向已准备好的官方运行时；日常单元测试无需额外安装完整 DSH。
const runtime = process.env.DSH_RUNTIME_DIR;
test("official Desktop runtime: scoped session events, child identity and disposal", { skip: !runtime }, async t => {
  const load = name => import(pathToFileURL(join(runtime, "node_modules", "@deepseek-ai", name, "lib/index.js")));
  const { Context } = await load("cordis");
  const { SessionStore } = await load("dsh-session");
  const { SessionProjectionRegistry } = await load("dsh-session-projection");
  const { SubagentRuntime } = await load("dsh-subagent");
  const { createScope } = await load("dsh-scope");
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  const routes = new Map();
  ctx.provide("webServer", { register(route) {
    routes.set(route.path, route.handler); return () => routes.delete(route.path);
  } });
  ctx.provide("settings", { describe: () => [{ ns: "notifications", revision: 1 }] });
  new SessionStore(ctx);
  new SessionProjectionRegistry(ctx);
  new SubagentRuntime(ctx, SubagentRuntime.Config({}));
  await new Promise(resolve => setImmediate(resolve));
  // 旧 profile 的图标开关不会阻碍新版配置解析，也不会重新出现在设置表单中。
  const parsed = Config({ faviconEnabled: true, taskFailedEnabled: false });
  assert.equal(parsed.taskFailedEnabled.get(), false);
  const switches = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, { get: () => v }]));
  const plugin = ctx.plugin({ name: "dsh-notifications-probe", apply: c => apply(c, switches) });
  await new Promise(resolve => setImmediate(resolve));
  const request = new EventEmitter(); request.method = "GET"; request.headers = { host: "127.0.0.1:3080" };
  let output = ""; let closed = false;
  routes.get(EVENTS_PATH)(request, { writeHead() {}, write(chunk) { output += chunk; }, end() { closed = true; } });
  const parentKey = {};
  const scope = createScope(ctx, parentKey);
  const parent = scope.ctx.sessions.create("parent");
  parent.append("approval/asked", { id: "a", args: { secret: "private" } });
  parent.append("tool/call", { name: "ask_user_question", callId: "q", arguments: { secret: "private" } });
  parent.append("turn/end", { turn: 1, reason: { kind: "completed" } });
  parent.append("turn/end", { turn: 2, reason: { kind: "error" } });
  parent.append("turn/end", { turn: 3, reason: { kind: "aborted" } });
  const childScope = createScope(scope.ctx, {}, { parent: parentKey });
  const child = childScope.ctx.sessions.create("child", {
    meta: { parentSession: "parent", origin: "subagent", delegationDepth: 1 }
  });
  child.append("subagent/descriptor", { version: 3, mode: "continuable", provider: "test", label: "private" });
  child.append("turn/end", { turn: 1, reason: { kind: "completed" } });
  const frames = [...output.matchAll(/^data: (.+)$/gm)].map(m => JSON.parse(m[1]));
  assert.deepEqual(frames.map(x => x.type), ["approval_pending", "question_pending", "task_succeeded", "task_failed", "task_succeeded"]);
  assert.deepEqual(frames.at(-1).address, { parentSessionId: "parent", childSessionId: "child", mode: "continuable" });
  assert.equal(frames.at(-1).subagent, true);
  assert.doesNotMatch(output, /private|arguments|favicon|event: state/);
  await plugin.dispose();
  assert.equal(routes.size, 0);
  assert.equal(closed, true);
});
