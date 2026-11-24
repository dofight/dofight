import { expect, it } from "vitest";
import { attachedSides, sidesAfterReload, resizedByPlayer } from "../src/sides";

it("keeps « peek » when no sheet was detached, or before its page answers", () => {
  expect(sidesAfterReload([])).toEqual({ side: "peek", detached: [] });
  expect(sidesAfterReload([{ label: "peek", detached: false }])).toEqual({ side: "peek", detached: [] });
});

it("sends the sheets to the window made after a detach, and keeps the detached one the player's (Ctrl+R, 2026-11-22)", () => {
  const r = sidesAfterReload([{ label: "peek", detached: true }, { label: "peek-2", detached: false }, { label: "peek-1", detached: true }]);
  expect(r).toEqual({ side: "peek-2", detached: ["peek", "peek-1"] });
});

it("asks for a new window when every side window was detached", () => {
  expect(sidesAfterReload([{ label: "peek", detached: true }])).toEqual({ side: null, detached: ["peek"] });
});

it("does not send the sheets to « peek » once the player closed it (detached then ✕, then a reload, 2026-11-22)", () => {
  expect(sidesAfterReload([{ label: "peek-1", detached: false }], false)).toEqual({ side: "peek-1", detached: [] });
  expect(sidesAfterReload([], false)).toEqual({ side: null, detached: [] });
});

it("lists the side windows still beside the panel after a reload, to hide them (a pinned sheet left on screen, Fable)", () => {
  expect(attachedSides([{ label: "peek", detached: true }, { label: "peek-2", detached: false }, { label: "peek-1", detached: false }])).toEqual(["peek-1", "peek-2"]);
  expect(attachedSides([])).toEqual([]);
});

it("takes a pinned sheet's new size for the player's resize only past rounding (resized beside the panel = detached, owner 2026-11-24)", () => {
  const base = { width: 640, height: 400 };
  expect(resizedByPlayer(base, { width: 640, height: 400 })).toBe(false); // the panel's own size, arriving late
  expect(resizedByPlayer(base, { width: 641, height: 398 })).toBe(false); // scaling rounds a pixel or two
  expect(resizedByPlayer(base, { width: 650, height: 400 })).toBe(true); // an edge pulled
  expect(resizedByPlayer(base, { width: 640, height: 380 })).toBe(true);
});
