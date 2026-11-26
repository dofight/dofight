import { describe, expect, it } from "vitest";
import { achievementsOf, renderAchievementsSheet } from "../src/render/achievements";
import { loadSnapshot } from "../src/load";
import { englishView, loadEnglish } from "../src/english";
import { renderTrip } from "../src/travel";
import type { Achievement } from "../src/types";
import { makeSnapshot } from "./fixtures";

const reine: Achievement[] = [
  { id: 1114, kind: "Premier", boss: "Reine des Voleurs", challenge: "Premier", rule: "Reine des Voleurs doit être achevé en premier.", icon: 3 },
  { id: 1115, kind: "Collant", boss: "Reine des Voleurs", challenge: "Collant", rule: "Les combattants alliés doivent finir leur tour sur une cellule adjacente.", icon: 37 },
  { id: 1116, kind: "Trio", boss: "Reine des Voleurs", challenge: "Trio", rule: "Vaincre tous les monstres avec 3 personnages maximum et en moins de 80 tours.", icon: 10024 },
  { id: 6241, kind: "Spécial", boss: "Reine des Voleurs", challenge: "La vie est une chausse-trappe", rule: "Les alliés ne doivent pas être soignés par le biais des Bonbombes <bleues>.", icon: 977 },
];

describe("the achievements sheet", () => {
  it("lists each achievement in order, with its icon, kind and rule", () => {
    const box = document.createElement("div");
    box.innerHTML = renderAchievementsSheet(reine);
    const rows = [...box.querySelectorAll("li")];
    // the kind alone: the challenge's own name (« La vie est une chausse-trappe ») made the column too wide (owner)
    expect(rows.map((li) => li.querySelector("b")?.textContent)).toEqual(["Premier", "Collant", "Trio", "Spécial"]);
    // a table: icon, kind, rule, each a cell of the row
    expect([...rows[0].children].map((c) => c.tagName)).toEqual(["IMG", "B", "SPAN"]);
    expect(rows[0].querySelector("img")?.getAttribute("src")).toBe("/icons/challenges/3.png");
    expect(rows[3].textContent).toContain("Bonbombes <bleues>."); // escaped, shown as text
    expect(box.querySelector(".achv-sheet > b")?.textContent).toBe("Succès");
  });

  it("groups the rows by boss when the dungeon has several", () => {
    const two = [{ ...reine[0], boss: "Guerre" }, { ...reine[1], boss: "Misère" }, { ...reine[2], boss: "Guerre" }];
    const box = document.createElement("div");
    box.innerHTML = renderAchievementsSheet(two);
    expect([...box.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Guerre", "Misère"]);
    expect(box.querySelectorAll("ul")[0].querySelectorAll("li").length).toBe(2);
  });

  it("has no boss name for a single boss (owner, 2026-11-25)", () => {
    const box = document.createElement("div");
    box.innerHTML = renderAchievementsSheet(reine);
    expect(box.querySelectorAll("h3").length).toBe(0);
  });

  it("has no heading for rows with no boss name", () => {
    const box = document.createElement("div");
    box.innerHTML = renderAchievementsSheet([{ ...reine[0], boss: "" }]);
    expect(box.querySelectorAll("h3").length).toBe(0);
    expect(box.querySelectorAll("li").length).toBe(1);
  });
});

describe("the « Succès » button", () => {
  it("is no longer in the trip line (owner, 2026-11-25: it sits by the level)", () => {
    expect(renderTrip(null, { special: true })).not.toContain("achv");
  });

  it("is decided by the dungeon's list: none for a dungeon without one, or no dungeon", () => {
    const s = makeSnapshot();
    s.achievements = new Map([[83, reine]]);
    expect(achievementsOf(s, 83)).toHaveLength(4);
    expect(achievementsOf(s, 1)).toEqual([]);
    expect(achievementsOf(s, null)).toEqual([]);
    expect(achievementsOf(makeSnapshot(), 83)).toEqual([]);
  });
});

describe("loading the achievements", () => {
  const base: Record<string, unknown> = {
    "snapshot/dungeons.json": [],
    "snapshot/monsters.json": [],
    "snapshot/spells.json": [],
  };
  const from = (files: Record<string, unknown>) => async (p: string) => {
    if (!(p in files)) throw new Error("404");
    return files[p];
  };

  it("reads data/snapshot/achievements.json keyed by dungeon id", async () => {
    const s = await loadSnapshot(from({ ...base, "snapshot/achievements.json": { "83": reine } }));
    expect(s.achievements?.get(83)?.length).toBe(4);
  });

  it("reads the anomaly bosses' achievements keyed by monster id", async () => {
    const s = await loadSnapshot(from({ ...base, "snapshot/boss-achievements.json": { "5663": [reine[0]] } }));
    expect(s.bossAchievements?.get(5663)?.length).toBe(1);
  });

  it("does without it", async () => {
    const s = await loadSnapshot(from(base));
    expect(s.achievements?.size).toBe(0);
  });

  it("shows the English game text in English", async () => {
    const fr = makeSnapshot();
    fr.achievements = new Map([[83, reine]]);
    const en = await loadEnglish(from({
      "snapshot/en/monsters.json": [], "snapshot/en/dungeons.json": [], "snapshot/en/spells.json": [],
      "snapshot/en/achievements.json": { "83": [{ ...reine[0], kind: "First", challenge: "First", rule: "Queen of Thieves must be finished off first." }] },
    }), fr);
    expect(englishView(fr, en).achievements?.get(83)?.[0].rule).toBe("Queen of Thieves must be finished off first.");
  });
});
