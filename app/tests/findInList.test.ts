// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { highlight, matches, monsterText, spellsMatching } from "../src/findInList";
import type { Spell, Vocabulary } from "../src/types";
import { monster } from "./fixtures";

const spell = (id: number, name: string, effects: string[]): Spell => ({
  id, name, ap: 3, rangeMin: 1, rangeMax: 1, editableRange: false, lineOfSight: true, inLine: false, perTurn: 1, perTarget: 1,
  cooldown: 0, initialCooldown: 0, critical: 0, categories: [], conditions: [],
  effects: effects.map((text) => ({ text, icon: 0, dispellable: true })),
});
const spells = new Map([[1, spell(1, "Sécrétion", ["-3 PM", "-3 Portée"])], [2, spell(2, "Danse répulsive", ["Pousse de 3 cases"])]]);
const vocab: Vocabulary = { tags: { dispels_you: { category: "danger", label: "Désenvoûte", labelEn: "Dispels you", param: "optional", icon: "" } } } as unknown as Vocabulary;
const bacterrib = monster({ id: 3825, name: "Bacterrib", spellIds: [1, 2] });
const summary = { tags: [{ id: "dispels_you", param: "-1 tour de bonus au-delà de 5 PO" }], detail: "Ses sorts ne se lancent qu'entre 6 et 10 PO." };

describe("find in the list", () => {
  it("matches a monster by its name, badges, detail, spell names and effects, accents and case ignored", () => {
    const text = monsterText(bacterrib, summary, spells, vocab);
    for (const q of ["bacterrib", "DESENVOUTE", "tour de bonus", "entre 6 et 10", "secretion", "portée", "pousse"]) expect(matches(text, q)).toBe(true);
    expect(matches(text, "invoque")).toBe(false);
  });

  it("names the spells that hold the text, for their buttons", () => {
    expect(spellsMatching(bacterrib, spells, "pousse")).toEqual([2]);
    expect(spellsMatching(bacterrib, spells, "PM")).toEqual([1]);
    expect(spellsMatching(bacterrib, spells, " ")).toEqual([]);
  });

  it("highlights the matches in the text shown, accents ignored", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span>Désenvoûte · Sécrétion</span><span class=\"sr-only\">Sécrétion</span>";
    highlight(root, "secretion");
    expect(root.querySelectorAll("mark.hit")).toHaveLength(1);
    expect(root.querySelector("mark")!.textContent).toBe("Sécrétion");
    expect(root.textContent).toBe("Désenvoûte · SécrétionSécrétion");
  });
});
