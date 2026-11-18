/** « Lecture de l'écran »: the permission to look at the game (owner, 2026-11-18). A stored switch that only the
 * player moves; the options of its card and the Songe button are what Dofight does with it. Off: they are all off,
 * greyed (the button explains why), and the Dofus window is not captured. */
import type { ReadingFlag, Settings } from "./settings";

/** The options under the switch, in the order of their card. « Masquer hors du jeu » only checks which window is in
 * front, but it rests with them. */
export const READING: ReadingFlag[] = ["fromHeader", "autoFight", "autoSonge", "hideWhenAway"];

/** Whether the Dofus window is captured: the switch is on and something uses the reading (nothing is captured for
 * nothing; the zone line does not say « coupée » then, the switch is on). */
export const capturing = (s: Settings): boolean => s.reading && (s.songe || READING.some((flag) => s[flag]));

/** The switch turned on or off. Off: the options and Songe go off, the options that were on are remembered. On: they
 * come back exactly as they were (possibly none); Songe stays off, a per-moment choice. */
export function readingPatch(s: Settings, on: boolean): Partial<Settings> {
  if (!on) return { ...Object.fromEntries(READING.map((f) => [f, false])), songe: false, readingBefore: READING.filter((f) => s[f]), reading: false };
  return { ...Object.fromEntries(READING.map((f) => [f, s.readingBefore.includes(f)])), readingBefore: [], reading: true };
}
