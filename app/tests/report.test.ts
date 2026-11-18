import { describe, expect, it } from "vitest";
import { buildReport, changedSettings, cooldownLeft, COOLDOWN_MS } from "../src/report";
import { DEFAULTS } from "../src/settings";
import { monster } from "./fixtures";

const base = {
  kind: "missingBadge" as const,
  text: "  Il retire 2 PM en zone  ",
  monster: { ...monster({ id: 101, name: "Bouftou" }), kind: "normal" as const },
  room: "Cour du Bouftou Royal",
  attachState: true,
  reading: { zoneRead: "Cour du Bouftou Royal - Première salle", located: "Cour du Bouftou Royal", fight: "fight", front: true },
  settings: { ...DEFAULTS, spells: false, referenceWindow: "Perso-Test" },
  version: "0.1.0",
};

describe("report", () => {
  it("names the monster and attaches what Dofight read, never the character", () => {
    const body = buildReport(base);
    const e = body.embeds[0];
    expect(e.title).toBe("Missing badge · Bouftou");
    expect(e.description).toBe("Il retire 2 PM en zone");
    expect(e.fields.map((f) => f.name)).toEqual(["Monster", "Room or zone shown", "Read on screen", "Fight", "Settings"]);
    expect(e.fields[0].value).toBe("Bouftou (#101, normal)");
    expect(e.fields[2].value).toBe("Cour du Bouftou Royal - Première salle → Cour du Bouftou Royal");
    expect(JSON.stringify(body)).not.toContain("Perso-Test");
    expect(body.allowed_mentions.parse).toEqual([]);
    expect(e.footer.text).toBe("Dofight 0.1.0");
  });

  it("names the dungeon, zone or expedition the suggestion is about", () => {
    const e = buildReport({ ...base, monster: null, subject: { kind: "dungeon", label: "Antre du Korriandre" } }).embeds[0];
    expect(e.title).toBe("Missing badge · Antre du Korriandre");
    expect(e.fields[0]).toMatchObject({ name: "Subject", value: "Antre du Korriandre (dungeon)" });
  });

  it("sends only the text when the player unticks the state", () => {
    const e = buildReport({ ...base, attachState: false, monster: null, room: null }).embeds[0];
    expect(e.title).toBe("Missing badge");
    expect(e.fields).toEqual([]);
  });

  it("lists only the settings changed from the defaults", () => {
    expect(changedSettings({ ...DEFAULTS, referenceWindow: "X" })).toBe("defaults");
    expect(changedSettings({ ...DEFAULTS, spells: false, opacity: 0.8 })).toBe("spells=false, opacity=0.8");
  });

  it("allows one report per minute", () => {
    expect(cooldownLeft(null, 5)).toBe(0);
    expect(cooldownLeft(1000, 1000 + 10_000)).toBe(COOLDOWN_MS - 10_000);
    expect(cooldownLeft(1000, 1000 + COOLDOWN_MS)).toBe(0);
  });
});
