import { expect, it } from "vitest";
import { narrowed, previewRect, sideTop, widened } from "../src/previewSide";

const screen = { x: 0, y: 0, width: 1920, height: 1080 };

it("goes left of an overlay on the right half", () => {
  expect(previewRect({ x: 1590, y: 40, width: 320, height: 1000 }, screen)).toEqual({ x: 1270, y: 40, width: 320, height: 1000 });
});

it("goes right of an overlay on the left half", () => {
  expect(previewRect({ x: 10, y: 40, width: 320, height: 1000 }, screen)).toEqual({ x: 330, y: 40, width: 320, height: 1000 });
});

it("stays on the screen when space is short", () => {
  const r = previewRect({ x: 200, y: 40, width: 500, height: 900 }, { x: 0, y: 0, width: 1100, height: 1080 });
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(1100);
});

it("works on a second monitor", () => {
  expect(previewRect({ x: 3500, y: 40, width: 320, height: 1000 }, { x: 1920, y: 0, width: 1920, height: 1080 }).x).toBe(3180);
});

it("narrows a sheet that asks for less width, against the panel on its left", () => {
  // the sheet is left of the panel (panel at x 1590): it keeps its edge next to the panel
  expect(narrowed({ x: 1266, y: 40, width: 320, height: 500 }, 1590, 260)).toEqual({ x: 1326, y: 40, width: 260, height: 500 });
});

it("narrows a sheet on the panel's right from its far edge", () => {
  expect(narrowed({ x: 334, y: 40, width: 320, height: 500 }, 10, 260)).toEqual({ x: 334, y: 40, width: 260, height: 500 });
});

it("never widens a sheet past the panel's width", () => {
  expect(narrowed({ x: 334, y: 40, width: 220, height: 500 }, 10, 260)).toEqual({ x: 334, y: 40, width: 220, height: 500 });
});

it("widens a sheet wider than the panel against the panel, and keeps it on screen", () => {
  const screen = { x: 0, y: 0, width: 1920, height: 1080 };
  // on the panel's left: it grows away from the panel
  expect(widened({ x: 1266, y: 40, width: 320, height: 500 }, 1590, 420, screen)).toEqual({ x: 1166, y: 40, width: 420, height: 500 });
  // on the right: from the panel's edge on
  expect(widened({ x: 334, y: 40, width: 320, height: 500 }, 10, 420, screen)).toEqual({ x: 334, y: 40, width: 420, height: 500 });
  // never off the screen
  expect(widened({ x: 1700, y: 40, width: 220, height: 500 }, 10, 420, screen)).toEqual({ x: 1500, y: 40, width: 420, height: 500 });
});

it("keeps a preview between the panel's top and bottom, level with the row when it fits (owner, 2026-11-26)", () => {
  const panel = { y: 100, height: 800 }, screen = { y: 0, height: 1040 };
  expect(sideTop(400, 200, panel, screen)).toBe(400); // fits under the row
  expect(sideTop(850, 300, panel, screen)).toBe(600); // its bottom on the panel's bottom
  expect(sideTop(60, 200, panel, screen)).toBe(100); // its top on the panel's top
  expect(sideTop(500, 950, panel, screen)).toBe(90); // taller than the panel: from its top, kept on screen
});
