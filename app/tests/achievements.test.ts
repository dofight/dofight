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
    expect(rows.map((li) => li.querySelector("b")?.textContent)).toEqual(["Premier", "Collant", "Trio", "Spécial · La vie est une chausse-trappe"]);
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

  it("has no boss headings for a single boss", () => {
    const box = document.createElement("div");
    box.innerHTML = renderAchievementsSheet(reine);
    expect(box.querySelectorAll("h3").length).toBe(0);
  });
});

describe("the « Succès » button", () => {
  it("comes in the trip line, after « Comment y aller »", () => {
    const html = renderTrip(null, { special: true, achievements: true });
    expect(html.indexOf('class="access"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="achv"')).toBeGreaterThan(html.indexOf('class="access"'));
    expect(html).toContain("/icons/hud/achievements.png");
    expect(html).toContain("Succès");
  });

  it("is there with no known position and nothing special", () => {
    expect(renderTrip(null, { achievements: true })).toContain('class="achv"');
    expect(renderTrip({ to: { x: 1, y: 2, world: 9 }, zaap: null }, { achievements: true })).toContain('class="achv"');
  });

  it("is absent without achievements", () => {
    expect(renderTrip(null, {})).not.toContain("achv");
    expect(renderTrip({ to: { x: 1, y: 2, world: 9 }, zaap: null })).not.toContain("achv");
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
