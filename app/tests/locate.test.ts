import { describe, expect, it } from "vitest";
import { locate } from "../src/screen/locate";
import { makeSnapshot, monster } from "./fixtures";

const s = makeSnapshot();
s.dungeons.set(1, {
  id: 1, name: "Cour du Bouftou Royal", level: 30, monsterIds: [101],
  maps: [
    { id: 10, name: "Cour du Bouftou Royal - Première salle", x: 2, y: -34, boss: false },
    { id: 15, name: "Cour du Bouftou Royal - Cinquième salle", x: 6, y: -34, boss: true },
  ],
});
s.monsters.set(500, monster({ id: 500, name: "Muldo", subareas: ["Bassin des Muldos"] }));
s.monsters.set(501, monster({ id: 501, name: "Dragodinde", subareas: ["Haras de Brâkmar"] }));

const head = (title: string, x: number | null = null, y: number | null = null, cut = false) => ({ title, x, y, cut });

describe("locate", () => {
  it("finds a dungeon room by its name", () => {
    const r = locate(s, head("Cour du Bouftou Royal - Première salle", 2, -34))!;
    expect(r.dungeon?.id).toBe(1);
    expect(r.monsters.map((m) => m.id)).toEqual([101]);
  });

  it("tolerates a misread letter in a dungeon room name", () => {
    expect(locate(s, head("Cour du Bouftou Royai - Premiere salle", 2, -34))?.dungeon?.id).toBe(1);
  });

  it("finds a sub-area between parentheses", () => {
    const r = locate(s, head("Brâkmar (Haras de Brâkmar)", -26, 41))!;
    expect(r.dungeon).toBeNull();
    expect(r.title).toBe("Haras de Brâkmar");
    expect(r.monsters.map((m) => m.id)).toEqual([501]);
  });

  it("accepts a short stretch read all wrong in a long name, not in a short one", () => {
    s.monsters.set(503, monster({ id: 503, name: "Kaniglou", subareas: ["Tronc de l'arbre Hakam"] }));
    s.monsters.set(504, monster({ id: 504, name: "Kwak", subareas: ["Terrdala"] }));
    expect(locate(s, head("Île d'Otomaï (Tronc de Itarbre Hakam)", -52, 17))?.title).toBe("Tronc de l'arbre Hakam");
    expect(locate(s, head("Île (Feudala)"))).toBeNull(); // half the name differs: another place, not a misreading
  });

  it("finds a sub-area despite noise between the parentheses", () => {
    s.monsters.set(502, monster({ id: 502, name: "Bandit", subareas: ["Faubourgs des artisans"] }));
    expect(locate(s, head("Bonta (Faubour3sÂes artisans)"))?.title).toBe("Faubourgs des artisans");
    expect(locate(s, head("Bonta (Faubourrsms artisans)"))).toBeNull(); // 4 of 5 letters wrong: unknown, the room is kept
  });

  it("accepts a single misread letter (« dtOuronigride » for « d'Ouronigride »)", () => {
    s.monsters.set(505, monster({ id: 505, name: "Mansot", subareas: ["Larmes d'Ouronigride"] }));
    expect(locate(s, head("Îllege Frigost (Larmes dtOuronigride)"))?.title).toBe("Larmes d'Ouronigride");
  });

  it("never takes a sub-area that differs by a whole word (a village without monsters)", () => {
    s.monsters.set(504, monster({ id: 504, name: "Dragoeuf", subareas: ["Village des Dragoeufs"] }));
    expect(locate(s, head("Montagne des Koalaks (Village des Éleveurs)"))).toBeNull();
    expect(locate(s, head("Montagne des Koalaks (Village des Dragoeufs)"))?.title).toBe("Village des Dragoeufs");
  });

  it("finds a sub-area from a partly read title", () => {
    expect(locate(s, head("Baie de des Muldos)", 20, 23))?.title).toBe("Bassin des Muldos");
  });

  it("does not guess a sub-area from an area name alone", () => {
    s.monsters.set(503, monster({ id: 503, name: "Wabbit", subareas: ["Souterrains des Wabbits"] }));
    expect(locate(s, head("Île des Wabbits"))).toBeNull();
    expect(locate(s, head("Haras de Brâkmar"))?.title).toBe("Haras de Brâkmar"); // exact sub-area name: fine
  });

  it("never uses a cut title, and returns null for an unknown place", () => {
    expect(locate(s, head("Ile des Wabbits (Laboratoires abandonnés", 31, -15, true))).toBeNull();
    expect(locate(s, head("Plaine de nulle part (Rien du tout)"))).toBeNull();
  });
});

