import { describe, expect, it } from "vitest";
import { DEFAULTS, type Settings } from "../src/settings";
import { exportSettings, importSettings } from "../src/settingsTransfer";

const mine: Settings = { ...DEFAULTS, theme: "bonta", textSize: 110, autoFight: false, referenceWindow: "Personnage", songe: true };

describe("settings export / import (owner, 2026-11-18)", () => {
  it("exports the settings as text, without the character's name nor the moment's Songe", () => {
    const text = exportSettings(mine);
    expect(text).not.toContain("Personnage");
    const data = JSON.parse(text);
    expect(data).toMatchObject({ dofight: "settings", version: 1 });
    expect(data.settings).toMatchObject({ theme: "bonta", textSize: 110, autoFight: false });
    expect(data.settings).not.toHaveProperty("referenceWindow");
    expect(data.settings).not.toHaveProperty("songe");
  });

  it("imports them back over the current settings, keeping this PC's character and Songe", () => {
    const here: Settings = { ...DEFAULTS, referenceWindow: "Autre", songe: false };
    const out = importSettings(exportSettings(mine), here);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.settings).toMatchObject({ theme: "bonta", textSize: 110, autoFight: false, referenceWindow: "Autre", songe: false });
  });

  it("checks every value as when loading (an invalid one keeps its default)", () => {
    const text = JSON.stringify({ dofight: "settings", version: 1, settings: { textSize: "huge", opacity: 7, lang: "de", unknown: 1 } });
    const out = importSettings(text, DEFAULTS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.settings.textSize).toBe(100);
    expect(out.settings.opacity).toBe(1);
    expect(out.settings.lang).toBe("fr");
    expect(out.settings).not.toHaveProperty("unknown");
  });

  it("refuses what is not Dofight's settings", () => {
    expect(importSettings("bonjour", DEFAULTS)).toEqual({ ok: false });
    expect(importSettings('{"theme":"bonta"}', DEFAULTS)).toEqual({ ok: false });
    expect(importSettings('{"dofight":"settings","version":1,"settings":[1]}', DEFAULTS)).toEqual({ ok: false });
    expect(importSettings("", DEFAULTS)).toEqual({ ok: false });
  });

  it("accepts the text with spaces or line breaks around it (a paste from a message)", () => {
    expect(importSettings(`\n  ${exportSettings(mine)}  \n`, DEFAULTS).ok).toBe(true);
  });
});
