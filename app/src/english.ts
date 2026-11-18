/** The English view of the game data and summaries, for the English interface.
 *
 * The game is still read in French (zone names, monster names on screen come from a French client), so the French
 * snapshot stays the one the reading uses; what the panel shows goes through this English view instead: monster,
 * dungeon, zone and spell names from data/snapshot/en (same ids), and our summaries through a translation table
 * (data/summaries/en.json: whole texts, plus the pieces of the badge parameters derived from spells). */
import type { FetchJson } from "./load";
import type { Dungeon, Mechanic, Monster, MonsterSummary, RoomSummary, Snapshot, Spell, Tag } from "./types";

export interface Translations {
  /** A French summary text (strategy, detail, written badge parameter) → its English. */
  text: Record<string, string>;
  /** A piece of a derived badge parameter (« PA », « Pesanteur », « lui et ses alliés ») → its English. */
  token: Record<string, string>;
}

export interface English {
  monsters: Map<number, Monster>;
  dungeons: Map<number, Dungeon>;
  spells: Map<number, Spell>;
  translations: Translations;
  /** French zone (sub-area) name → English, and back. */
  zoneEn: Map<string, string>;
  zoneFr: Map<string, string>;
}

const PARAM_MAX = 32; // a badge parameter's length limit (vocabulary.json)

export async function loadEnglish(fetchJson: FetchJson, fr: Snapshot): Promise<English> {
  const optional = (path: string) => fetchJson(path).catch(() => null);
  const [monsters, dungeons, spells, translations] = await Promise.all([
    fetchJson("snapshot/en/monsters.json") as Promise<Monster[]>,
    fetchJson("snapshot/en/dungeons.json") as Promise<Dungeon[]>,
    fetchJson("snapshot/en/spells.json") as Promise<Spell[]>,
    optional("summaries/en.json") as Promise<Translations | null>,
  ]);
  const en: English = {
    monsters: new Map(monsters.map((m) => [m.id, m])),
    dungeons: new Map(dungeons.map((d) => [d.id, d])),
    spells: new Map(spells.map((s) => [s.id, s])),
    translations: translations ?? { text: {}, token: {} },
    zoneEn: new Map(),
    zoneFr: new Map(),
  };
  // the same monster lists its sub-areas in the same order in both languages
  for (const m of fr.monsters.values()) {
    const other = en.monsters.get(m.id);
    m.subareas.forEach((zone, i) => {
      const name = other?.subareas[i];
      if (name && !en.zoneEn.has(zone)) {
        en.zoneEn.set(zone, name);
        en.zoneFr.set(name, zone);
      }
    });
  }
  return en;
}

/** A summary text in English (the French one when it has no translation yet). */
export function translateText(t: Translations, text: string): string {
  return t.text[text] ?? text;
}

/** A badge parameter in English: a whole written one, else piece by piece for the ones derived from spells. */
export function translateParam(t: Translations, param: string): string {
  if (t.text[param]) return t.text[param];
  const pieces = param.split(", ");
  const done = pieces.map((p) => t.token[p.trim()] ?? (/^\d+$/.test(p.trim()) ? p : null));
  if (done.some((p) => p === null)) return param;
  const out = done.join(", ");
  return out.length > PARAM_MAX ? out.slice(0, PARAM_MAX) : out;
}

function translateTags(t: Translations, tags: Tag[]): Tag[] {
  return tags.map((tag) => (tag.param ? { ...tag, param: translateParam(t, tag.param) } : tag));
}

function translateMonster(t: Translations, s: MonsterSummary): MonsterSummary {
  return { ...s, tags: translateTags(t, s.tags), ...(s.detail ? { detail: translateText(t, s.detail) } : {}) };
}

function translateRoom(t: Translations, r: RoomSummary): RoomSummary {
  const monsters: Record<string, MonsterSummary> = {};
  for (const [id, s] of Object.entries(r.monsters)) monsters[id] = translateMonster(t, s);
  return {
    ...r,
    strategy: r.strategy ? translateText(t, r.strategy) : r.strategy,
    ...(r.roomTags ? { roomTags: translateTags(t, r.roomTags) } : {}),
    monsters,
  };
}

