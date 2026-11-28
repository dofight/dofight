import { afterEach, describe, expect, it } from "vitest";
import { setPlatform } from "../src/i18n";
import { pointerInPage, rectInUnits, toUnits, unitsPerPx } from "../src/screenUnits";

afterEach(() => setPlatform("windows"));

describe("screen units", () => {
  it("are the screen's pixels on Windows", () => {
    setPlatform("windows");
    expect(toUnits(1609, 2)).toBe(1609);
    expect(unitsPerPx(1.5)).toBe(1.5);
    expect(rectInUnits({ x: 10, y: 20, width: 300, height: 800 }, 2)).toEqual({ x: 10, y: 20, width: 300, height: 800 });
  });

  it("are points on a Mac, whatever screen a value was measured on", () => {
    setPlatform("macos");
    // the panel on the Retina screen at (-1300, 50) points, 240 × 600: Tauri says pixels at 2
    expect(rectInUnits({ x: -2600, y: 100, width: 480, height: 1200 }, 2)).toEqual({ x: -1300, y: 50, width: 240, height: 600 });
    expect(toUnits(839, 1)).toBe(839);
    expect(unitsPerPx(2)).toBe(1);
  });
});

describe("the pointer over the panel", () => {
  it("is found on Windows as before (pixels everywhere)", () => {
    setPlatform("windows");
    expect(pointerInPage({ x: 150, y: 260 }, 1.5, { x: 100, y: 200 }, { width: 300, height: 600 }, 1.5)).toEqual({ x: 100 / 3, y: 40 });
    expect(pointerInPage({ x: 50, y: 260 }, 1.5, { x: 100, y: 200 }, { width: 300, height: 600 }, 1.5)).toBeNull();
  });

  // the owner's Mac: a 1x main display, the panel on the Retina screen beside it. Tauri gives the pointer at the main
  // display's scale (1) and the panel at its own (2): compared as they came, the pointer at (-1200, 300) points was
  // read at -1200 pixels against a panel from -2600 to -2120, never over it (2026-11-28)
  it("is found on a Mac with the panel on a screen of another scale than the main display", () => {
    setPlatform("macos");
    const at = pointerInPage({ x: -1200, y: 300 }, 1, { x: -2600, y: 100 }, { width: 480, height: 1200 }, 2);
    expect(at).toEqual({ x: 100, y: 250 });
    expect(pointerInPage({ x: -1400, y: 300 }, 1, { x: -2600, y: 100 }, { width: 480, height: 1200 }, 2)).toBeNull();
  });
});
