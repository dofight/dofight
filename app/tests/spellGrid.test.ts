import { describe, expect, it } from "vitest";
import { rangeCaption, rangeSpan } from "../src/reach";
import { renderMonster } from "../src/render/monster";
import { renderSpellSheet } from "../src/render/spellSheet";
import { GRID_CAP, spellGrid } from "../src/render/spellGrid";
import type { Display, SpellEffect } from "../src/types";
import { monster, spell } from "./fixtures";

const hit = (zone: string | null = null): SpellEffect =>
  ({ text: "36 à 40 dommages Feu", icon: 1, dispellable: false, target: "enemies", zone });

/** The drawing as cells: how many of each kind, the grid's radius, and the values written past its edge. */
function read(html: string) {
  const div = document.createElement("div");
  div.innerHTML = html;
  const cells = [...div.querySelectorAll("polygon.c")];
  const count = (cls: string) => cells.filter((c) => c.classList.contains(cls)).length;
  return {
    radius: (Math.sqrt(cells.length) - 1) / 2,
    range: count("rg"),
    area: count("ar"),
    caster: count("me"),
    targets: div.querySelectorAll("polygon.c.t").length,
    labels: [...div.querySelectorAll("text")].map((t) => t.textContent),
  };
}

// real spells from the game data (the mockup's examples, owner, 2026-11-26)
const scaraforce = spell({ id: 1, name: "Scaraforce", rangeMin: 1, rangeMax: 2, effects: [hit("croix 1")] });
const cadeau = spell({ id: 2, name: "Cadeau explosif", rangeMin: 0, rangeMax: 0, effects: [hit("cercle 2 1")] });
const hairpay = spell({ id: 3, name: "Hairpay", rangeMin: 1, rangeMax: 6, inLine: true, effects: [hit()] });
const bombardement = spell({ id: 4, name: "Bombardement", rangeMin: 6, rangeMax: 63, lineOfSight: false, effects: [hit("cercle 5")] });
const cawotte = spell({ id: 5, name: "Cawotte Pawalysante", rangeMin: 1, rangeMax: 12, effects: [hit("cercle 2")] });
const ralliement = spell({ id: 6, name: "Ralliement de Guerre", rangeMin: 1, rangeMax: 1, effects: [hit("toute la carte")] });
const tchaiste = spell({ id: 7, name: "Tchaiste", rangeMin: 0, rangeMax: 0, effects: [hit("cercle-inversé 63 4")] });
const choune = spell({ id: 8, name: "Choune", rangeMin: 16, rangeMax: 20, effects: [hit("croix 1 1")] });
const aspiration = spell({ id: 9, name: "Aspiration Gourmande", rangeMin: 0, rangeMax: 0, effects: [hit("étoile 15")] });