/** The snapshot the panel shows in English: English names, spells and summaries, the French ids and structure (and the
 * French zone names inside monsters, which the reading and the zone summaries are keyed by). */
export function englishView(fr: Snapshot, en: English): Snapshot {
  const t = en.translations;
  const monsters = new Map<number, Monster>();
  for (const [id, m] of fr.monsters) monsters.set(id, { ...m, name: en.monsters.get(id)?.name ?? m.name });
  const dungeons = new Map<number, Dungeon>();
  for (const [id, d] of fr.dungeons) dungeons.set(id, { ...d, name: en.dungeons.get(id)?.name ?? d.name });
  const spells = new Map<number, Spell>();
  for (const [id, s] of fr.spells) spells.set(id, en.spells.get(id) ?? s);
  const summaries = new Map<number, RoomSummary>();
  for (const [id, r] of fr.summaries) summaries.set(id, translateRoom(t, r));
  const zoneSummaries = new Map<string, RoomSummary>();
  for (const [zone, r] of fr.zoneSummaries ?? []) zoneSummaries.set(zone, translateRoom(t, r));
  const monsterSummaries = new Map<number, MonsterSummary>();
  for (const [id, s] of fr.monsterSummaries ?? []) monsterSummaries.set(id, translateMonster(t, s));
  const mechanics = new Map<string, Mechanic>();
  for (const [id, m] of fr.mechanics ?? []) {
    mechanics.set(id, { ...m, title: translateText(t, m.title), gist: translateText(t, m.gist), points: m.points.map((p) => translateText(t, p)) });
  }
  return { ...fr, monsters, dungeons, spells, summaries, zoneSummaries, monsterSummaries, mechanics };
}

/** A zone's name in English (the French one when unknown). */
export const zoneName = (en: English | null, zone: string): string => en?.zoneEn.get(zone) ?? zone;

/** The data an English game client is read with: the same dungeons and monsters (French ids and objects), with the
 * English names the client shows (dungeon map names, sub-areas, monster names). A room found with it is turned back
 * into the French one by `frenchRoom`. */
export function englishReading(fr: Snapshot, en: English): Snapshot {
  const dungeons = new Map<number, Dungeon>();
  for (const [id, d] of fr.dungeons) {
    const other = en.dungeons.get(id);
    dungeons.set(id, other ? { ...d, name: other.name, maps: other.maps } : d);
  }
  const monsters = new Map<number, Monster>();
  for (const [id, m] of fr.monsters) {
    const other = en.monsters.get(id);
    monsters.set(id, other ? { ...m, name: other.name, subareas: other.subareas } : m);
  }
  // the zones at each map's coordinates, by the names the English client shows
  const places = fr.places && new Map([...fr.places].map(([at, zones]) => [at, zones.map((z) => en.zoneEn.get(z) ?? z)]));
  // and each zone's area by its English name (zoneAreas: [French, English])
  const englishArea = new Map((fr.travel?.zoneAreas ?? []).map(([f, e]) => [f, e || f]));
  const areas = fr.areas && new Map([...fr.areas].map(([zone, area]) => [en.zoneEn.get(zone) ?? zone, englishArea.get(area) ?? area]));
  return { ...fr, dungeons, monsters, ...(places ? { places } : {}), ...(areas ? { areas } : {}) };
}

/** A room read on an English client, as the French room the rest of Dofight works with (summaries are keyed by the
 * French zone name; the panel then shows it in the interface language). */
export function frenchRoom<R extends { dungeon: Dungeon | null; title: string; monsters: Monster[] }>(fr: Snapshot, en: English, r: R): R {
  const dungeon = r.dungeon ? fr.dungeons.get(r.dungeon.id) ?? r.dungeon : null;
  const title = dungeon ? dungeon.name : en.zoneFr.get(r.title) ?? r.title;
  return { ...r, dungeon, title, monsters: r.monsters.map((m) => fr.monsters.get(m.id) ?? m) };
}
