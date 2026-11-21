import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { groupLevel, lineName, matchName, nameIndex, readGroups } from "../src/screen/songe";
import type { Monster } from "../src/types";
import fixture from "./fixtures/tooltip-lines.json";

// the real monster list: names as the game writes them
const monsters: Monster[] = JSON.parse(readFileSync(resolve(__dirname, "../../data/snapshot/monsters.json"), "utf-8"));
const index = nameIndex(monsters);
const names = (g: { monsters: { monster: Monster; count: number }[] }) => g.monsters.map((x) => `${x.monster.name}×${x.count}`);

describe("songe: group tooltips", () => {
  it("reads the header despite misread letters", () => {
    expect(groupLevel("Niveau 132")).toBe(132);
    expect(groupLevel("Niueau 468")).toBe(468);
    expect(groupLevel("Level 200")).toBe(200);
    expect(groupLevel("Volkorne ébène sauvage (68)")).toBeUndefined();
  });

  it("drops the level whatever bracket the OCR read", () => {
    expect(lineName("Volkorne pourpre sauvage (68}")).toBe("Volkorne pourpre sauvage");
    expect(lineName("Volkorne orchidée sauvage {70)")).toBe("Volkorne orchidée sauvage");
    expect(lineName("Volkorne ébène sauvage")).toBe("Volkorne ébène sauvage");
    // the level read without its brackets, on a dark map (owner's log, 2026-11-21)
    expect(lineName("Volkorne indigo sauvage (bbi")).toBe("Volkorne indigo sauvage");
    expect(lineName("Volkorne orchidee souvage 4641")).toBe("Volkorne orchidee souvage");
    expect(lineName("Volkorne pourpre souvoge 6621")).toBe("Volkorne pourpre souvoge");
    // a name whose own last word is short keeps it: no digit and no bracket in it
    expect(lineName("Tofu malade")).toBe("Tofu malade");
  });

  it("matches cut and misread names", () => {
    expect(matchName("Volkorne indigo sauvag", index)?.name).toBe("Volkorne indigo sauvage");
    expect(matchName("olkorne pourpre sauvage", index)?.name).toBe("Volkorne pourpre sauvage");
    expect(matchName("Volkorne ébène sauvagi", index)?.name).toBe("Volkorne ébène sauvage");
    expect(matchName("103 466", index)).toBeNull();
  });

  it("matches a name read with lookalike letters and digits (Apple Vision on small text)", () => {
    // Cyrillic К, і and п in a Latin word: the glyphs are the same
    expect(matchName("Кurookіп", index)?.name).toBe("Kurookin");
    // « Ino-Naru » with three letters read as digits, and a Cyrillic о and г on top (owner's log, 2026-11-21)
    expect(matchName("Іn9-Nог4", index)?.name).toBe("Ino-Naru");
    expect(matchName("1n0-Nor4", index)?.name).toBe("Ino-Naru");
    // the experience lines of a tooltip stand for no monster and must stay unmatched
    expect(matchName("155 538 7P", index)).toBeNull();
    expect(matchName("38 881 1P", index)).toBeNull();
    expect(matchName("262 550 HP Groupe", index)).toBeNull();
  });

  it("refuses the words of a tooltip that are no monster", () => {
    // « Groupe » is one letter from « Groute », a real monster
    expect(matchName("Groupe", index)).toBeNull();
    expect(matchName("Niveau", index)).toBeNull();
    expect(matchName("Level", index)).toBeNull();
  });

  it("asks more of a short name than of a long one", () => {
    // one wrong letter on a four-letter name is still a match
    expect(matchName("7ofu", index)?.name).toBe("Tofu");
    // two are not: « P1ou » was read as « Fou » and « Lvl » as « Lie »
    expect(matchName("P1ou", index)).toBeNull();
    expect(matchName("Lvl", index)).toBeNull();
  });

  it("looks in the zone's own monsters first, then in the whole game", () => {
    // « Craqueleur » and « Croqueleur » are both real and one letter apart: a name read short sits between them
    const zone = nameIndex(monsters.filter((m) => m.name === "Craqueleur"));
    expect(matchName("Crqueleur", zone, index)?.name).toBe("Craqueleur");
    // and the whole game is still there for a monster the zone does not hold
    expect(matchName("Croqueleur", zone, index)?.name).toBe("Croqueleur");
  });

  it("reads a group whose levels lost their brackets (owner's dark map, 2026-11-21)", () => {
    const lines = [
      { x: 742, y: 460, w: 223, h: 20, text: "Niveau 192" },
      { x: 742, y: 482, w: 223, h: 20, text: "155 538 7P" },
      { x: 742, y: 504, w: 223, h: 20, text: "38 881 1P Groupe" },
      { x: 742, y: 526, w: 223, h: 20, text: "Volkorne indigo sauvage (bbi" },
      { x: 742, y: 548, w: 223, h: 20, text: "Volkorne orchidee souvage 4641" },
      { x: 742, y: 570, w: 223, h: 20, text: "Volkorne pourpre souvoge 6621" },
    ];
    const groups = readGroups(lines, index);
    expect(groups).toHaveLength(1);
    expect(groups[0].level).toBe(192);
    expect(names(groups[0])).toEqual([
      "Volkorne indigo sauvage×1",
      "Volkorne orchidée sauvage×1",
      "Volkorne pourpre sauvage×1",
    ]);
  });

  it("reads three groups side by side, each with its own monsters (real frame)", () => {
    const groups = readGroups(fixture.three_groups, index);
    expect(groups.map((g) => g.level)).toEqual([468, 200, 132]);
    expect(names(groups[1])).toEqual(["Volkorne ébène sauvage×2", "Volkorne pourpre sauvage×1"]);
    expect(names(groups[2])).toEqual(["Volkorne indigo sauvage×1", "Volkorne ébène sauvage×1"]);
    expect(groups[0].monsters.reduce((n, x) => n + x.count, 0)).toBe(7);
  });

  it("reads a group of eight (real frame)", () => {
    const groups = readGroups(fixture.two_groups, index);
    const big = groups.find((g) => g.level === 526)!;
    expect(big.monsters.reduce((n, x) => n + x.count, 0)).toBe(8);
    expect(names(big)).toEqual(["Volkorne orchidée sauvage×2", "Volkorne indigo sauvage×4", "Volkorne pourpre sauvage×2"]);
  });
});
