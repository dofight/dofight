import type { Room } from "../room";
import { editDistance, normalize } from "../search";
import type { Dungeon, Monster, Snapshot } from "../types";
import type { Header } from "./header";

const words = (s: string) => normalize(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length >= 3);

function dungeonRoom(s: Snapshot, h: Header): Room | null {
  const title = normalize(h.title);
  let best: { d: Dungeon; dist: number; coords: boolean } | null = null;
  for (const d of s.dungeons.values()) {
    for (const map of d.maps) {
      const name = normalize(map.name);
      const dist = editDistance(name, title);
      if (dist > Math.max(2, Math.floor(name.length / 15))) continue;
      const coords = map.x === h.x && map.y === h.y;
      if (!best || dist < best.dist || (dist === best.dist && coords && !best.coords)) best = { d, dist, coords };
    }
  }
  if (!best) return null;
  const monsters = best.d.monsterIds.map((id) => s.monsters.get(id)).filter((m): m is Monster => !!m);
  return { dungeon: best.d, title: best.d.name, monsters };
}

/** The OCR read `read` for `name`: a few wrong letters spread over it (« Faubour3sÂes artisans »), but never a whole
 * different word (« Village des Éleveurs » is not « Village des Dragoeufs »). */
export function noisyMatch(name: string, read: string): boolean {
  const a = normalize(name);
  const b = normalize(read);
  const dist = editDistance(a, b);
  if (dist > Math.max(1, Math.floor(a.length * 0.3))) return false;
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const core = Math.max(a.length, b.length) - start - end; // the part that differs
  // a short garbled stretch in a long name may be all wrong (« Tronc de Itarbre Hakam » for « l'arbre »), as long as
  // the rest of the name is read exactly (most of it)
  if (core <= 4 && start + end >= a.length * 0.6) return true;
  return dist <= Math.max(1, core * 0.7);
}

function subareaRoom(s: Snapshot, h: Header): Room | null {
  const inside = /\(([^)]*)\)?/.exec(h.title)?.[1];
  const titleWords = new Set(words(inside ?? h.title));
  const names = new Set<string>();
  for (const m of s.monsters.values()) m.subareas.forEach((a) => names.add(a));
  let best: { name: string; score: number } | null = null;
  for (const name of names) {
    let score: number;
    if (inside !== undefined) {
      score = noisyMatch(name, inside) ? 1 - editDistance(normalize(name), normalize(inside)) / 100 : 0;
    } else if (!h.title.includes(")")) {
      // no parentheses at all: only the area was read (« Île des Wabbits »); accept an exact sub-area name only
      score = normalize(name) === normalize(h.title) ? 1 : 0;
    } else {
      const ws = words(name);
      score = ws.length ? ws.filter((w) => titleWords.has(w)).length / ws.length : 0;
      if (score < 0.6) score = 0;
    }
    if (score > 0 && (!best || score > best.score)) best = { name, score };
  }
  const name = best?.name ?? byCoordinates(s, h, names);
  if (!name) return null;
  const monsters = [...s.monsters.values()].filter((m) => m.subareas.includes(name));
  return { dungeon: null, title: name, monsters };
}

/** The longest run of letters two texts share (accents, case, spaces and punctuation ignored). */
function sharedRun(a: string, b: string): number {
  const x = normalize(a).replace(/[^a-z0-9]/g, "");
  const y = normalize(b).replace(/[^a-z0-9]/g, "");
  let best = 0;
  const prev = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let diag = 0;
    for (let j = 1; j <= y.length; j++) {
      const keep = prev[j];
      prev[j] = x[i - 1] === y[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = keep;
    }
  }
  return best;
}

const SHARED_MIN = 5; // letters in a row the garbled name must still share with the zone (« ronigride »)

/** When the name is garbled but the coordinates are read (« Île de dtOüronigride) », -69, -87: the light snow
 * behind the header), the zone among those at these coordinates whose name the reading still shares a run of letters
 * with; or, when only the area was read (« Île de Frigost » for « Île de Frigost (Lac gelé) », hovering the map), the
 * one zone of that area there. Never a zone the text does not support: another place at the same coordinates (a
 * house, a zone with no monsters) finds nothing. */
function byCoordinates(s: Snapshot, h: Header, names: Set<string>): string | null {
  if (h.x === null || h.y === null || !s.places) return null;
  // a zone name read whole, between both parentheses, is another place (« Village côtier », no monsters): only a
  // damaged zone part (a parenthesis lost: « dtOüronigride) », « (Île de Karto ») or none is looked up here
  if (h.title.includes("(") && h.title.includes(")")) return null;
  // only the area was read (no parenthesis at all): a zone name read in parentheses names another place (a village
  // with no monsters), never replaced by a zone of its area
  const areaRead = /[()]/.test(h.title) ? "" : h.title.trim();
  let best: { name: string; run: number; tie: boolean } | null = null;
  for (const name of s.places.get(`${h.x},${h.y}`) ?? []) {
    if (!names.has(name)) continue;
    let run = sharedRun(name, h.title);
    if (run < SHARED_MIN) {
      // the area alone: weaker than any shared run of the zone's own name, and a tie when two zones of it are there
      const area = s.areas?.get(name);
      if (!area || areaRead.length < 4 || !noisyMatch(area, areaRead)) continue;
      run = 1;
    }
    if (!best || run > best.run) best = { name, run, tie: false };
    else if (run === best.run) best.tie = true;
  }
  return best && !best.tie ? best.name : null;
}

/** The room or sub-area a map header points to, or null (cut title, unknown place). */
export function locate(s: Snapshot, h: Header): Room | null {
  if (h.cut || !h.title) return null;
  return dungeonRoom(s, h) ?? subareaRoom(s, h);
}