describe("locate by the map coordinates", () => {
  const snow = makeSnapshot();
  snow.monsters.set(600, monster({ id: 600, name: "Ouronigride", subareas: ["Larmes d'Ouronigride"] }));
  snow.monsters.set(601, monster({ id: 601, name: "Gloursaya", subareas: ["Bastion des froides légions"] }));
  snow.places = new Map([["-69,-87", ["Bastion des froides légions", "Larmes d'Ouronigride"]], ["5,5", ["Coin des Bouftous"]]]);

  it("finds the zone a garbled name still shares letters with, among those at its coordinates", () => {
    // read on the snow of Frigost (owner, 2026-11-09): « Frigost (Larmes d'O » lost
    for (const read of ["Île de dtOüronigride)", "Île de dtegronigride)", "Île de dtbüronigride)"]) {
      expect(locate(snow, head(read, -69, -87))?.title).toBe("Larmes d'Ouronigride");
    }
  });

  it("finds the one zone of the area read alone at its coordinates (hovering the map: « (Lac gelé) » not read)", () => {
    const frigost = makeSnapshot();
    frigost.monsters.set(602, monster({ id: 602, name: "Mansot", subareas: ["Lac gelé"] }));
    frigost.monsters.set(603, monster({ id: 603, name: "Kanimate", subareas: ["Village des Kanigs"] }));
    frigost.places = new Map([["-65,-54", ["Lac gelé"]], ["1,1", ["Lac gelé", "Village des Kanigs"]], ["2,2", ["Village des Kanigs"]]]);
    frigost.areas = new Map([["Lac gelé", "Île de Frigost"], ["Village des Kanigs", "Île de Frigost"]]);
    expect(locate(frigost, head("Île de Frigost", -65, -54))?.title).toBe("Lac gelé");
    expect(locate(frigost, head("Île dE Fri.gost", -65, -54))?.title).toBe("Lac gelé");
    // two zones of that area there: which one is unknown
    expect(locate(frigost, head("Île de Frigost", 1, 1))).toBeNull();
    // a zone read in parentheses (with no monsters, unknown here) is not replaced by another zone of its area
    expect(locate(frigost, head("Île de Frigost (Village côtier)", 2, 2))).toBeNull();
    // another area
    expect(locate(frigost, head("Amakna", -65, -54))).toBeNull();
  });

  it("finds the zone whose name the garbled one is near, among every place at its coordinates", () => {
    // read on the snow of Frigost (owner, 2026-11-19)
    const frigost = makeSnapshot();
    frigost.monsters.set(610, monster({ id: 610, name: "Salbatroce", subareas: ["Roc des Salbatroces"] }));
    frigost.monsters.set(611, monster({ id: 611, name: "Mansot", subareas: ["Port de givre"] }));
    frigost.monsters.set(612, monster({ id: 612, name: "Kanimate", subareas: ["Village des Kanigs"] }));
    frigost.places = new Map([["-83,-58", ["Roc des Salbatroces"]], ["-81,-39", ["Port de givre"]], ["2,2", ["Village des Kanigs"]], ["3,3", ["Village côtier", "Port de givre"]]]);
    frigost.areas = new Map([["Roc des Salbatroces", "Île de Frigost"], ["Port de givre", "Île de Frigost"], ["Village des Kanigs", "Île de Frigost"]]);
    expect(locate(frigost, head("Île de Frigost J(Ro'c aes Sia. na erbues}", -83, -58))?.title).toBe("Roc des Salbatroces");
    expect(locate(frigost, head("Île de Frigost (Porti hé rglUre)", -81, -39))?.title).toBe("Port de givre");
    // too far from the zone there (another place, unknown here), or nearest to a place with no monsters
    expect(locate(frigost, head("Île de Frigost (Village côtier)", 2, 2))).toBeNull();
    expect(locate(frigost, head("Île de Frigost (Village côtier)", 3, 3))).toBeNull();
    // the area read is another one
    expect(locate(frigost, head("Amakna (Porti hé rglUre)", -81, -39))).toBeNull();
  });

  it("finds nothing when the text supports no zone there, or without coordinates", () => {
    expect(locate(snow, head("Havre-Sac Eliocalypse", -69, -87))).toBeNull();
    expect(locate(snow, head("Île de dtOüronigride)"))).toBeNull();
    expect(locate(snow, head("Île de dtOüronigride)", 5, 5))).toBeNull();
  });
});

describe("a place with no monsters (owner, 2026-11-20)", () => {
  const e = makeSnapshot();
  e.monsters = s.monsters;
  e.emptyAt = new Map([["-17,0", ["Village des Éleveurs"]]]);

  it("is a room with no monster when its whole name and its coordinates agree", () => {
    expect(locate(e, head("Montagne des Koalaks (Village des E leveurs)", -17, 0))).toEqual({
      dungeon: null, title: "Village des Éleveurs", monsters: [], empty: true,
    });
  });

  it("is never guessed: no coordinates, other coordinates, a cut header, another name, no parentheses", () => {
    expect(locate(e, head("Montagne des Koalaks (Village des Éleveurs)"))).toBeNull();
    expect(locate(e, head("Montagne des Koalaks (Village des Éleveurs)", -10, 5))).toBeNull();
    expect(locate(e, head("Montagne des Koalaks (Village des Éleveurs)", -17, 0, true))).toBeNull();
    expect(locate(e, head("Montagne des Koalaks (Port de Madrestam)", -17, 0))).toBeNull(); // another place, not a misreading
    expect(locate(e, head("Village des Éleveurs", -17, 0))).toBeNull();
  });

  it("a zone with monsters always wins", () => {
    expect(locate(e, head("Brâkmar (Haras de Brâkmar)", -17, 0))?.title).toBe("Haras de Brâkmar");
  });
});
