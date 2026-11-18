/** The zone line under the search bar, steadied: a zone that was found shows at once, but a failed reading (no
 * header, unknown name) must come back several ticks in a row before it replaces a zone, so one bad OCR frame never
 * makes the line blink.
 *
 * A status is a kind plus its text: the kind decides (« found », « unknown »… never the wording, which changes with
 * the language and its typography), the text is what may be shown. */

export type StatusKind = "found" | "unknown" | "noHeader" | "noDofus" | "noOcr" | "off";

export interface Status {
  kind: StatusKind;
  text: string;
}

export const MISSES_BEFORE_CHANGE = 3;
/** …and for at least this long (the screen is read several times a second). */
export const MISS_MS_BEFORE_CHANGE = 2000;

export interface StatusState {
  shown: Status | null;
  pending: StatusKind | null;
  count: number;
  /** When the pending kind was first read (ms). */
  since?: number;
}

export const initialStatus = (): StatusState => ({ shown: null, pending: null, count: 0 });

/** What the zone line shows for a status: what was read (a zone found or not) is not shown, nor that Dofus is closed
 * (the player knows); only messages the player can act on. */
export const statusText = (s: Status | null): string => (!s || s.kind === "found" || s.kind === "unknown" || s.kind === "noDofus" ? "" : s.text);

/** The messages that stop the reading until the player changes something (the game's options, Windows'
 * languages): shown as a warning line, not as a quiet hint. */
export const statusWarns = (s: Status | null): boolean => s?.kind === "noHeader" || s?.kind === "noOcr";

/** `next` is what this tick read; `now` when (ms, optional). Returns the new state (`shown` is what to display). */
export function steadyStatus(s: StatusState, next: Status, now?: number): StatusState {
  const same = s.shown?.kind === next.kind && s.shown.text === next.text;
  if (next.kind === "found" || s.shown === null || same) return { shown: next, pending: null, count: 0 };
  // an « unknown » zone counts as the same kind of failure every tick, whatever garbled text was read
  const repeat = s.pending === next.kind;
  const count = repeat ? s.count + 1 : 1;
  const since = repeat ? s.since : now;
  const longEnough = now === undefined || since === undefined || now - since >= MISS_MS_BEFORE_CHANGE;
  if (count >= MISSES_BEFORE_CHANGE && longEnough) return { shown: next, pending: null, count: 0 };
  return { shown: s.shown, pending: next.kind, count, since };
}
