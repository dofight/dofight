import { t } from "../i18n";
import type { Achievement, Snapshot } from "../types";
import { esc, escText } from "./html";

/** A dungeon's challenge achievements, [] for a dungeon without (or no dungeon): no « Succès » button then. */
export function achievementsOf(s: Snapshot, dungeonId: number | null): Achievement[] {
  return dungeonId === null ? [] : (s.achievements?.get(dungeonId) ?? []);
}

/** One achievement, a row of the sheet's table: the challenge's game icon, the kind in bold (« Spécial » alone: the
 * challenge's own name made the column too wide, owner 2026-11-25), the game's rule. */
function row(a: Achievement): string {
  return `<li><img class="challenge" src="/icons/challenges/${a.icon}.png" alt=""><b>${escText(a.kind)}</b><span class="rule">${escText(a.rule)}</span></li>`;
}

/** The « Succès » sheet beside the panel: the dungeon's challenge achievements in the game's order, one list per boss
 * under its name (a single boss too, owner 2026-11-25; Tempête de l'Eliocalypse has four). */
export function renderAchievementsSheet(list: Achievement[]): string {
  const bosses = [...new Set(list.map((a) => a.boss))];
  const body = bosses
    .map((b) => `${b ? `<h3>${esc(b)}</h3>` : ""}<ul class="achvs">${list.filter((a) => a.boss === b).map(row).join("")}</ul>`)
    .join("");
  return `<div class="mob peek achv-sheet"><b>${esc(t("achv.button"))}</b>${body}</div>`;
}
