import { editDistance } from "../search";
import { plain, type OcrLine } from "./ocr";

/** The map header in the top-left corner: « Zone (Sous-zone) » or « Donjon - Salle », then « x, y [- Niveau N] ». */
export interface Header {
  title: string;
  x: number | null;
  y: number | null;
  /** The title was cut (by the turn order in a fight): never use it to change the room. */
  cut: boolean;
}

const CORNER = { maxX: 600, maxY: 160 };
// « -26, 41 » ; OCR often reads the comma as a dot and dashes as long dashes
const COORDS = /^\s*([-–—]?\d{1,3})\s*[.,]\s*([-–—]?\d{1,3})(?:\s|$|-)/;

const toInt = (s: string) => Number(s.replace(/[–—]/, "-"));

// buttons that sit above the header in some screens: the world map's « Fermer la carte », the Havre-Sac's name; never
// the title (with the map open, the header below shows the map under the mouse: the list follows the hover)
const BUTTONS = ["fermer la carte", "close the map", "close map", "havre-sac", "havre sac", "havenbag"];
const isButton = (text: string) => {
  const t = plain(text).replace(/[^a-z -]/g, "").trim();
  return BUTTONS.some((b) => editDistance(t, b) <= 3);
};

export function parseHeader(lines: OcrLine[]): Header | null {
  const corner = lines.filter((l) => l.x < CORNER.maxX && l.y < CORNER.maxY && l.text.trim() && !isButton(l.text)).sort((a, b) => a.y - b.y);
  if (!corner.length) return null;
  const coordsIndex = corner.findIndex((l) => COORDS.test(l.text));
  const coordsLine = coordsIndex >= 0 ? corner[coordsIndex] : null;
  // the title is the line just above the coordinates (or the first line of the corner)
  const above = coordsLine ? corner.filter((l) => l.y < coordsLine.y - 4) : corner;
  const titleLine = coordsLine ? above[above.length - 1] : corner[0];
  if (!titleLine) return null;
  // the OCR may split one title into several pieces on the same row (« Baie de Sufokia (Bassin des Muld » + « os) »)
  const mid = (l: OcrLine) => l.y + l.h / 2;
  const row = above
    .concat(coordsLine ? [] : corner.slice(1))
    .filter((l) => Math.abs(mid(l) - mid(titleLine)) < Math.max(l.h, titleLine.h) * 0.6)
    .sort((a, b) => a.x - b.x);
  // pieces that touch are one word cut in two (no space); farther apart they are separate words
  const pieces = [...new Set([titleLine, ...row])].sort((a, b) => a.x - b.x);
  const title = pieces
    .map((l, i) => (i === 0 || l.x - (pieces[i - 1].x + pieces[i - 1].w) < l.h * 0.4 ? "" : " ") + l.text.trim())
    .join("");
  const m = coordsLine ? COORDS.exec(coordsLine.text) : null;
  // cut by the turn order, or a fragment whose start was lost: never used to change the room
  const cut = (title.includes("(") && !title.includes(")")) || title.replace(/[^\p{L}]/gu, "").length < 4;
  return { title, x: m ? toInt(m[1]) : null, y: m ? toInt(m[2]) : null, cut };
}
