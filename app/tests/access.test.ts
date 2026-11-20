import { describe, expect, it } from "vitest";
import { accessOf, isSpecial, type Access } from "../src/access";

const q = (id: number, fr: string) => ({ quest: { id, fr, en: `${fr} EN`, level: 35, start: { x: 1, y: 2 } } });
const access: Access = {
  areas: {
    "Île d'Otomaï": { reqs: [q(231, "Le nouveau monde"), q(232, "L'île des naufragés")], en: "Otomai Island" },
    Osavora: { reqs: [], dimension: true },
  },
  dungeons: {
    "84": { area: "Île d'Otomaï", level: 190, key: { fr: "Clef A", en: "Key A" }, reqs: [{ other: { fr: "a", en: "b" } }], guide: "https://g" },
    "1": { area: "Astrub", level: 30, key: { fr: "Clef B", en: "Key B" }, reqs: [] },
    "93": { area: "Osavora", level: 190, key: { fr: "Clef D", en: "Key D" }, offKeyring: true, reqs: [] },
  },
};
const areas = new Map([["Forêt de Moon", "Île de Moon"], ["Jungle obscure", "Île d'Otomaï"]]);

describe("a place's access", () => {
  it("a dungeon: its level, key, its area's requirements and its own", () => {
    expect(accessOf(access, areas, 84, "Ventre de la Baleine")).toEqual({
      level: 190, key: { fr: "Clef A", en: "Key A" }, offKeyring: false, areaName: "Île d'Otomaï", areaEn: "Otomai Island", dimension: false,
      areaReqs: access.areas["Île d'Otomaï"].reqs, ownReqs: [{ other: { fr: "a", en: "b" } }], guide: "https://g",
    });
  });

  it("a dimension's dungeon says so, and its key off the keyring", () => {
    const pa = accessOf(access, areas, 93, "x")!;
    expect(pa.dimension).toBe(true);
    expect(pa.offKeyring).toBe(true);
  });

  it("a zone: only its area's requirements, no level or key", () => {
    expect(accessOf(access, areas, null, "Jungle obscure")).toEqual({
      level: null, key: null, offKeyring: false, areaName: "Île d'Otomaï", areaEn: "Otomai Island", dimension: false,
      areaReqs: access.areas["Île d'Otomaï"].reqs, ownReqs: [], guide: null,
    });
  });

  it("nothing known: null", () => {
    expect(accessOf(access, areas, 999, "x")).toBeNull();
    expect(accessOf(access, areas, null, "Forêt de Moon")).toBeNull(); // its area has nothing
    expect(accessOf(access, areas, null, "Nulle part")).toBeNull();
    expect(accessOf(undefined, areas, 84, "x")).toBeNull();
  });
});

describe("what makes a place special", () => {
  const spot = { x: 0, y: 0, world: 1 };
  it("the key and the level alone do not", () => {
    expect(isSpecial(accessOf(access, areas, 1, "Cour"), spot)).toBe(false);
  });
  it("a key off the keyring does (dimensions, crafted entry items)", () => {
    expect(isSpecial(accessOf(access, areas, 93, "x"), spot)).toBe(true);
  });
  it("its area's requirements do", () => {
    expect(isSpecial(accessOf(access, areas, null, "Jungle obscure"), spot)).toBe(true);
  });
  it("a written route does, even with nothing in the access data", () => {
    expect(isSpecial(null, { ...spot, route: ["/zaap 1 2"] })).toBe(true);
    expect(isSpecial(null, { ...spot, route: [] })).toBe(false);
    expect(isSpecial(null, null)).toBe(false);
  });
});
