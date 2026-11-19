import { describe, expect, it } from "vitest";
import lines from "./fixtures/ocr-lines.json";
import { readFight } from "../src/screen/fight";
import { parseHeader } from "../src/screen/header";

const L = lines as Record<string, { text: string; x: number; y: number; w: number; h: number }[]>;

describe("parseHeader (real Windows OCR lines)", () => {
  it("skips the world map's « Fermer la carte » button: the header below is the map under the mouse", () => {
    const at = (text: string, y: number) => ({ text, x: 8, y, w: 220, h: 18 });
    const h = parseHeader([at("FERMER LA CAI?T'E", 8), at("Landes de Sidimote (Gisgoul)", 40), at("-16,19 • Niveau 170", 66)]);
    expect(h).toMatchObject({ title: "Landes de Sidimote (Gisgoul)", x: -16, y: 19 });
    expect(parseHeader([at("HAVRE -SAC", 8)])).toBeNull();
  });

  it("reads a zone header with its coordinates", () => {
    expect(parseHeader(L.out_of_fight_3_7)).toMatchObject({ title: "Brâkmar (Haras de Brâkmar)" });
    expect(parseHeader(L.combat_end_full_3_7)).toMatchObject({ x: -26, y: 41 });
  });

  it("reads a dungeon room header", () => {
    expect(parseHeader(L.dungeon_bouftou)).toMatchObject({ title: "Cour du Bouftou Royal - Première salle", x: 2, y: -34 });
  });

  it("keeps a title even when the coordinates are partly misread", () => {
    expect(parseHeader(L.fight_prep_muldos)).toMatchObject({ title: "Baie de des Muldos)", x: 20, y: 23 });
  });

  it("never invents coordinates from a misread line", () => {
    const h = parseHeader(L.out_of_fight_3_7)!; // OCR read « -26. a 1 » for « -26, 41 »
    expect(h.x === null || (h.x === -26 && h.y === 41)).toBe(true);
  });

  it("joins a title the OCR split into pieces on one row", () => {
    const h = parseHeader([
      { text: "Baie de Sufokia (Bassin des Muld", x: 10, y: 20, w: 260, h: 16 },
      { text: "os)", x: 274, y: 21, w: 24, h: 15 },
      { text: "20, 23 - Niveau 60", x: 10, y: 42, w: 140, h: 14 },
    ])!;
    expect(h).toMatchObject({ title: "Baie de Sufokia (Bassin des Muldos)", x: 20, y: 23, cut: false });
  });

  it("never uses a lone fragment as a zone name", () => {
    expect(parseHeader([
      { text: "os)", x: 274, y: 21, w: 24, h: 15 },
      { text: "20, 23 - Niveau 60", x: 10, y: 42, w: 140, h: 14 },
    ])).toMatchObject({ cut: true });
  });

  it("takes a brace or a bracket at the end for the closing parenthesis (the snow of Frigost, 2026-11-19)", () => {
    const at = (text: string, y: number) => ({ text, x: 8, y, w: 260, h: 18 });
    const h = parseHeader([at("Île de Frigost J(Ro'c aes Sia. na erbues}", 40), at("-83, -58", 66)]);
    expect(h).toMatchObject({ x: -83, y: -58, cut: false });
    expect(parseHeader([at("Île de Frigost (Roc des", 40), at("-83, -58", 66)])).toMatchObject({ cut: true });
  });

  it("flags a title cut by the turn order", () => {
    expect(parseHeader(L.turn1)).toMatchObject({ cut: true });
  });

  it("ignores text outside the top-left corner and returns null without a header", () => {
    expect(parseHeader([{ text: "Cour du Bouftou Royal - Première salle", x: 900, y: 40, w: 300, h: 15 }])).toBeNull();
    expect(parseHeader([])).toBeNull();
  });
});

describe("readFight: the icon bar only", () => {
  it("follows the bar (any game language)", () => {
    expect(readFight("fight", false)).toBe("fight");
    expect(readFight("calm", false)).toBe("none");
  });
  it("ends a fight as soon as the bar is back to calm", () => {
    expect(readFight("calm", true)).toBe("end");
  });
  it("keeps the last state while the bar is covered or folded", () => {
    expect(readFight("unknown", true)).toBe("fight");
    expect(readFight(null, false)).toBe("none");
  });
});

