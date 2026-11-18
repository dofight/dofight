import { describe, expect, it } from "vitest";
import { rangeCaption, rangeMarks, sortByReach, spellReach, touchesYou } from "../src/reach";
import { renderMonster } from "../src/render/monster";
import { renderSpellSheet } from "../src/render/spellSheet";
import type { Display, SpellEffect } from "../src/types";
import { monster, spell } from "./fixtures";

const hit = (zone: string | null = null, target: SpellEffect["target"] = "enemies"): SpellEffect =>
  ({ text: "36 à 40 dommages Feu", icon: 1, dispellable: false, target, zone });

// the Floristile's spells (5 PM): a line spell with an area, a melee one, a buff on himself
const pistirage = spell({ id: 1, name: "Pistirage", rangeMin: 1, rangeMax: 8, inLine: true, effects: [hit("cercle 2")] });
const petaclier = spell({ id: 2, name: "Pétaclier", rangeMin: 1, rangeMax: 5, effects: [hit()] });
const nez = spell({ id: 3, name: "Nez Bulleux", rangeMin: 1, rangeMax: 1, lineOfSight: false, effects: [hit("cercle 2")] });
const buff = spell({ id: 4, name: "Racines", rangeMin: 0, rangeMax: 0, effects: [{ ...hit(), text: "+100 Puissance", target: "self" }] });
const summon = spell({ id: 5, name: "Appel", rangeMin: 1, rangeMax: 3, effects: [{ ...hit(), text: "Invoque : Tofu", target: "all" }] });
const floristile = monster({ id: 6320, name: "Floristile", mp: 5, spellIds: [3, 4, 2, 1] });

describe("reach", () => {
  it("adds the PM, the longest range and the area", () => {
    expect(spellReach(pistirage, 5)).toBe(15);
    expect(spellReach(petaclier, 5)).toBe(10);
    expect(spellReach(nez, 5)).toBe(8);
  });

  it("is null for spells that cannot touch you: buffs on himself, summons", () => {
    expect(touchesYou(buff)).toBe(false);
    expect(touchesYou(summon)).toBe(false);
    expect(spellReach(buff, 5)).toBeNull();
  });

  it("covers the whole room for an area over the whole map", () => {
    const quake = spell({ id: 7, name: "Séisme", rangeMin: 0, rangeMax: 0, effects: [hit("toute la carte")] });
    expect(spellReach(quake, 3)).toBe(Infinity);
  });

  it("orders the spells by reach, the ones that cannot touch you last", () => {
    expect(sortByReach([nez, buff, petaclier, pistirage], 5).map((s) => s.name))
      .toEqual(["Pistirage", "Pétaclier", "Nez Bulleux", "Racines"]);
  });

  it("captions the range and marks its shape beyond melee only", () => {
    expect(rangeCaption(pistirage)).toBe("1–8");
    expect(rangeCaption(nez)).toBe("CaC");
    expect(rangeCaption(buff)).toBe("soi");
    expect(rangeMarks(pistirage).map((m) => m.icon)).toEqual(["inLine"]);
    expect(rangeMarks(nez)).toEqual([]); // melee: line and sight do not matter
    const diag = spell({ id: 8, name: "Biais", rangeMin: 2, rangeMax: 6, inDiagonal: true, lineOfSight: false });
    expect(rangeMarks(diag).map((m) => m.icon)).toEqual(["inDiagonal", "noSight"]);
  });
});

describe("reach on screen", () => {
  const show = { details: true, spells: true, spellBadges: false, resistances: false, thumbnails: false, suggest: false,
    tagsDanger: true, tagsTip: true, tagsMechanic: true } as unknown as Display;
  const spells = new Map([pistirage, petaclier, nez, buff].map((s) => [s.id, s]));

  it("shows each spell's range, sorted by reach, and no reach in words", () => {
    const html = renderMonster(floristile, spells, undefined, show, () => null);
    expect(html).not.toContain("Touche");
    const order = [...html.matchAll(/data-spell="(\d+)"/g)].map((m) => Number(m[1]));
    expect(order).toEqual([1, 2, 3, 4]);
    expect(html).toContain('<span class="rng">1–8<span class="mk" title="En ligne"><svg class="ic ic-inLine"');
    expect(html).toContain('<span class="rng">CaC</span>'); // melee: the word, no shape
    expect(html).toContain('class="sp off"'); // the buff on himself
  });

  it("puts the range and the shape at the top of the sheet", () => {
    const sheet = renderSpellSheet(pistirage, () => null);
    expect(sheet).toContain("1–8 PO");
    expect(sheet).toMatch(/<span class="shape warn"><svg class="ic ic-inLine"[^]*?<\/svg>En ligne<\/span>/);
    expect(sheet).toContain("Cercle 2 sur la case ciblée");
    expect(sheet).not.toContain("vous touche");
    const blind = renderSpellSheet(spell({ id: 9, name: "Biais", rangeMin: 2, rangeMax: 6, lineOfSight: false }), () => null);
    expect(blind).toMatch(/ic-noSight[^]*?Sans ligne de vue/);
  });
});
