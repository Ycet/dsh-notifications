import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("built client registers the official plugin settings item and required runtime paths", () => {
  const bundle = readFileSync(new URL("../client.js", import.meta.url), "utf8");
  assert.match(bundle, /id: "dsh-notifications"/);
  assert.match(bundle, /settings\.plugin\.item/);
  assert.match(bundle, /dsh-notifications\/api\/events/);
  assert.match(bundle, /new (?:window\.)?Notification/);
  assert.match(bundle, /ctx\.sessions\.open/);
  assert.doesNotMatch(bundle, /MutationObserver/);
});
