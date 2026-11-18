import { describe, expect, it } from "vitest";
import { DEFAULTS, loadSettings, saveSettings } from "../src/settings";

const store = (value: string | null) => ({ getItem: () => value });

describe("settings", () => {
  it("defaults: level, HP, AP and MP shown, like the resistances", () => {
    expect(DEFAULTS.spells).toBe(true);
    expect(DEFAULTS.tagsMechanic).toBe(true);
    expect(DEFAULTS.details).toBe(true);
    expect(DEFAULTS.resistances).toBe(true);
    expect(DEFAULTS.preview).toBe(true);
    expect(DEFAULTS.expandAll).toBe(false);
    expect(DEFAULTS).toMatchObject({ opacity: 1, autoFight: true, showWanted: true, hideWhenAway: false, showSpecial: false, referenceWindow: null });
  });

  it("an empty store gives the defaults", () => {
    expect(loadSettings(store(null))).toEqual(DEFAULTS);
  });

  it("text size: 100 % by default, one of 90, 100 or 110 % (the nearest)", () => {
    expect(DEFAULTS.textSize).toBe(100);
    expect(loadSettings(store('{"textSize":110}')).textSize).toBe(110);
    expect(loadSettings(store('{"textSize":500}')).textSize).toBe(110);
    expect(loadSettings(store('{"textSize":10}')).textSize).toBe(90);
    expect(loadSettings(store('{"textSize":104}')).textSize).toBe(100);
    expect(loadSettings(store('{"textSize":"big"}')).textSize).toBe(100);
  });

  it("bad JSON gives the defaults", () => {
    expect(loadSettings(store("{not json"))).toEqual(DEFAULTS);
  });

  it("keeps known keys, drops unknown ones", () => {
    const s = loadSettings(store('{"spells":false,"bogus":1}'));
    expect(s.spells).toBe(false);
    expect("bogus" in s).toBe(false);
  });

  it("keeps the old « monstres de quête » choice for the special monsters", () => {
    expect(loadSettings(store('{"showQuest":true}')).showSpecial).toBe(true);
    expect(loadSettings(store('{"showQuest":true,"showSpecial":false}')).showSpecial).toBe(false);
  });

  it("ignores values of the wrong type, clamps the opacity, and drops settings that no longer exist", () => {
    expect(loadSettings(store('{"opacity":"half"}')).opacity).toBe(1);
    expect(loadSettings(store('{"opacity":7}')).opacity).toBe(1);
    expect(loadSettings(store('{"lang":"de"}')).lang).toBe("fr");
    expect("width" in loadSettings(store('{"width":400,"side":"left"}'))).toBe(false);
  });

  it("saves under dofight.settings", () => {
    const saved: Record<string, string> = {};
    saveSettings({ setItem: (k: string, v: string) => (saved[k] = v) }, { ...DEFAULTS, spells: false });
    expect(JSON.parse(saved["dofight.settings"]).spells).toBe(false);
  });
});

describe("updateSettings", () => {
  it("applies a patch on top of what is saved now, not on a stale copy", async () => {
    const { updateSettings } = await import("../src/settings");
    const data: Record<string, string> = {};
    const store = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => (data[k] = v) };
    updateSettings(store, { spells: false }); // window A
    const s = updateSettings(store, { opacity: 0.5 }); // window B, never saw A's change
    expect(s.spells).toBe(false);
    expect(s.opacity).toBe(0.5);
    expect(JSON.parse(data["dofight.settings"]).spells).toBe(false);
  });
});

it("allows a fully see-through background", async () => {
  const { loadSettings } = await import("../src/settings");
  expect(loadSettings({ getItem: () => JSON.stringify({ opacity: 0 }) }).opacity).toBe(0);
  expect(loadSettings({ getItem: () => JSON.stringify({ opacity: -1 }) }).opacity).toBe(0);
});
