import { t } from "../i18n";
import type { Achievement, Snapshot } from "../types";
import { esc, escText } from "./html";

/** A dungeon's challenge achievements, [] for a dungeon without (or no dungeon): no « Succès » button then. */
export function achievementsOf(s: Snapshot, dungeonId: number | null): Achievement[] {
  return dungeonId === null ? [] : (s.achievements?.get(dungeonId) ?? []);
}

/** One achievement: the challenge's game icon on the left, the kind in bold above the rule (« Spécial » alone: the
 * challenge's own name made the title too long, owner 2026-11-25). */
function row(a: Achievement): string {
  return `<li><img class="challenge" src="/icons/challenges/${a.icon}.png" alt=""><b>${escText(a.kind)}</b><span class="rule">${escText(a.rule)}</span></li>`;
}

/** The « Succès » sheet beside the panel: the dungeon's challenge achievements in the game's order. No boss name
 * (owner, 2026-11-25), except in a dungeon with two bosses (Tanière Givrefoux): one list per boss under its name, or
 * its « Duo » and « Statue » would read twice with no way to tell whose. */
export function renderAchievementsSheet(list: Achievement[]): string {
  const bosses = [...new Set(list.map((a) => a.boss))];
  const named = bosses.length > 1;
  const body = bosses
    .map((b) => `${named && b ? `<h3>${esc(b)}</h3>` : ""}<ul class="achvs">${list.filter((a) => a.boss === b).map(row).join("")}</ul>`)
    .join("");
  return `<div class="mob peek achv-sheet"><b>${esc(t("achv.button"))}</b>${body}</div>`;
}
