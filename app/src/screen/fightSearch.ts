/** Dofight opened or reloaded mid-fight, with no zone known: the corner is read more often until the zone is found
 * (director.ts then loads it once read twice in a row), and after a while the list says to use the search. */

/** How often the corner is read while searching (instead of every 10 s in a fight). */
export const SEARCH_EVERY_MS = 1500;
/** After this long without the zone, the list says so (the search goes on until the fight ends). */
export const MISSED_AFTER_MS = 10_000;

export type SearchState = "idle" | "searching" | "missed";

export function searchState(o: {
  inFight: boolean;
  zoneKnown: boolean;
  /** The zone is followed: « Lecture de l'écran » and its zone option on, Songe off. */
  following: boolean;
  /** When the search started (ms). */
  since: number;
  now: number;
}): SearchState {
  if (!o.inFight || o.zoneKnown || !o.following) return "idle";
  return o.now - o.since >= MISSED_AFTER_MS ? "missed" : "searching";
}
