/** How to get to a dungeon or a zone, the way Ganymède shows it: « Aller en [3,-21] » copies « /travel 3 -21 », the
 * zaap button copies « /zaap 5 -18 ; /travel 3 -21 » (take the nearest zaap, then travel). The player pastes it in
 * the game chat himself (Dofight never types in the game). Positions: data/travel.json (from the game client's own
 * data files): each dungeon's entrance, a map in the middle of each zone, the zaaps. */
import { t, getLang } from "./i18n";
import { icon } from "./render/icons";

export interface Spot {
  x: number;
  y: number;
  /** The world map (Amakna's, Incarnam's…): a zaap only takes you within its own. */
  world: number;
  /** A route written by hand where the nearest zaap is not the way in (a transporter, a boat: data/travel-overrides.json):
   * its steps in order, a step starting with « / » being a command to copy; `routeEn` in English (else `route`). */
  route?: string[];
  routeEn?: string[];
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
  /** The sub-areas without monsters: [French, English] names, and the coordinates of their maps (« x,y » → indexes). */
  emptyZones?: [string, string][];
  emptyPlaces?: Record<string, number[]>;
}

/** French zone name → its area's French name. */
export function areasOf(travel: Travel): Map<string, string> {
  const names = travel.zoneNames ?? [];
  return new Map(names.map((n, i) => [n, travel.zoneAreas?.[i]?.[0] ?? ""]));
}

