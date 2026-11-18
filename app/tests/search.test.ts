import { describe, expect, it } from "vitest";
import { normalize, search } from "../src/search";
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
});
