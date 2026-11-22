/** What a side window's page says when the panel (re)starts: its label, and whether the player dragged it away. */
export interface SideState {
  label: string;
  detached: boolean;
}

/** After the panel was reloaded (Ctrl+R): the side window the next sheets go to, and the detached ones (left to the
 * player, closed by their ✕). « peek » unless it was detached (it may not have answered yet: it is still the one);
 * otherwise (or when « peek » no longer exists) the first window left attached, or null when a new one has to be
 * made. A reload used to send the sheets to the detached « peek », which ignores them, or to a « peek » the player
 * had closed: no sheet at all until a restart (owner, 2026-11-22). */
export function sidesAfterReload(states: SideState[], peekExists = true): { side: string | null; detached: string[] } {
  const detached = states.filter((s) => s.detached).map((s) => s.label).sort();
  // « peek » closed by the player (detached, then its ✕): it is gone, never the one to send sheets to
  if (peekExists && !detached.includes("peek")) return { side: "peek", detached };
  const attached = states.filter((s) => !s.detached).map((s) => s.label).sort();
  return { side: attached[0] ?? null, detached };
}
