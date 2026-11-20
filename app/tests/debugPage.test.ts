import { describe, expect, it } from "vitest";
import { debugBoxes } from "../src/debugBoxes";

describe("the dev debug window's red boxes", () => {
  it("places each area read at the frame's place on screen, in CSS pixels", () => {
    const box = document.createElement("div");
    box.innerHTML = debugBoxes({ origin: [100, 50], areas: [[0, 0, 720, 300], [500, 200, 800, 700]] }, 2);
    const rects = [...box.querySelectorAll<HTMLElement>(".area")].map((a) => [a.style.left, a.style.top, a.style.width, a.style.height]);
    expect(rects).toEqual([["50px", "25px", "360px", "150px"], ["300px", "125px", "400px", "350px"]]);
  });

  it("draws nothing when nothing is read (Dofus not in front) or the window's place is unknown", () => {
    expect(debugBoxes({ origin: [0, 0], areas: [] }, 1)).toBe("");
    expect(debugBoxes({ origin: null, areas: [[0, 0, 10, 10]] }, 1)).toBe("");
  });
});
