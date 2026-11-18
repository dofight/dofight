import { describe, expect, it } from "vitest";
import { initialState, step, type Action, type DirectorState, type Reading } from "../src/screen/director";
import { DEFAULTS } from "../src/settings";
import type { Room } from "../src/room";

const roomA: Room = { dungeon: null, title: "Bassin des Muldos", monsters: [] };
const roomB: Room = { dungeon: null, title: "Haras de Brâkmar", monsters: [] };
const read = (p: Partial<Reading>): Reading => ({ front: true, room: null, fight: "none", ...p });

// most rules are about the automatic opening, which is off by default
const AUTO = { ...DEFAULTS, autoFight: true };

function run(readings: Reading[], settings = AUTO, start: DirectorState = initialState()) {
  let state = start;
  const log: Action[][] = [];
  for (const r of readings) {
    const out = step(state, r, settings);
    state = out.state;
    log.push(out.actions);
  }
  return { state, log };
}

const types = (actions: Action[]) => actions.map((a) => a.type);

describe("director", () => {
  it("loads the room read out of fight, once", () => {
    const { log } = run([read({ room: roomA }), read({ room: roomA }), read({ room: roomB }), read({ room: roomB })]);
    expect(log[0]).toContainEqual({ type: "loadRoom", room: roomA });
    expect(types(log[1])).not.toContain("loadRoom");
    expect(types(log[2])).not.toContain("loadRoom"); // a new room must be read twice in a row
    expect(log[3]).toContainEqual({ type: "loadRoom", room: roomB });
  });

  it("ignores a room read on a single frame", () => {
    const { log } = run([read({ room: roomA }), read({ room: roomB }), read({ room: roomA }), read({ room: roomA })]);
    expect(log.slice(1).flat().filter((a) => a.type === "loadRoom")).toEqual([]);
  });

  it("does not load rooms when « fromHeader » is off", () => {
    const { log } = run([read({ room: roomA })], { ...DEFAULTS, fromHeader: false });
    expect(types(log[0])).not.toContain("loadRoom");
  });

  it("opens the overlay when a fight starts and closes it when it ends", () => {
    const { log } = run([read({ room: roomA }), read({ fight: "fight" }), read({ fight: "fight" }), read({ fight: "end" }), read({})]);
    expect(types(log[1])).toContain("show");
    expect(types(log[2])).not.toContain("show");
    expect(types(log[3])).toContain("hide");
  });

  it("does not close when a single reading misses the fight buttons at the start", () => {
    const { log } = run([read({ fight: "fight" }), read({ fight: "none" }), read({ fight: "fight" }), read({ fight: "fight" })]);
    expect(types(log[0])).toContain("show");
    expect(log.slice(1).flat().map((a) => a.type)).not.toContain("hide");
  });

  it("closes after a few readings without any fight sign, even without the end banner", () => {
    const { log } = run([read({ fight: "fight" }), read({ fight: "none" }), read({ fight: "none" }), read({ fight: "none" })]);
    expect(types(log[2])).not.toContain("hide");
    expect(types(log[3])).toContain("hide");
  });

  it("with timed readings, waits a few seconds without any fight sign before closing", () => {
    const at = (ms: number, fight: Reading["fight"]) => read({ fight, at: ms });
    const quick = run([at(0, "fight"), at(300, "none"), at(600, "none"), at(900, "none"), at(1200, "none")]);
    expect(quick.log.flat().map((a) => a.type)).not.toContain("hide");
    const { log } = run([at(0, "fight"), at(300, "none"), at(600, "none"), at(900, "none"), at(4400, "none")]);
    expect(types(log[4])).toContain("hide");
  });

  it("keeps the room read before the fight when the header is cut during it", () => {
    const { log } = run([read({ room: roomA }), read({ fight: "fight", room: null })]);
    expect(types(log[1])).not.toContain("loadRoom");
  });

  it("with the automatic opening off, neither opens nor closes the overlay", () => {
    const { log } = run([read({ fight: "fight" }), read({ fight: "end" })], { ...DEFAULTS, autoFight: false });
    expect(types(log[0])).not.toContain("show");
    expect(types(log[1])).not.toContain("hide");
  });

  it("does not reopen in a fight the player hid it in, but does at the next fight", () => {
    let { state } = run([read({ fight: "fight" })]);
    state = { ...state, ...step(state, read({ fight: "fight" }), AUTO).state, hiddenByPlayer: true };
    const again = step(state, read({ fight: "fight" }), AUTO);
    expect(types(again.actions)).not.toContain("show");
    const { log } = run([read({ fight: "end" }), read({}), read({ fight: "fight" })], AUTO, again.state);
    expect(types(log[2])).toContain("show");
  });

  it("does not close an overlay the player opened by hand", () => {
    const opened = { ...initialState(), openedByPlayer: true };
    const { log } = run([read({ fight: "fight" }), read({ fight: "end" })], DEFAULTS, opened);
    expect(types(log[1])).not.toContain("hide");
  });

  it("keeps the overlay open in a fight while Dofight itself has the focus (nothing read)", () => {
    const { log, state } = run([read({ fight: "fight" }), read({ fight: "none", seen: false }), read({ fight: "none", seen: false })]);
    expect(log.slice(1).flat().map((a) => a.type)).not.toContain("hide");
    expect(state.inFight).toBe(true);
  });

  it("stays visible when Dofus is not in front, by default", () => {
    const { log } = run([read({ fight: "fight" }), read({ front: false, fight: "fight" }), read({ front: true, fight: "fight" })]);
    expect(types(log[1])).not.toContain("hideAll");
    expect(types(log[2])).not.toContain("restoreAll");
  });

  it("with the option, hides everything when Dofus is not in front, and restores it after", () => {
    const { log } = run([read({ fight: "fight" }), read({ front: false, fight: "fight" }), read({ front: true, fight: "fight" })], { ...DEFAULTS, hideWhenAway: true });
    expect(types(log[1])).toEqual(expect.arrayContaining(["hideAll"]));
    expect(types(log[2])).toEqual(expect.arrayContaining(["restoreAll"]));
  });
});