describe("spell grid", () => {
  it("draws the caster, the range in blue and the area around the target", () => {
    const g = read(spellGrid(scaraforce, "big"));
    expect(g.caster).toBe(1);
    expect(g.range).toBe(12); // every cell 1 or 2 away
    expect(g.area).toBe(5); // a cross of 1 around the target
    expect(g.targets).toBe(1);
    expect(g.labels).toEqual([]);
  });

  it("tints the caster's own cell as the target when the spell is cast on itself", () => {
    const g = read(spellGrid(cadeau, "big"));
    expect(g.targets).toBe(1);
    expect(g.range).toBe(0);
    expect(g.area).toBe(12); // rings 1 to 2, the caster spared
  });

  it("draws a single cell for a spell without an area, in a line only", () => {
    const g = read(spellGrid(hairpay, "big"));
    expect(g.range).toBe(24); // 4 lines of 6
    expect(g.area).toBe(1);
  });

  it(`never goes past ${GRID_CAP} cells around the caster`, () => {
    for (const sp of [bombardement, cawotte, ralliement, tchaiste, choune, aspiration]) {
      expect(read(spellGrid(sp, "big")).radius, sp.name).toBeLessThanOrEqual(GRID_CAP);
    }
  });

  it("writes the real range past the edge, so the cells drawn are not taken for it", () => {
    expect(read(spellGrid(cawotte, "big")).labels).toEqual(["→ 12"]);
    expect(read(spellGrid(bombardement, "big")).labels).toEqual(["→ 6–∞"]);
    // even the closest target is past the edge: drawn there, its real range written
    expect(read(spellGrid(choune, "big")).labels).toEqual(["→ 16–20"]);
  });

  it("never draws the target where the spell cannot be cast", () => {
    // Bombardement (6 to ∞, a circle of 5): the target at 6, not closer to fit the circle, cut at the edge
    for (const sp of [scaraforce, hairpay, bombardement, cawotte, ralliement]) {
      const div = document.createElement("div");
      div.innerHTML = spellGrid(sp, "big");
      expect(div.querySelector("polygon.c.t")!.classList.contains("rg"), sp.name).toBe(true);
    }
    const div = document.createElement("div");
    div.innerHTML = spellGrid(bombardement, "big");
    expect(div.querySelector("polygon.c.t")!.getAttribute("data-d")).toBe("6");
  });

  it("fills the whole grid for a whole-map zone and marks it endless", () => {
    const g = read(spellGrid(ralliement, "big"));
    expect(g.radius).toBe(GRID_CAP);
    expect(g.area).toBe((2 * GRID_CAP + 1) ** 2 - 1); // all but the caster
    expect(g.labels).toEqual(["→ ∞"]);
  });

  it("draws an endless cone or line to the edge, not the whole map (Razepoutine, the Kolosso)", () => {
    const razepoutine = spell({ id: 11, name: "Razepoutine", rangeMin: 1, rangeMax: 1, lineOfSight: false, effects: [hit("cône 63")] });
    const g = read(spellGrid(razepoutine, "big"));
    expect(g.radius).toBe(GRID_CAP);
    expect(g.area).toBeLessThan((2 * GRID_CAP + 1) ** 2 / 2); // a cone, not every cell
    expect(g.area).toBeGreaterThan(GRID_CAP * 2);
    expect(g.labels).toEqual(["→ ∞"]);
    // a circle of 63 does cover the map
    const wide = spell({ id: 12, name: "Large", rangeMin: 0, rangeMax: 0, effects: [hit("cercle 63")] });
    expect(read(spellGrid(wide, "big")).area).toBe((2 * GRID_CAP + 1) ** 2 - 1);
  });

  it("aims a diagonal-only spell along its diagonal, on a cell it can be cast on (Schnaps du Dopeul)", () => {
    const schnaps = spell({ id: 13, name: "Schnaps du Dopeul", rangeMin: 2, rangeMax: 7, inDiagonal: true, effects: [hit()] });
    const div = document.createElement("div");
    div.innerHTML = spellGrid(schnaps, "big");
    const target = div.querySelector("polygon.c.t")!;
    expect(target.classList.contains("rg")).toBe(true);
    expect(Number(target.getAttribute("data-d")) % 2).toBe(0); // (a, a): an even distance
  });

  it("spares the middle of an inverted square given by its first number (La défense c'est l'attaque)", () => {
    const defense = spell({ id: 14, name: "La défense c'est l'attaque", rangeMin: 0, rangeMax: 0, effects: [hit("carré-inversé 4")] });
    const g = read(spellGrid(defense, "big"));
    expect(g.area).toBe((2 * g.radius + 1) ** 2 - 49); // the 7 × 7 square around the caster stays plain
  });

  it("keeps room for an endless line aimed far, so its shape shows (Frappe purificatrice)", () => {
    const frappe = spell({ id: 15, name: "Frappe purificatrice", rangeMin: 1, rangeMax: 8, effects: [hit("ligne 63")] });
    const g = read(spellGrid(frappe, "big"));
    expect(g.area).toBeGreaterThan(3);
    expect(g.labels).toEqual(["→ ∞"]);
  });

  it("draws a line from the caster out to its length (Souffle Incendiaire)", () => {
    const souffle = spell({ id: 16, name: "Souffle Incendiaire", rangeMin: 1, rangeMax: 10, effects: [hit("ligne-lanceur 1 10")] });
    const g = read(spellGrid(souffle, "big"));
    expect(g.area).toBe(g.radius); // cells 1 out to the grid's edge
    expect(g.labels).toEqual(["→ 10", "→ 10"]); // the range, then the line, both past the edge
  });

  it("spares the middle of an inverted zone and colours the rest", () => {
    const g = read(spellGrid(tchaiste, "big"));
    expect(g.area).toBe((2 * g.radius + 1) ** 2 - 25); // the 25 cells within 3 of the caster stay plain
    expect(g.labels).toEqual(["→ ∞"]);
  });

  it("writes a zone around the caster that goes past the edge in red", () => {
    const g = read(spellGrid(aspiration, "big"));
    expect(g.labels).toEqual(["→ 15"]);
  });
});

describe("spell grid in the panel", () => {
  it("shows an endless range as ∞", () => {
    expect(rangeCaption(bombardement)).toBe("6–∞");
    expect(rangeCaption(spell({ id: 10, name: "Loin", rangeMin: 1, rangeMax: 63 }))).toBe("∞");
    expect(rangeSpan(spell({ id: 10, name: "Loin", rangeMin: 1, rangeMax: 63 }))).toBe("∞"); // the sheet says the same
    expect(rangeSpan(cawotte)).toBe("1–12");
    expect(rangeSpan(bombardement)).toBe("6–∞");
  });

  it("draws the grid on the spell's sheet, with its legend", () => {
    const div = document.createElement("div");
    div.innerHTML = renderSpellSheet(scaraforce, () => null);
    expect(div.querySelector(".pgrid svg")).not.toBeNull();
    expect(div.querySelector(".plegend")?.textContent).toContain("Zone touchée");
    expect(div.querySelector(".plegend .sw.tg.self")).toBeNull();
  });

  it("names the area only when there is one: a single cell needs no pill", () => {
    const div = document.createElement("div");
    div.innerHTML = renderSpellSheet(hairpay, () => null);
    expect(div.querySelector(".pshape")?.textContent).not.toContain("Case ciblée");
    div.innerHTML = renderSpellSheet(scaraforce, () => null);
    expect(div.querySelector(".pshape .zonep")?.textContent).toBe("Croix 1 sur la case ciblée");
  });

  it("gives the target's swatch the caster's colour when the spell is cast on itself", () => {
    const div = document.createElement("div");
    div.innerHTML = renderSpellSheet(cadeau, () => null);
    expect(div.querySelector(".plegend .sw.tg.self")).not.toBeNull();
  });
});

