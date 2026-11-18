/** How a monster's spells reach you: their range and its shape under each spell, and their order, the furthest reaching
 * first (walking with all its PM, then casting at its longest range, its area reaching further still; owner,
 * 2026-11-09: to pick where to end a turn). Walls, obstacles and line of sight are not counted. */
import { t } from "./i18n";
import type { IconName } from "./render/icons";
import { parseZone } from "./render/zone";
import type { Spell, SpellEffect } from "./types";

/** An effect that can land on a player: aimed at the enemies (or everyone), and not the monster summoning. */
const onYou = (e: SpellEffect) => (e.target === undefined || e.target === "enemies" || e.target === "all") &&
  !e.text.startsWith("Invoque");

/** A spell that can touch you (a hit, a removal, a state…); buffs, self heals and summons cannot. */
export const touchesYou = (sp: Spell): boolean => sp.effects.some(onYou);

/** How many cells an effect's area adds beyond the cell aimed at (Infinity: the whole map). */
function areaReach(zone: string | null | undefined): number {
  if (zone === "toute la carte") return Infinity;
  const z = parseZone(zone);
  if (!z) return 0;
  if (z.shape.endsWith("-inversé") || z.size >= 60) return Infinity;
  return z.shape === "rectangle" ? Math.max(z.size, z.second || 1) : z.size;
}

/** The area that reaches furthest among the effects that land on you, else any; null when there is none. */
export function mainZone(sp: Spell): string | null {
  const own = sp.effects.filter(onYou);
  const list = (own.length ? own : sp.effects).filter((e) => e.zone);
  return list.reduce<string | null>((best, e) => (best === null || areaReach(e.zone) > areaReach(best) ? e.zone! : best), null);
}

/** Cells from the monster where this spell can still touch you this turn; null when it cannot touch you. */
export function spellReach(sp: Spell, mp: number): number | null {
  if (!touchesYou(sp)) return null;
  const area = Math.max(0, ...sp.effects.filter(onYou).map((e) => areaReach(e.zone)));
  return mp + sp.rangeMax + area;
}

/** The spells that can touch you first, the furthest reaching first; then the others, in their own order. */
export function sortByReach(spells: Spell[], mp: number): Spell[] {
  const reach = new Map(spells.map((s) => [s, spellReach(s, mp)]));
  const hits = spells.filter((s) => reach.get(s) !== null).sort((a, b) => reach.get(b)! - reach.get(a)!);
  return [...hits, ...spells.filter((s) => reach.get(s) === null)];
}

/** The range under a spell's icon: « 1–8 », « CaC », « soi » (cast on itself). */
export function rangeCaption(sp: Spell): string {
  if (sp.rangeMax === 0) return t("reach.self");
  if (sp.rangeMax === 1) return t("reach.melee");
  return sp.rangeMin === sp.rangeMax ? `${sp.rangeMax}` : `${sp.rangeMin}–${sp.rangeMax}`;
}

/** How the range is shaped, for spells beyond melee: in a line, in a diagonal, without line of sight. */
export function rangeMarks(sp: Spell): { icon: IconName; label: string }[] {
  if (sp.rangeMax <= 1) return [];
  const marks: { icon: IconName; label: string }[] = [];
  if (sp.inLine) marks.push({ icon: "inLine", label: t("reach.inLine") });
  if (sp.inDiagonal) marks.push({ icon: "inDiagonal", label: t("reach.inDiagonal") });
  if (!sp.lineOfSight) marks.push({ icon: "noSight", label: t("reach.noSight") });
  return marks;
}
