/** What a place needs before a player can go there (data/access.json, exported from the reviewed draft by
 * private/tools/access/export.py): an area's requirements apply to every dungeon and zone in it, a dungeon adds its
 * own, its level and its key. Shown by « Comment y aller » (render/accessSheet.ts). */
import type { Spot } from "./travel";

export interface Text {
  fr: string;
  en: string;
}

export interface QuestReq {
  id: number;
  fr: string;
  en: string;
  level: number;
  /** Where the quest starts (its first NPC's map), or null when the client does not say. */
  start: { x: number; y: number } | null;
  /** Its page on Dofus pour les Noobs, when one was found. */
  url?: string;
}

export type Req =
  | { quest: QuestReq }
  /** A dungeon to have beaten first. */
  | { beat: { id: number; fr: string; en: string } }
  | { item: Text; how?: Text }
  /** An area's own minimum level (Osavora: 50). */
  | { level: number }
  | { other: Text }
  | { event: Text }
  | { anyOf: Req[] };

export interface Access {
  /** Keyed by the area's French name; `dimension` for the five divine dimensions. */
  areas: Record<string, { reqs: Req[]; en?: string; dimension?: true }>;
  dungeons: Record<string, { area: string; level: number; key: Text | null; offKeyring?: true; reqs: Req[]; guide?: string }>;
}

/** Everything known about getting into one dungeon or zone. */
export interface PlaceAccess {
  level: number | null;
  key: Text | null;
  offKeyring: boolean;
  areaName: string | null;
  /** The area's English name, null when unknown (the French one is shown). */
  areaEn: string | null;
  dimension: boolean;
  areaReqs: Req[];
  ownReqs: Req[];
  guide: string | null;
}

/** A dungeon (by id) or a zone (by French name, its area from `areas`); null when nothing is known about it. */
export function accessOf(access: Access | undefined, areas: Map<string, string> | undefined, dungeonId: number | null, zone: string): PlaceAccess | null {
  if (!access) return null;
  if (dungeonId !== null) {
    const d = access.dungeons[String(dungeonId)];
    if (!d) return null;
    const area = access.areas[d.area];
    return {
      level: d.level, key: d.key, offKeyring: !!d.offKeyring, areaName: d.area, areaEn: area?.en ?? null, dimension: !!area?.dimension,
      areaReqs: area?.reqs ?? [], ownReqs: d.reqs, guide: d.guide ?? null,
    };
  }
  const name = areas?.get(zone);
  const area = name ? access.areas[name] : undefined;
  if (!name || !area) return null;
  return { level: null, key: null, offKeyring: false, areaName: name, areaEn: area.en ?? null, dimension: !!area.dimension, areaReqs: area.reqs, ownReqs: [], guide: null };
}

/** Whether « Comment y aller » is worth a button: requirements, a key the keyring does not hold, or a written route (the
 * level and a key of the keyring alone are not worth it). */
export function isSpecial(pa: PlaceAccess | null, to: Spot | null): boolean {
  return !!(pa && (pa.areaReqs.length || pa.ownReqs.length || (pa.key && pa.offKeyring))) || !!to?.route?.length;
}
