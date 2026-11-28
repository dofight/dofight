import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// A window method a page calls without its permission fails without a word: « Réduire » did nothing, the sheet's
// window could not read its scale factor (owner, 2026-11-27). Every method the sheets' page calls on its window
// has its `core:window:allow-…` in the sheets' capability.
it("lets the sheets' windows call every window method their page uses", () => {
  const page = readFileSync("src/peekPage.ts", "utf8");
  const calls = new Set([...page.matchAll(/(?:getCurrentWindow\(\)|\bwin)\.(\w+)\(/g)].map((m) => m[1]));
  const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  // onResized listens to an event (core:event:default), not a window command
  const needed = [...calls].filter((c) => !c.startsWith("on")).map((c) => `core:window:allow-${kebab(c)}`);
  const granted: string[] = JSON.parse(readFileSync("src-tauri/capabilities/peek.json", "utf8")).permissions;
  expect(needed.filter((p) => !granted.includes(p))).toEqual([]);
  expect(needed).toContain("core:window:allow-scale-factor");
});
