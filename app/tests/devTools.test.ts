import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("the dev-only switch is not in the page a release ships: dev code adds it (owner, 2026-11-22)", () => {
  // it was written into index.html with `hidden`, which `.switch{display:flex}` overrides: every release since
  // 1.9.0 showed « Encadrer en rouge les zones lues (développement) » to players, wired to nothing
  const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
  expect(html).not.toContain("debug-areas");
  expect(html).not.toContain("settings.debugAreas");
});
