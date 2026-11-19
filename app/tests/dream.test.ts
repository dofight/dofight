import { expect, it } from "vitest";
import { inDream } from "../src/screen/dream";

const line = (text: string, y = 20) => ({ text, x: 10, y, w: 200, h: 18 });

it("recognises a Songe's header, in English and in French", () => {
  expect(inDream([line("Dream Thoughts"), line("Bracket I · Depth 0", 44), line("Dream 1", 68)])).toBe(true);
  // the English client's header, seen in the game on 2026-11-19
  expect(inDream([line("Dream Thoughts"), line("Bracket I · Depth 1", 44), line("Nightmare 1", 68)])).toBe(true);
  expect(inDream([line("Pensées du Songe"), line("Palier I · Profondeur 3", 44)])).toBe(true);
  expect(inDream([line("Pensées oniriques"), line("Palier I · Profondeur 1", 44), line("Songe 1", 68)])).toBe(true);
  // the OCR's usual slips
  expect(inDream([line("Palier I • Profondeur l", 44)])).toBe(true);
  expect(inDream([line("PalierI-Profondeur26", 44)])).toBe(true);
  expect(inDream([line("Pa1ier V", 44)])).toBe(true);
});

it("is not fooled by an ordinary header or text elsewhere on screen", () => {
  expect(inDream([line("Astrub (Tainela)"), line("1, -34 - Level 20", 44)])).toBe(false);
  expect(inDream([line("Entrance to the Well of Dreams"), line("0, 0", 44)])).toBe(false);
  expect(inDream([line("Entrée du Puits des Songes"), line("0, 0", 44)])).toBe(false);
  expect(inDream([{ ...line("Depth 3"), x: 900 }])).toBe(false); // not in the header's corner
});