describe("zone thumbnails on the effect rows", () => {
  const e = (text: string, zone: string | null, target: SpellEffect["target"] = "enemies"): SpellEffect =>
    ({ text, icon: 1, dispellable: false, target, zone });
  // the Gorgouille's Lourde Coopération: a cross of 1, a swap on the target alone, a cross of 2, a self effect
  const lourde = spell({ id: 2933, name: "Lourde Coopération", rangeMin: 1, rangeMax: 63, effects: [
    e("31 à 40 dommages Air", "croix 1"), e("Échange de positions", null), e("Repousse de 3 cases", "croix 2"),
    e("Enlève l'état Gorgouillis", null, "self")] });
  const sheet = (sp: ReturnType<typeof spell>) => {
    const div = document.createElement("div");
    div.innerHTML = renderSpellSheet(sp, () => null);
    return div;
  };

  it("shows one on every effect row when the effects have different zones", () => {
    const rows = [...sheet(lourde).querySelectorAll(".eff")];
    expect(rows.map((r) => !!r.querySelector(".zthumb"))).toEqual([true, true, true, true]);
    const red = (r: Element) => r.querySelectorAll(".zthumb .ar").length;
    expect(red(rows[0])).toBe(5); // the cross of 1, its centre lighter but red
    expect(red(rows[2])).toBe(9); // the cross of 2
    expect(red(rows[1])).toBe(1); // the swap: the targeted cell alone
    expect(rows[3].querySelectorAll(".zthumb .me").length).toBe(1); // the self effect: the caster's yellow
  });

  it("shows none when every effect shares one zone, or only a self effect differs", () => {
    const emeraude = spell({ id: 3552, name: "Rayon Émeraude", rangeMin: 1, rangeMax: 63, effects: [
      e("État Insoignable (2 tours)", "croix 3"), e("101 à 150 dommages Feu", "croix 3")] });
    expect(sheet(emeraude).querySelector(".zthumb")).toBeNull();
    const buffed = spell({ id: 13, name: "Coup et bonus", rangeMin: 1, rangeMax: 4, effects: [
      e("50 dommages Feu", "cercle 1"), e("+100 Puissance", null, "self")] });
    expect(sheet(buffed).querySelector(".zthumb")).toBeNull();
  });

  it("labels a zone past the thumbnail's edge with its real size, ∞ when endless", () => {
    const leuko = spell({ id: 4144, name: "Hyperleukocytine", rangeMin: 0, rangeMax: 0, effects: [
      e("Durée des effets : -4", "cercle-inversé 63 7"), e("État Pacifiste (1 tour)", "cercle 6")] });
    const labels = [...sheet(leuko).querySelectorAll(".zthumb text")].map((t) => t.textContent);
    expect(labels).toEqual(["≥7", "6"]);
  });
});

describe("a monster's spells as a list", () => {
  const show = { details: true, spells: true, spellBadges: true, resistances: false, thumbnails: false, suggest: false,
    tagsDanger: true, tagsTip: true, tagsMechanic: true } as unknown as Display;
  const hitting = Array.from({ length: 9 }, (_, i) => spell({ id: 100 + i, name: `Sort ${i}`, rangeMin: 1, rangeMax: 9 - i, effects: [hit()] }));
  const buff = spell({ id: 200, name: "Bonus", rangeMin: 0, rangeMax: 0, effects: [{ ...hit(), text: "+100 Puissance", target: "self" }] });
  const spells = new Map([...hitting, buff].map((s) => [s.id, s]));
  const card = () => {
    const div = document.createElement("div");
    div.innerHTML = renderMonster(monster({ id: 7, name: "Beaucoup", mp: 3, spellIds: [...spells.keys()] }), spells, undefined, show, () => null);
    return div;
  };

  it("shows the six furthest reaching as rows, with their names, the rest folded", () => {
    const div = card();
    const top = [...div.querySelectorAll(":scope .mob > .spells > .sp, :scope > div > .spells > .sp")].map((b) => b.querySelector(".spn")?.textContent);
    expect(top).toEqual(["Sort 0", "Sort 1", "Sort 2", "Sort 3", "Sort 4", "Sort 5"]);
    const more = div.querySelector("details.spmore")!;
    expect(more.querySelector("summary")!.textContent).toBe("+ 4 autres sorts");
    expect(more.querySelectorAll(".sp").length).toBe(4);
  });

  it("lists the spells that cannot touch you as rows too, last and greyed: a summon or a state can be the fight", () => {
    const div = card();
    const rows = [...div.querySelectorAll(".sp")];
    const last = rows[rows.length - 1];
    expect(last.getAttribute("data-spell")).toBe("200");
    expect(last.classList.contains("off")).toBe(true);
    expect(last.querySelector(".spn")?.textContent).toBe("Bonus");
  });
});
