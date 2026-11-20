import type { Access } from "./access";
import { areasOf, placesOf, type Travel } from "./travel";
import type { Dungeon, Mechanic, Monster, MonsterSummary, RoomSummary, Snapshot, Spell, Vocabulary } from "./types";

export type FetchJson = (path: string) => Promise<unknown>;

/** Reads data/ (served as the app's static files) into a Snapshot. Missing summaries or icon index are fine. */
export async function loadSnapshot(fetchJson: FetchJson): Promise<Snapshot> {
  const optional = (path: string) => fetchJson(path).catch(() => null);
  const [dungeons, monsters, spells, summaries, vocabulary, icons, perMonster, zones, travel, mechanics, access] = await Promise.all([
    fetchJson("snapshot/dungeons.json") as Promise<Dungeon[]>,
    fetchJson("snapshot/monsters.json") as Promise<Monster[]>,
    fetchJson("snapshot/spells.json") as Promise<Spell[]>,
    optional("summaries/index.json") as Promise<Record<string, RoomSummary> | null>,
    optional("summaries/vocabulary.json") as Promise<Vocabulary | null>,
    optional("icons/index.json") as Promise<string[] | null>,
    optional("summaries/monsters.json") as Promise<Record<string, MonsterSummary> | null>,
    optional("summaries/zones.json") as Promise<Record<string, RoomSummary> | null>,
    optional("travel.json") as Promise<Travel | null>,
    optional("summaries/mechanics.json") as Promise<Record<string, Mechanic> | null>,
    optional("access.json") as Promise<Access | null>,
  ]);
  return {
    dungeons: new Map(dungeons.map((d) => [d.id, d])),
    monsters: new Map(monsters.map((m) => [m.id, m])),
    spells: new Map(spells.map((s) => [s.id, s])),
    summaries: new Map(Object.entries(summaries ?? {}).map(([id, r]) => [Number(id), r])),
    vocabulary: vocabulary ?? { tags: {} },
    icons: new Set(icons ?? []),
    zoneSummaries: new Map(Object.entries(zones ?? {})),
    mechanics: new Map(Object.entries(mechanics ?? {})),
    monsterSummaries: new Map(Object.entries(perMonster ?? {}).map(([id, m]) => [Number(id), m])),
    ...(access ? { access } : {}),
    ...(travel ? { travel, places: placesOf(travel), areas: areasOf(travel) } : {}),
  };
}

export const fetchFromApp: FetchJson = async (path) => {
  const resp = await fetch(`/${path}`);
  if (!resp.ok) throw new Error(`${path}: ${resp.status}`);
  return resp.json();
};