/** Map coordinates (« x,y ») → the French names of the sub-areas without monsters there. */
export function emptyPlacesOf(travel: Travel): Map<string, string[]> {
  const names = travel.emptyZones ?? [];
  return new Map(Object.entries(travel.emptyPlaces ?? {}).map(([at, ids]) => [at, ids.map((i) => names[i]?.[0]).filter(Boolean)]));
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

/** The written route of a spot in the interface language (`routeEn` in English when there is one), [] when none. */
export const routeOf = (to: Spot): string[] => (getLang() === "en" && to.routeEn?.length ? to.routeEn : to.route) ?? [];

export const travelCommand = (s: Spot): string => `/travel ${s.x} ${s.y}`;
export const zaapCommand = (z: Spot, to: Spot): string => `/zaap ${z.x} ${z.y} ; ${travelCommand(to)}`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const accessButton = (): string =>
  `<button type="button" class="access" aria-expanded="false" title="${esc(t("access.buttonTitle"))}">${esc(t("access.button"))} ›</button>`;

export interface TripOptions {
  /** Something to know before going (access.ts `isSpecial`): the « Comment y aller » button. */
  special?: boolean;
}

/** The trip line of a room's header: « Aller en [x,y] », then the zaap to take. Each button copies its command (a
 * copy icon after it); once copied, the button says « Copié » in place of its text for 1 s (`showCopied`). */
export function renderTrip(trip: Trip | null, opts: TripOptions = {}): string {
  // no known position (a dungeon the client does not place): the button alone, when there is something to know
  if (!trip) return opts.special ? `<div class="trip">${accessButton()}</div>` : "";
  const route = routeOf(trip.to);
  if (route.length && !opts.special) return renderRoute(route);
  const travel = travelCommand(trip.to);
  const go = `<span class="go">${esc(t("trip.go"))}</span><button type="button" class="travel" data-copy="${esc(travel)}" title="${esc(t("trip.copy", { command: travel }))}">${STEPS}<span class="lbl" aria-live="polite">[${trip.to.x},${trip.to.y}]</span>${icon("copy")}</button>`;
  const msg = "";
  // « Comment y aller »: the sheet has the route and what to do first
  const extra = opts.special ? accessButton() : "";
  // a written route: the nearest zaap is the wrong way in, the sheet has the right one
  if (!trip.zaap || route.length) return `<div class="trip">${go}${extra}${msg}</div>`;
  const zone = trip.zaap.zone[getLang()] || trip.zaap.zone.fr;
  const command = zaapCommand(trip.zaap, trip.to);
  const zaap = `<button type="button" class="travel zaap" data-copy="${esc(command)}" title="${esc(t("trip.copyZaap", { command, zone }))}">${ZAAP}<span class="lbl" aria-live="polite">${esc(zone)}</span>${icon("copy")}</button>`;
  return `<div class="trip">${go}${zaap}${extra}${msg}</div>`;
}

// the game's own pictures (private/tools/client.py): the zaap, the footprints at the end of a path on the map (a
// /travel), the disposable rustic skis (« {skis} » in a step's text, owner 2026-11-20)
const hud = (name: string) => `<img src="/icons/hud/${name}.png" alt="">`;
const ZAAP = hud("zaap");
const STEPS = hud("steps");
const MARKS: Record<string, string> = { skis: hud("skis") };
/** « {skis} » in escaped text → its picture; an unknown mark stays as it is. */
const marks = (html: string): string =>
  html
    .replace(/\{(\w+)\}/g, (all, name: string) => MARKS[name] ?? all)
    // « **Larmes d'Ouronigride** »: the name to pick (at a transporter, a boat), in bold
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

/** A text step, escaped, its « [name](https://…) » parts made links (a quest's page: « après [Star ski et Dutch](…) »);
 * any other link stays as text. */
function withLinks(step: string): string {
  const parts = step.split(/\[([^\]]+)\]\((https:\/\/[^)\s"]+)\)/);
  return parts
    .map((p, i) => (i % 3 === 0 ? marks(esc(p)) : i % 3 === 1 ? `<a class="quest" href="${esc(parts[i + 1])}" target="_blank" rel="noopener">${esc(p)}</a>` : ""))
    .join("");
}

/** A written route: « Trajet : » (unless `label` is false: the sheet has its own heading) then its steps in order; a
 * command step (« /zaap … », « /travel … ») is a button that copies it, then the text after « | » if any (« /travel -68
 * -34 | ou {skis} Paire de skis… »); the others (« Prendre le Transporteur frigostien vers … ») are text, a quest in them
 * a link to its page. */
export function renderRoute(route: string[], label = true): string {
  const steps = route
    .map((step) => {
      const trimmed = step.trim();
      if (!trimmed.startsWith("/")) return `<li class="step">${withLinks(trimmed)}</li>`;
      const bar = trimmed.indexOf(" | ");
      const s = bar < 0 ? trimmed : trimmed.slice(0, bar).trim();
      const after = bar < 0 ? "" : ` ${withLinks(trimmed.slice(bar + 3).trim())}`;
      return `<li class="step"><button type="button" class="travel" data-copy="${esc(s)}" title="${esc(t("trip.copy", { command: s }))}">${s.startsWith("/zaap ") ? ZAAP : STEPS}<span class="lbl" aria-live="polite">${esc(s)}</span>${icon("copy")}</button>${after}</li>`;
    })
    .join("");
  const head = label ? `<span class="go">${esc(t("trip.route"))}</span>` : "";
  return `<div class="trip route">${head}<ol class="steps">${steps}</ol></div>`;
}

const COPIED_MS = 1000;
const restore = new WeakMap<HTMLElement, number>();

/** A copy button just used: « Copié » (or « Copie impossible ») in place of its text, for 1 s (owner, 2026-11-20), keeping its width so
 * nothing around it moves (owner, 2026-11-20: in the button, not on a line under it). */
export function showCopied(button: HTMLElement, ok: boolean): void {
  const lbl = button.querySelector<HTMLElement>(".lbl");
  if (!lbl) return;
  if (lbl.dataset.text === undefined) {
    lbl.dataset.text = lbl.textContent ?? "";
    if (button.offsetWidth) button.style.minWidth = `${button.offsetWidth}px`;
  }
  lbl.textContent = t(ok ? "access.copied" : "access.copyFailed");
  button.classList.toggle("copied", ok);
  button.classList.toggle("failed", !ok);
  window.clearTimeout(restore.get(button));
  restore.set(button, window.setTimeout(() => {
    lbl.textContent = lbl.dataset.text ?? "";
    delete lbl.dataset.text;
    button.classList.remove("copied", "failed");
    button.style.minWidth = "";
  }, COPIED_MS));
}
