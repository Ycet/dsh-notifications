import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("built client registers an independent settings page and required runtime paths", () => {
  const bundle = readFileSync(new URL("../client.js", import.meta.url), "utf8");
  assert.match(bundle, /id: "dsh-notifications"/);
  assert.match(bundle, /settings\.section/);
  assert.doesNotMatch(bundle, /settings\.plugins\.tab/);
  assert.match(bundle, /aria-expanded/);
  assert.match(bundle, /dsh-notify-card/);
  assert.match(bundle, /dsh-notify-body/);
  assert.match(bundle, /dsh-notifications\/api\/events/);
  assert.match(bundle, /new (?:window\.)?Notification/);
  assert.match(bundle, /ctx\.sessions\.open/);
  assert.match(bundle, /subagentTaskEndedEnabled/);
  assert.match(bundle, /aria-disabled/);
  assert.match(bundle, /aria-label/);
  assert.match(bundle, /data-disabled/);
  assert.match(bundle, /disabled: !draft\.enabled/);
  assert.match(bundle, /data-dsh-notifications-nav-icon/);
});

test("desktop client removes icon mutation and carries native session navigation", () => {
  const bundle = readFileSync(new URL("../client.js", import.meta.url), "utf8");
  assert.doesNotMatch(bundle, /faviconEnabled|__DSH_FILL__|api\/viewed|dsh-notify-legend/);
  assert.match(bundle, /adapter.*current/);
  assert.match(bundle, /workspace\.openSession/);
  assert.match(bundle, /childSessionId/);
  assert.match(bundle, /desktopPermissionDesc/);
});
