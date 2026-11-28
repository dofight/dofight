/** The preparation counts as the fight (Dofight treats them alike). */
export type FightState = "fight" | "end" | "none";

/** The top-left icon bar as the Rust side reads it (iconbar.rs): language-free; folded, its « + » alone is a fight;
 * unknown when covered, or folded out of a fight with its eye hidden. */
export type BarState = "fight" | "calm" | "unknown";

/** In a fight or not, from the icon bar only (no text needed, any game language; the rest of the screen is not
 * read). While the bar is unknown (covered by a window), the last state holds. */
export function readFight(bar: BarState | null | undefined, inFight: boolean): FightState {
  if (bar === "fight") return "fight";
  // the bar is back to calm: the fight is over at once
  if (bar === "calm") return inFight ? "end" : "none";
  return inFight ? "fight" : "none";
}
