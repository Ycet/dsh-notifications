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
  assert.match(bundle, /disabled: !draft\.enabled/);
  assert.match(bundle, /data-dsh-notifications-nav-icon/);
  // 功能开关必须复用官方 primitives 的 Switch 组件，避免与官方设置页产生视觉差异。
  assert.match(bundle, /require\("@deepseek-ai\/dsh-client-ui-primitives"\)/);
  assert.match(bundle, /\.Switch\b/);
  // 自绘开关的类名与状态属性必须彻底移除，避免残留样式覆盖官方组件。
  assert.doesNotMatch(bundle, /dsh-notify-switch/);
  assert.doesNotMatch(bundle, /data-active/);
  assert.doesNotMatch(bundle, /data-disabled/);
  assert.doesNotMatch(bundle, /aria-disabled/);
});

test("desktop client removes icon mutation and carries native session navigation", () => {
  const bundle = readFileSync(new URL("../client.js", import.meta.url), "utf8");
  assert.doesNotMatch(bundle, /faviconEnabled|__DSH_FILL__|api\/viewed|dsh-notify-legend/);
  assert.match(bundle, /adapter.*current/);
  assert.match(bundle, /workspace\.openSession/);
  assert.match(bundle, /childSessionId/);
  assert.match(bundle, /desktopPermissionDesc/);
});
