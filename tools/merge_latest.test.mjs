// node --test tools/merge_latest.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeLatest } from "./merge_latest.mjs";

const published = {
  version: "1.9.0",
  notes: "Notes",
  pub_date: "2026-11-21T10:00:00Z",
  platforms: { "windows-x86_64": { signature: "w", url: "https://x/setup.exe" } },
};
const mac = {
  "darwin-aarch64": { signature: "m", url: "https://x/Dofight.app.tar.gz" },
  "darwin-x86_64": { signature: "m", url: "https://x/Dofight.app.tar.gz" },
};

test("adds the Mac entries and keeps Windows, the version and the notes", () => {
  const out = mergeLatest(published, mac);
  assert.deepEqual(out.platforms["windows-x86_64"], published.platforms["windows-x86_64"]);
  assert.deepEqual(out.platforms["darwin-aarch64"], mac["darwin-aarch64"]);
  assert.equal(out.version, "1.9.0");
  assert.equal(out.notes, "Notes");
});

test("merging twice gives the same file; the input is not changed", () => {
  const once = mergeLatest(published, mac);
  assert.deepEqual(mergeLatest(once, mac), once);
  assert.equal(Object.keys(published.platforms).length, 1);
});
