/** How to get to a dungeon or a zone, the way Ganymède shows it: « Aller en [3,-21] » copies « /travel 3 -21 », the
 * zaap button copies « /zaap 5 -18 ; /travel 3 -21 » (take the nearest zaap, then travel). The player pastes it in
 * the game chat himself (Dofight never types in the game). Positions: data/travel.json (tools/travel.py, from
 * DofusDB): each dungeon's entrance, a map in the middle of each zone, the zaaps. */
import { t, getLang } from "./i18n";
import { icon } from "./render/icons";

export interface Spot {
  x: number;
  y: number;
  /** The world map (Amakna's, Incarnam's…): a zaap only takes you within its own. */
  world: number;
}

export interface Zaap extends Spot {
  zone: { fr: string; en: string };
}

export interface Travel {
  zaaps: Zaap[];
  /** Dungeon id → its entrance. */
  dungeons: Record<string, Spot>;
  /** French zone (sub-area) name → a map in its middle. */
  zones: Record<string, Spot>;
  /** The zones with monsters (French names), and which of them are at each map's coordinates (« x,y » → indexes). */
  zoneNames?: string[];
  /** Each zone's area, French and English (« Île de Frigost », « Frigost Island »), in the order of zoneNames. */
  zoneAreas?: [string, string][];
  places?: Record<string, number[]>;
}

/** French zone name → its area's French name. */
export function areasOf(travel: Travel): Map<string, string> {
  const names = travel.zoneNames ?? [];
  return new Map(names.map((n, i) => [n, travel.zoneAreas?.[i]?.[0] ?? ""]));
}

/** Map coordinates (« x,y ») → the French names of the zones with monsters there. */
export function placesOf(travel: Travel): Map<string, string[]> {
  const names = travel.zoneNames ?? [];
  return new Map(Object.entries(travel.places ?? {}).map(([at, ids]) => [at, ids.map((i) => names[i]).filter(Boolean)]));
}

export interface Trip {
  to: Spot;
  zaap: Zaap | null;
}

/** Maps are walked one step at a time, up, down or sideways: the distance is in maps. */
const distance = (a: Spot, b: Spot) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function tripTo(travel: Travel | undefined, dungeonId: number | null, zone: string): Trip | null {
  const to = travel && (dungeonId !== null ? travel.dungeons[String(dungeonId)] : travel.zones[zone]);
  if (!to) return null;
  let zaap: Zaap | null = null;
  for (const z of travel.zaaps) if (z.world === to.world && (!zaap || distance(z, to) < distance(zaap, to))) zaap = z;
  return { to, zaap };
}

export const travelCommand = (s: Spot): string => `/travel ${s.x} ${s.y}`;
export const zaapCommand = (z: Spot, to: Spot): string => `/zaap ${z.x} ${z.y} ; ${travelCommand(to)}`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The trip line of a room's header: « Aller en [x,y] », then the zaap to take. Each button copies its command (a
 * copy icon after it); once copied, `.tripmsg` says where to paste it (main.ts). */
export function renderTrip(trip: Trip | null): string {
  if (!trip) return "";
  const travel = travelCommand(trip.to);
  const go = `<span class="go">${esc(t("trip.go"))}</span><button type="button" class="travel" data-copy="${esc(travel)}" title="${esc(t("trip.copy", { command: travel }))}"><span class="lbl">[${trip.to.x},${trip.to.y}]</span>${icon("copy")}</button>`;
  const msg = `<span class="tripmsg" role="status"></span>`;
  if (!trip.zaap) return `<div class="trip">${go}${msg}</div>`;
  const zone = trip.zaap.zone[getLang()] || trip.zaap.zone.fr;
  const command = zaapCommand(trip.zaap, trip.to);
  const zaap = `<button type="button" class="travel zaap" data-copy="${esc(command)}" title="${esc(t("trip.copyZaap", { command, zone }))}"><img src="/icons/hud/zaap.png" alt=""><span class="lbl">${esc(zone)}</span>${icon("copy")}</button>`;
  return `<div class="trip">${go}${zaap}${msg}</div>`;
}
