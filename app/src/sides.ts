/** What a side window's page says when the panel (re)starts: its label, and whether the player dragged it away. */
export interface SideState {
  label: string;
  detached: boolean;
}

/** After the panel was reloaded (Ctrl+R): the side window the next sheets go to, and the detached ones (left to the
 * player, closed by their ✕). « peek » unless it was detached (it may not have answered yet: it is still the one);
 * otherwise the first window left attached, or null when a new one has to be made. A reload used to send the sheets
 * to the detached « peek », which ignores them: no sheet at all until a restart (owner, 2026-11-22). */
export function sidesAfterReload(states: SideState[]): { side: string | null; detached: string[] } {
  const detached = states.filter((s) => s.detached).map((s) => s.label).sort();
  if (!detached.includes("peek")) return { side: "peek", detached };
  const attached = states.filter((s) => !s.detached).map((s) => s.label).sort();
  return { side: attached[0] ?? null, detached };
}
