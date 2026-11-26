import type { Result } from "./search";
import type { Dungeon, Monster, Snapshot } from "./types";

export interface Room {
  dungeon: Dungeon | null;
  title: string;
  monsters: Monster[];
  /** The monster the player searched for: always shown, even when its kind is hidden. */
  pinned?: number;
  /** « Songe » mode: how many of each monster the hovered groups hold (shown as « ×2 »). */
  counts?: Map<number, number>;
  /** A sub-area the game has no monsters in (a village, a port): its name and coordinates were read for sure. */
  empty?: true;
  /** A monster with no sub-zone and no dungeon (« Sans sous-zone »), alone: no header card, there is no place to
   * describe (owner, 2026-11-26: « Rien de spécial dans cette sous-zone » under the monster's own name). */
  placeless?: true;
}

function inSubarea(s: Snapshot, area: string): Monster[] {
  return [...s.monsters.values()].filter((m) => m.subareas.includes(area));
}

function ofDungeon(s: Snapshot, d: Dungeon): Room {
  const monsters = d.monsterIds.map((id) => s.monsters.get(id)).filter((m): m is Monster => !!m);
  return { dungeon: d, title: d.name, monsters };
}

/** What the panel shows for a search result. */
export function roomFor(s: Snapshot, r: Result): Room {
  if (r.kind === "dungeon" && r.dungeonId !== undefined) {
    const d = s.dungeons.get(r.dungeonId);
    if (d) return ofDungeon(s, d);
  }
  if (r.kind === "subarea" && r.subarea) {
    return { dungeon: null, title: r.subarea, monsters: inSubarea(s, r.subarea) };
  }
  const m = r.monsterId !== undefined ? s.monsters.get(r.monsterId) : undefined;
  if (!m) return { dungeon: null, title: r.label, monsters: [] };
  const d = m.dungeonIds.map((id) => s.dungeons.get(id)).find((x): x is Dungeon => !!x);
  // the one searched for is pinned wherever it lives: shown first, then the rest of its dungeon (owner, 2026-11-22)
  if (d) return { ...ofDungeon(s, d), pinned: m.id };
  // a summon that drives a boss fight (« bossSummons »): the boss's dungeon, where it is shown under its boss
  const owner = [...s.summaries.values()].find((r) => Object.values(r.bossSummons ?? {}).some((ids) => ids.includes(m.id)));
  const od = owner ? s.dungeons.get(owner.dungeonId) : undefined;
  if (od) return { ...ofDungeon(s, od), pinned: m.id };
  if (m.subareas.length) return { dungeon: null, title: m.subareas[0], monsters: inSubarea(s, m.subareas[0]), pinned: m.id };
  return { dungeon: null, title: m.name, monsters: [m], placeless: true };
}

/** The zone shown, as text kept across a reload of the page (Ctrl+R): its title, dungeon and monsters. */
export function saveRoom(r: Room): string {
  return JSON.stringify({ title: r.title, dungeonId: r.dungeon?.id ?? null, monsterIds: r.monsters.map((m) => m.id) });
}

/** The zone saved by saveRoom, rebuilt from the game data; null when there is none or it no longer matches. */
export function restoreRoom(s: Snapshot, saved: string | null): Room | null {
  if (!saved) return null;
  try {
    const { title, dungeonId, monsterIds } = JSON.parse(saved) as { title: string; dungeonId: number | null; monsterIds: number[] };
    const dungeon = dungeonId === null ? null : s.dungeons.get(dungeonId) ?? null;
    const monsters = monsterIds.map((id) => s.monsters.get(id)).filter((m): m is Monster => !!m);
    if (typeof title !== "string" || !monsters.length || (dungeonId !== null && !dungeon)) return null;
    // a monster with no place, shown alone (roomFor): nothing else is saved, its data says so
    const alone = !dungeon && monsters.length === 1 && monsters[0].name === title && !monsters[0].subareas.length && !monsters[0].dungeonIds.length;
    return alone ? { dungeon, title, monsters, placeless: true } : { dungeon, title, monsters };
  } catch {
    return null;
  }
}

/** Icon URL resolver for the icons present in data/icons/index.json. */
export function iconResolver(s: Snapshot): (path: string) => string | null {
  return (path) => (s.icons.has(path) ? `/icons/${path}` : null);
}
