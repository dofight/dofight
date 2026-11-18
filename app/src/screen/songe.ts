/** « Songe » mode: the monster groups the player hovers on the map, read from their tooltips.
 *
 * A group tooltip is a dark box: « Niveau 132 » (« Level 132 » on an English client), the XP, then one line per
 * monster, « Volkorne indigo sauvage (66) ». The Rust side reads the light-grey monster lines under each header it
 * finds (see screen.rs read_tooltips). The OCR misreads a little: « Niueau », « (68} », « {70) », a cut end
 * (« Volkorne indigo sauvag »), a lost first letter (« olkorne »). */
import { editDistance, normalize } from "../search";
import type { Monster } from "../types";
import type { OcrLine } from "./ocr";

export interface HoveredGroup {
  level: number | null;
  /** In tooltip order; a monster met twice in the group has count 2. */
  monsters: { monster: Monster; count: number }[];
}

const BELOW = 220; // px: the tooltip lines sit under the header (up to 8 monsters and the XP line)
const ACROSS = 130; // px: a line's centre is this close to its header's centre (tooltips side by side are wider apart)

/** « Niveau 132 », « Niueau 468 », « Level 200 »: a word close to Niveau/Level then a number. */
export function groupLevel(text: string): number | null | undefined {
  const words = text.trim().split(/\s+/);
  if (words.length !== 2) return undefined;
  const word = normalize(words[0]);
  if (editDistance(word, "niveau") > 2 && editDistance(word, "level") > 2) return undefined;
  const digits = words[1].replace(/\D/g, "");
  if (!digits || digits.length + 1 < words[1].length) return undefined;
  return digits.length === words[1].length ? Number(digits) : null;
}

/** The monster name of a tooltip line, without its level: « Volkorne pourpre sauvage (68} » → « Volkorne pourpre sauvage ». */
export function lineName(text: string): string {
  return text.replace(/\s*[({[]\s*\d*\s*[)}\]]?\s*$/, "").trim();
}

const cx = (l: OcrLine) => l.x + l.w / 2;

/** One line per position: the reading areas of two close tooltips overlap, so a line may come twice. */
function dedupe(lines: OcrLine[]): OcrLine[] {
  const out: OcrLine[] = [];
  for (const l of lines) {
    const twin = out.findIndex((o) => Math.abs(o.y - l.y) <= 4 && Math.abs(o.x - l.x) <= 12);
    if (twin < 0) out.push(l);
    else if (l.text.length > out[twin].text.length) out[twin] = l;
  }
  return out;
}

/** Name lookup, built once per monster list: normalized name → the monsters with that name (the zone's own first). */
export function nameIndex(monsters: Iterable<Monster>): Map<string, Monster[]> {
  const index = new Map<string, Monster[]>();
  for (const m of monsters) {
    const key = normalize(m.name);
    const list = index.get(key) ?? [];
    list.push(m);
    index.set(key, list);
  }
  for (const list of index.values()) list.sort((a, b) => Number((a.kind ?? "normal") !== "normal") - Number((b.kind ?? "normal") !== "normal"));
  return index;
}

/** The monster a read name stands for: exact, a few wrong letters, or a name cut at its end. */
export function matchName(read: string, index: Map<string, Monster[]>): Monster | null {
  const key = normalize(read);
  if (key.length < 3) return null;
  const exact = index.get(key);
  if (exact) return exact[0];
  let best: { m: Monster; d: number } | null = null;
  for (const [name, list] of index) {
    if (Math.abs(name.length - key.length) > 3 && !(key.length >= 10 && name.startsWith(key))) continue;
    const d = name.startsWith(key) && key.length >= 10 ? 0.5 : editDistance(name, key);
    if (d <= Math.max(2, Math.floor(name.length * 0.15)) && (!best || d < best.d)) best = { m: list[0], d };
  }
  return best?.m ?? null;
}

/** Every group tooltip on the frame, top to bottom. */
export function readGroups(lines: OcrLine[], index: Map<string, Monster[]>): HoveredGroup[] {
  const clean = dedupe(lines);
  const headers = clean
    .map((l) => ({ l, level: groupLevel(l.text) }))
    .filter((h): h is { l: OcrLine; level: number | null } => h.level !== undefined)
    .sort((a, b) => a.l.y - b.l.y);
  const groups = headers.map((h) => ({ header: h.l, level: h.level, found: [] as { y: number; monster: Monster }[] }));
  for (const line of clean) {
    if (groupLevel(line.text) !== undefined) continue;
    // the closest header above the line, roughly in the same column
    const owner = groups
      .filter((g) => line.y > g.header.y && line.y - g.header.y <= BELOW && Math.abs(cx(line) - cx(g.header)) <= ACROSS)
      .sort((a, b) => b.header.y - a.header.y)[0];
    if (!owner) continue;
    const monster = matchName(lineName(line.text), index);
    if (monster) owner.found.push({ y: line.y, monster });
  }
  return groups
    .filter((g) => g.found.length)
    .map((g) => {
      const monsters: { monster: Monster; count: number }[] = [];
      for (const { monster } of g.found.sort((a, b) => a.y - b.y)) {
        const seen = monsters.find((x) => x.monster.id === monster.id);
        if (seen) seen.count += 1;
        else monsters.push({ monster, count: 1 });
      }
      return { level: g.level, monsters };
    });
}
