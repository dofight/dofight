import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalize, search, SEARCH_LIMIT } from "../src/search";
import { makeSnapshot } from "./fixtures";

describe("search", () => {
  const s = makeSnapshot();

  it("normalizes accents and case", () => {
    expect(normalize("Déchireuse ÉBOURIFAUVE")).toBe("dechireuse ebourifauve");
  });

  it("puts a monster's dungeon first", () => {
    const r = search(s, "dechireuse");
    expect(r[0]).toMatchObject({ kind: "dungeon", label: "Autel de la Déchireuse", dungeonId: 165 });
    expect(r.some((x) => x.kind === "monster" && x.monsterId === 8037)).toBe(true);
  });

  it("lists every dungeon of a monster met in several, the one it heads first (Servitude, 2026-11-19)", () => {
    const t = makeSnapshot();
    const base = t.monsters.get(101)!;
    t.dungeons.set(121, { id: 121, name: "Tempête de l'Eliocalypse", level: 200, monsterIds: [6026, 5955], maps: [] });
    t.dungeons.set(118, { id: 118, name: "Fers de la Tyrannie", level: 200, monsterIds: [5955, 5989], maps: [] });
    t.monsters.set(5955, { ...base, id: 5955, name: "Servitude", boss: true, dungeonIds: [121, 118], subareas: [] });
    const dungeons = search(t, "servitude").filter((x) => x.kind === "dungeon").map((x) => x.dungeonId);
    expect(dungeons).toEqual([118, 121]);
    expect(search(t, "servitude").find((x) => x.monsterId === 5955)!.info).toContain("Fers de la Tyrannie");
  });

  it("puts a monster whose whole name was typed first, before longer names holding it (« Hin », 2026-11-22)", () => {
    const t = makeSnapshot();
    const base = t.monsters.get(101)!;
    // a wanted-poster monster, behind names that hold its three letters near their start, and their dungeons
    t.monsters.set(3848, { ...base, id: 3848, name: "Hin", kind: "wanted", dungeonIds: [], subareas: ["Jour présent"] });
    for (let i = 0; i < 8; i++) {
      t.dungeons.set(900 + i, { id: 900 + i, name: `Donjon ${i}`, level: 50, monsterIds: [910 + i], maps: [] });
      t.monsters.set(910 + i, { ...base, id: 910 + i, name: `Shin ${i}`, dungeonIds: [900 + i] });
    }
    expect(search(t, "hin")[0]).toMatchObject({ kind: "monster", monsterId: 3848 });
  });

  it("tolerates a typo", () => {
    expect(search(s, "dechirreuse").some((x) => x.dungeonId === 165)).toBe(true);
  });

  it("keeps every Bouftou apart with its level range", () => {
    const bouftous = search(s, "bouftou").filter((x) => x.kind === "monster");
    expect(bouftous.map((x) => x.monsterId).sort((a, b) => a! - b!)).toEqual([36, 101, 3332]);
    expect(bouftous.find((x) => x.monsterId === 36)!.info).toContain("Niv. 1–6");
    expect(bouftous.find((x) => x.monsterId === 101)!.info).toContain("Niv. 22–30");
  });

  it("finds a sub-area, with its area as the info (nothing when unknown)", () => {
    expect(search(s, "coin des bouftous")[0]).toMatchObject({ kind: "subarea", subarea: "Coin des Bouftous", info: "" });
    const withAreas = { ...s, areas: new Map([["Coin des Bouftous", "Amakna"]]) };
    expect(search(withAreas, "coin des bouftous")[0]).toMatchObject({ kind: "subarea", info: "Amakna" });
  });

  it("never offers a zone made of a dungeon's rooms: the dungeon is the result (review, 2026-11-23)", () => {
    const inside = { ...s, travel: { zaaps: [], dungeons: {}, zones: {}, dungeonZones: { "Coin des Bouftous": 1 } } };
    expect(search(inside, "coin des bouftous").some((r) => r.kind === "subarea")).toBe(false);
  });

  it("returns nothing for an empty or unknown query", () => {
    expect(search(s, "")).toEqual([]);
    expect(search(s, "   ")).toEqual([]);
    expect(search(s, "zzzz")).toEqual([]);
  });
});

describe("expedition and wanted-poster monsters", () => {
  const s = makeSnapshot();
  s.monsters.set(7837, { ...s.monsters.get(101)!, id: 7837, levelMin: 200, levelMax: 212, dungeonIds: [], subareas: ["Expédition - Cour du Bouftou Royal"], kind: "expedition" });
  s.monsters.set(2901, { ...s.monsters.get(101)!, id: 2901, name: "Bouflouth", dungeonIds: [], subareas: ["Champs de glace"], kind: "wanted" });

  it("labels them and lists the normal monster first", () => {
    const r = search(s, "bouftou").filter((x) => x.kind === "monster");
    const exp = r.find((x) => x.monsterId === 7837)!;
    expect(exp.info).toContain("Expédition");
    expect(r.findIndex((x) => x.monsterId === 101)).toBeLessThan(r.findIndex((x) => x.monsterId === 7837));
    expect(search(s, "bouflouth").find((x) => x.monsterId === 2901)!.info).toContain("Avis de recherche");
  });

  it("labels summons, special monsters and creatures with no place", () => {
    const base = s.monsters.get(101)!;
    s.monsters.set(36, { ...base, id: 36, dungeonIds: [], subareas: [], kind: "summon" });
    s.monsters.set(8072, { ...base, id: 8072, dungeonIds: [], subareas: [], kind: "player_summon" });
    s.monsters.set(9001, { ...base, id: 9001, dungeonIds: [], subareas: [], kind: "special" });
    s.monsters.set(9002, { ...base, id: 9002, dungeonIds: [], subareas: [], kind: "nowhere" });
    const info = (id: number) => search(s, "bouftou", 20).find((x) => x.monsterId === id)!.info;
    expect(info(36)).toContain("Invocation ·");
    expect(info(8072)).toContain("Invocation de joueur");
    expect(info(9001)).toContain("Spécial");
    expect(info(9002)).toContain("Sans sous-zone");
    expect(search(s, "bouftou", 20).filter((x) => x.kind === "monster")[0].monsterId).toBe(101);
  });

  it("gives more than 8 results, up to SEARCH_LIMIT, best first (owner, 2026-11-22: scroll past the first 8)", () => {
    const t = makeSnapshot();
    const base = t.monsters.get(101)!;
    for (let i = 0; i < 60; i++) t.monsters.set(9000 + i, { ...base, id: 9000 + i, name: `Bouftou ${i}`, dungeonIds: [], subareas: [] });
    const r = search(t, "bouftou");
    expect(SEARCH_LIMIT).toBe(30);
    expect(r).toHaveLength(SEARCH_LIMIT);
    expect(search(t, "bouftou", 5)).toHaveLength(5); // the suggestion form's subject keeps its own short list
  });

  it("keeps the results to about 8 rows on screen, the rest scrolls inside the list", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\.results\{[^}]*max-height:[^;}]+;[^}]*overflow-y:auto/);
  });
});

