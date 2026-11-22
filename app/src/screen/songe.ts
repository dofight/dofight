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

// px: the tooltip lines sit under the header. A group holds at most eight monsters, so eleven lines under the
// header at worst (the two experience lines and the eight monsters); measured at about 25 px a line on a 900-pixel
// screen, the last of them sits 275 px down. At 220 the eighth and the seventh were dropped (owner, 2026-11-21).
const BELOW = 330;
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
  const clean = text.replace(/\s*[({[]\s*\d*\s*[)}\]]?\s*$/, "").trim();
  if (clean !== text.trim()) return clean;
  // the level with its brackets misread away: « (bbi », « 4641 », « 6621 » for « (66) », « (64) », « (62) ». A short
  // last word holding a digit or a bracket is the level; a name's own last word holds neither, so « Tofu malade »
  // keeps both of its words (owner, 2026-11-21).
  const at = clean.lastIndexOf(" ");
  if (at < 0) return clean;
  const last = clean.slice(at + 1);
  return last.length <= 6 && /[\d(){}[\]]/.test(last) ? clean.slice(0, at).trim() : clean;
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
export function nameIndex(monsters: Iterable<Monster>): Index {
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

/** Letters the OCR puts in a Latin word because they are drawn the same: Cyrillic and Greek ones, « Кurookіп » for
 * « Kurookin ». Apple Vision reaches for them on small text; they fold back before anything is compared. */
const LOOKALIKE: Record<string, string> = {
  а: "a", в: "b", с: "c", е: "e", ѕ: "s", і: "i", ј: "j", к: "k", м: "m", н: "h", о: "o", р: "p", г: "r", т: "t",
  у: "y", х: "x", п: "n", и: "u", ь: "b", α: "a", ε: "e", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", ι: "i", κ: "k",
};

/** A read name as letters alone: accents off, lower case, lookalikes folded back to Latin. */
function folded(text: string): string {
  return [...normalize(text)].map((c) => LOOKALIKE[c] ?? c).join("");
}

/** Edit distance where a digit standing where a letter belongs costs nothing: a monster's name holds no digit once
 * its level is off, so « 1n9-Nor4 » is « Ino-Naru » read with three letters turned into digits, not another name
 * (owner, 2026-11-21). Everything else costs one, as usual. */
function ocrDistance(name: string, read: string): number {
  const free = (a: string, b: string) => (/\d/.test(a) && /\p{L}/u.test(b)) || (/\d/.test(b) && /\p{L}/u.test(a));
  let previous = Array.from({ length: read.length + 1 }, (_, i) => i);
  for (let i = 1; i <= name.length; i++) {
    const row = [i];
    for (let j = 1; j <= read.length; j++) {
      const a = name[i - 1];
      const b = read[j - 1];
      const swap = previous[j - 1] + (a === b || free(a, b) ? 0 : 1);
      row[j] = Math.min(swap, previous[j] + 1, row[j - 1] + 1);
    }
    previous = row;
  }
  return previous[read.length];
}

/** The words a tooltip holds that are no monster: its level line and its two experience lines. They are close
 * enough to real names to be matched (« Groupe » is one letter from « Groute »), so they are named and refused. */
const NEVER_A_NAME = ["groupe", "group", "niveau", "level", "xp", "hp", "pa", "pm"];

/** One monster list to look a name up in: normalized name → the monsters with that name. */
type Index = Map<string, Monster[]>;

/** The monster a read name stands for: exact, a few wrong letters, or a name cut at its end. The lists are tried in
 * turn — the zone's own names first, then every name in the game — because a badly read name has far fewer ways to
 * land on the wrong monster among twenty than among five thousand (owner, 2026-11-21). */
export function matchName(read: string, ...indexes: Index[]): Monster | null {
  const key = normalize(read);
  if (key.length < 3) return null;
  // a name read whole comes first, in the order given — but not over one of the zone's own that is a single letter
  // away: the OCR turns « Bouftou Noir » into « Boufton Noir », and both of those are monsters, so a clean reading
  // is not proof. A zone holding one and not the other decides it (review, 2026-11-22).
  for (let i = 0; i < indexes.length; i++) {
    const exact = indexes[i].get(key);
    if (!exact) continue;
    for (const earlier of indexes.slice(0, i)) {
      const near = nearest(key, earlier);
      if (near && near.d <= 1) return near.m;
    }
    return exact[0];
  }
  // after the exact pass: « Groute » is a monster as well as one letter from « Groupe », and was never matchable
  if (NEVER_A_NAME.some((word) => editDistance(key, word) <= 1)) return null;
  for (const index of indexes) {
    const found = matchIn(read, key, index);
    if (found) return found;
  }
  return null;
}

/** The name of this list closest to what was read, whatever the distance: what tells a misreading from another name. */
function nearest(key: string, index: Index): { m: Monster; d: number } | null {
  let best: { m: Monster; d: number } | null = null;
  for (const [name, list] of index) {
    if (Math.abs(name.length - key.length) > 3) continue;
    const d = editDistance(name, key);
    if (!best || d < best.d) best = { m: list[0], d };
  }
  return best;
}

function matchIn(read: string, key: string, index: Index): Monster | null {
  let best: { m: Monster; d: number } | null = null;
  let runnerUp = Infinity;
  for (const [name, list] of index) {
    if (Math.abs(name.length - key.length) > 3 && !(key.length >= 10 && name.startsWith(key))) continue;
    const d = name.startsWith(key) && key.length >= 10 ? 0.5 : editDistance(name, key);
    // a short name has no room for two wrong letters: at two, « P1ou » was a « Fou » and « Lvl » a « Lie »
    const allowed = name.length <= 5 ? 1 : Math.max(2, Math.floor(name.length * 0.15));
    if (d > allowed) continue;
    if (!best || d < best.d) {
      runnerUp = best?.d ?? runnerUp;
      best = { m: list[0], d };
    } else if (d < runnerUp) {
      runnerUp = d;
    }
  }
  // two names as close as each other and nothing to tell them apart: a wrong monster is worse than a missing one
  // (review, 2026-11-22: « Crqueleur » was a Craqueleur only because it came first in the list)
  if (best && runnerUp > best.d) return best.m;
  // nothing close read as it stands: the same again on a badly read line, lookalikes folded and misread digits
  // forgiven. Only for something that reads as a name at all — half its characters letters — so an experience line
  // (« 155 538 7P ») is never bent into one.
  const loose = folded(read);
  // a long name only: forgiving a digit for a letter on a short one turns any scrap of a line into a monster
  if (loose.length < 8) return null;
  if ([...loose].filter((c) => /\p{L}/u.test(c)).length * 2 < loose.length) return null;
  let near: { m: Monster; d: number } | null = null;
  let second = Infinity;
  for (const [name, list] of index) {
    if (Math.abs(name.length - loose.length) > 4) continue;
    const d = ocrDistance(name, loose);
    if (!near || d < near.d) {
      second = near?.d ?? second;
      near = { m: list[0], d };
    } else if (d < second) {
      second = d;
    }
  }
  if (!near || near.d > Math.max(2, Math.floor(loose.length * 0.25))) return null;
  // two names equally close and nothing says which: a wrong monster on the panel is worse than a missing one
  return second > near.d ? near.m : null;
}

/** Every group tooltip on the frame, top to bottom. */
export function readGroups(lines: OcrLine[], index: Index | Index[], onMissed?: (text: string) => void): HoveredGroup[] {
  const indexes = Array.isArray(index) ? index : [index];
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
    const monster = matchName(lineName(line.text), ...indexes);
    if (monster) owner.found.push({ y: line.y, monster });
    else onMissed?.(line.text); // a name under a group's level that stands for no monster: a misreading, worth saying
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
