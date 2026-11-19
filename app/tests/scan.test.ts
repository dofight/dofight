import { expect, it } from "vitest";
import { scanOutcome } from "../src/screen/scan";
import type { Room } from "../src/room";

const a: Room = { dungeon: null, title: "Bassin des Muldos", monsters: [] };
const b: Room = { dungeon: null, title: "Haras de Brâkmar", monsters: [] };

it("keeps the zone only when both readings agree", () => {
  expect(scanOutcome([a, { ...a }], [true, true])).toEqual({ room: a });
});

it("calls disagreeing readings a failed reading, worth another try", () => {
  expect(scanOutcome([a, b], [true, true])).toEqual({ problem: "failed" });
  expect(scanOutcome([a, null], [true, true])).toEqual({ problem: "failed" });
});

it("tells a map with no known monsters from a missing header", () => {
  expect(scanOutcome([null, null], [true, true])).toEqual({ problem: "unknown" });
  expect(scanOutcome([null, null], [true, false])).toEqual({ problem: "unknown" });
  expect(scanOutcome([null, null], [false, false])).toEqual({ problem: "noHeader" });
});
