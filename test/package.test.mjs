import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("package exposes a host and web client bundle", async () => {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(pkg.version, "0.3.1");
  assert.equal(pkg.main, "index.js");
  assert.equal(pkg.exports["./client"], "./client.js");
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(pkg.dsh.client.platform, "web");
  assert.ok(pkg.dsh.client.inject.includes("@deepseek-ai/dsh-client-ui-slots"));
  assert.ok(pkg.dsh.client.inject.includes("@deepseek-ai/dsh-client-ui-session"));
  assert.ok(pkg.dsh.client.inject.includes("@deepseek-ai/dsh-client-ui-workspace"));
  const patch = await readFile(join(root, "cordis.patch.yml"), "utf8");
  assert.match(patch, /insert:/);
  assert.match(patch, /name: dsh-notifications/);
});

test("client registers the independent settings section and notification stream", async () => {
  const source = await readFile(join(root, "src/client.js"), "utf8");
  assert.match(source, /settings\.section/);
  assert.doesNotMatch(source, /settings\.plugins\.tab/);
  assert.match(source, /id: "dsh-notifications"/);
  assert.match(source, /const \[open, setOpen\] = React\.useState\(true\)/);
  assert.match(source, /"aria-expanded": open/);
  assert.match(source, /new EventSource\(EVENTS_PATH\)/);
  assert.match(source, /ctx\.sessions\.open/);
  assert.match(source, /Notification\.requestPermission/);
  assert.match(source, /subagentTaskEndedEnabled/);
  assert.match(source, /disabled: !draft\.enabled/);
  assert.match(source, /aria-disabled/);
  assert.match(source, /aria-label/);
  assert.doesNotMatch(source, /faviconEnabled|api\/viewed|createFaviconController/);
  assert.match(source, /workspace\.openSession/);
});
