import { t } from "../i18n";
import type { Achievement, Snapshot } from "../types";
import { esc, escText } from "./html";

/** A dungeon's challenge achievements, [] for a dungeon without (or no dungeon): no « Succès » button then. */
export function achievementsOf(s: Snapshot, dungeonId: number | null): Achievement[] {
  return dungeonId === null ? [] : (s.achievements?.get(dungeonId) ?? []);
}

/** One achievement: the challenge's game icon, the kind in bold (then the challenge's own name when it differs), the
 * game's rule under it. */
function row(a: Achievement): string {
  const name = a.challenge && a.challenge !== a.kind ? `${a.kind} · ${a.challenge}` : a.kind;
  return `<li><img class="challenge" src="/icons/challenges/${a.icon}.png" alt=""><div><b>${escText(name)}</b><div class="rule">${escText(a.rule)}</div></div></li>`;
}

/** The « Succès » sheet beside the panel: the dungeon's challenge achievements in the game's order; a dungeon with
 * several bosses (Tempête de l'Eliocalypse) gets one list per boss, under its name. */
export function renderAchievementsSheet(list: Achievement[]): string {
  const bosses = [...new Set(list.map((a) => a.boss))];
  const body =
    bosses.length > 1
      ? bosses.map((b) => `<h3>${esc(b)}</h3><ul class="achvs">${list.filter((a) => a.boss === b).map(row).join("")}</ul>`).join("")
      : `<ul class="achvs">${list.map(row).join("")}</ul>`;
  return `<div class="mob peek achv-sheet"><b>${esc(t("achv.button"))}</b>${body}</div>`;
}
