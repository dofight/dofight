/** Is the player inside a Songe (the Infinite Dreams), from the map header in the top-left corner?
 *
 * Outside, the header is the zone name and the map coordinates (« Astrub (Tainela) », « 1, -34 »). Inside a Songe it
 * has no coordinates but the dream's lines: « Pensées oniriques », « Palier I · Profondeur 1 », « Songe 1 » on a French
 * client, « Dream Thoughts », « Bracket I · Depth 0 », « Dream 1 » on an English one. The first line changes with the
 * floor; « Palier » (I to V) and « Profondeur » (up to 26) are always there, so those words decide, read loosely (the
 * OCR may say « Profondeur l », « Pa1ier », glue the words…). */
import { editDistance } from "../search";
import type { OcrLine } from "./ocr";

const CORNER = { maxX: 600, maxY: 240 }; // the header's corner (a little taller than for the zone: three lines)

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// « Palier »/« Bracket » and « Profondeur »/« Depth »: one of each pair is enough (a word may be cut or misread)
const WORDS = ["palier", "profondeur", "bracket", "depth"];

function isDreamWord(word: string): boolean {
  return WORDS.some((w) => editDistance(word, w) <= (w.length >= 8 ? 2 : 1));
}

export function inDream(lines: OcrLine[]): boolean {
  return lines.some(
    (l) => l.x < CORNER.maxX && l.y < CORNER.maxY && fold(l.text).split(/[^a-z0-9]+/).some((word) => word.length >= 4 && isDreamWord(word.replace(/[0-9]+$/, ""))),
  );
}
