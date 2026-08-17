import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("package exposes a host and web client bundle", async () => {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(pkg.main, "index.js");
  assert.equal(pkg.exports["./client"], "./client.js");
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(pkg.dsh.client.platform, "web");
  assert.ok(pkg.dsh.client.inject.includes("@deepseek-ai/dsh-client-ui-slots"));
  const patch = await readFile(join(root, "cordis.patch.yml"), "utf8");
  assert.match(patch, /insert:/);
  assert.match(patch, /name: dsh-notifications/);
});

test("client registers the official plugin settings item and notification stream", async () => {
  const source = await readFile(join(root, "src/client.js"), "utf8");
  assert.match(source, /settings\.plugin\.item/);
  assert.match(source, /new EventSource\(EVENTS_PATH\)/);
  assert.match(source, /ctx\.sessions\.open/);
  assert.match(source, /Notification\.requestPermission/);
});
