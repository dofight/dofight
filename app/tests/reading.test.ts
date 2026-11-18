import { describe, expect, it } from "vitest";
import { capturing, READING, readingPatch } from "../src/reading";
import { DEFAULTS, loadSettings, type Settings } from "../src/settings";

const allOff: Settings = { ...DEFAULTS, fromHeader: false, autoSonge: false, autoFight: false, hideWhenAway: false, songe: false };

describe("« Lecture de l'écran »", () => {
  it("is a stored switch, on by default; it does not follow the options", () => {
    expect(DEFAULTS.reading).toBe(true);
    expect(allOff.reading).toBe(true); // the four options off: the switch stays on
  });

  it("captures only when the switch is on and something uses the reading", () => {
    expect(capturing(DEFAULTS)).toBe(true);
    expect(capturing(allOff)).toBe(false);
    for (const flag of READING) expect(capturing({ ...allOff, [flag]: true })).toBe(true);
    expect(capturing({ ...allOff, songe: true })).toBe(true);
    expect(capturing({ ...DEFAULTS, songe: true, reading: false })).toBe(false);
  });

  it("off: the options and Songe go off, the ones on are remembered", () => {
    const s = { ...DEFAULTS, autoSonge: false, hideWhenAway: true, songe: true };
    expect(readingPatch(s, false)).toEqual({ fromHeader: false, autoFight: false, autoSonge: false, hideWhenAway: false, songe: false, readingBefore: ["fromHeader", "autoFight", "hideWhenAway"], reading: false });
  });

  it("on: exactly the remembered options come back (possibly none), Songe stays off", () => {
    const s = { ...allOff, reading: false, readingBefore: ["autoFight"] as Settings["readingBefore"] };
    expect(readingPatch(s, true)).toEqual({ fromHeader: false, autoFight: true, autoSonge: false, hideWhenAway: false, readingBefore: [], reading: true });
    expect(readingPatch({ ...allOff, reading: false }, true)).toEqual({ fromHeader: false, autoFight: false, autoSonge: false, hideWhenAway: false, readingBefore: [], reading: true });
  });

  it("loads the remembered options only when they are reading options, and only while the switch is off", () => {
    const load = (v: object) => loadSettings({ getItem: () => JSON.stringify(v) });
    expect(DEFAULTS.readingBefore).toEqual([]);
    expect(load({ reading: false, readingBefore: ["autoFight", "expandAll", 3, "autoFight"] }).readingBefore).toEqual(["autoFight"]);
    expect(load({ reading: false, readingBefore: "autoFight" }).readingBefore).toEqual([]);
    expect(load({ reading: true, readingBefore: ["autoFight"] }).readingBefore).toEqual([]);
    expect(load({}).reading).toBe(true);
  });
});
