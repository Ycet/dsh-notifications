import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("built client registers the official plugin settings item and required runtime paths", () => {
  const bundle = readFileSync(new URL("../client.js", import.meta.url), "utf8");
  assert.match(bundle, /id: "dsh-notifications"/);
  assert.match(bundle, /settings\.plugin\.item/);
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
  assert.doesNotMatch(bundle, /MutationObserver/);
});

test("built client carries the favicon status indicator feature", () => {
  const bundle = readFileSync(new URL("../client.js", import.meta.url), "utf8");
  assert.match(bundle, /faviconEnabled/);
  assert.match(bundle, /dsh-notifications\/api\/viewed/);
  assert.match(bundle, /pendingSafe/);
  assert.match(bundle, /useSessionPendingInteraction/);
  assert.match(bundle, /dsh-notifications-pending-interactions/);
  assert.match(bundle, /setPendingInteractions/);
  assert.doesNotMatch(bundle, /row\.pendingInteraction/);
  assert.match(bundle, /running === !0/);
  assert.match(bundle, /dsh-notify-legend/);
  assert.match(bundle, /addEventListener\([^)]*"state"/);
  assert.match(bundle, /F5C518/);
  assert.match(bundle, /E5484D/);
  assert.match(bundle, /30A46C/);
  assert.match(bundle, /link\[rel=.icon.\]/);
  assert.match(bundle, /__DSH_FILL__/);
  assert.match(bundle, /encodeURIComponent/);
  assert.match(bundle, /level === "green"/);
  assert.match(bundle, /visibilitychange/);
  assert.match(bundle, /addEventListener\([^)]*"focus"/);
});
