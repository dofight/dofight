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
  });

  it("matches cut and misread names", () => {
    expect(matchName("Volkorne indigo sauvag", index)?.name).toBe("Volkorne indigo sauvage");
    expect(matchName("olkorne pourpre sauvage", index)?.name).toBe("Volkorne pourpre sauvage");
    expect(matchName("Volkorne ébène sauvagi", index)?.name).toBe("Volkorne ébène sauvage");
    expect(matchName("103 466", index)).toBeNull();
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
