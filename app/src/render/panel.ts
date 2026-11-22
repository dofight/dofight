import type { Display, Dungeon, Monster, RoomSummary, Snapshot } from "../types";
import { frenchSpaces, t } from "../i18n";
import { esc, escText, prose, type IconUrl } from "./html";
import { icon as navIcon } from "./icons";
import { renderMechanicChips } from "./mechanic";
import { renderMonster, renderTags, tagLabel } from "./monster";

const KIND_RANK: Record<NonNullable<Monster["kind"]>, number> = {
  normal: 0, archmonster: 1, wanted: 2, special: 3, event: 4, expedition: 5, summon: 6, player_summon: 7, nowhere: 8,
};

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** A sub-area has no written summary: say what its own monsters do that is dangerous (danger badges), usually nothing. */
export function zoneSummary(monsters: Monster[], s: Snapshot): string {
  const lines = zoneLines(monsters, s);
  if (!lines.length) return t("room.nothing");
  return t("room.watch", { list: lines.join(" ; ") });
}

/** The same, as the panel shows it: « À surveiller : » then one bullet per monster, all of them. */
function zoneSummaryHtml(monsters: Monster[], s: Snapshot): string {
  const lines = zoneLines(monsters, s);
  if (!lines.length) return `<div class="strat">${esc(t("room.nothing"))}</div>`;
  return `<div class="strat">${esc(t("room.watchHead"))}<ul class="bullets">${lines.map((x) => `<li>${escText(frenchSpaces(x))}</li>`).join("")}</ul></div>`;
}

/** The zone's own monsters with danger badges: « Bouftou (ressuscite ses alliés) ». Monsters with the same badges share
 * a line (« Piou Jaune, Piou Rose (retire PO) »), « Tous les monstres (retire PO) » when every one of them has them. */
function zoneLines(monsters: Monster[], s: Snapshot): string[] {
  const byWhat = new Map<string, string[]>();
  let listed = 0;
  for (const m of monsters) {
    if ((m.kind ?? "normal") !== "normal") continue; // wanted, special, event monsters are not met by chance
    const tags = (s.monsterSummaries?.get(m.id)?.tags ?? []).filter((tag) => s.vocabulary.tags[tag.id]?.category === "danger");
    if (!tags.length) continue;
    // « poison PA », not « poison pa »: only the first letter is lowered
    const what = tags.map((tag) => `${lowerFirst(tagLabel(s.vocabulary.tags[tag.id]))}${tag.param ? ` ${tag.param}` : ""}`).join(", ");
    byWhat.set(what, [...(byWhat.get(what) ?? []), m.name]);
    listed++;
  }
  if (byWhat.size === 1 && listed > 1) return [t("room.watchAll", { what: [...byWhat.keys()][0] })];
  return [...byWhat].map(([what, names]) => `${names.join(", ")} (${what})`);
}

/** A dungeon room (or a sub-area when `d` is null and `title` is given), boss first. */
export function renderRoom(
  d: Dungeon | null,
  monsters: Monster[],
  summary: RoomSummary | undefined,
  s: Snapshot,
  show: Display,
  icon: IconUrl,
  title?: string,
  isOpen: (monsterId: number) => boolean = () => true,
  pinned?: number,
  counts?: Map<number, number>,
  trip = "",
  /** A sub-area the game has no monsters in (a village): says so, with no list. */
  empty = false,
): string {
  const head = d
    ? `<div class="dj"><b>${esc(d.name)}</b><small>${t("monster.level", { level: d.level })}</small></div>`
    : `<div class="dj"><b>${esc(title ?? "")}</b></div>`;
  const written = summary?.strategy ?? "";
  const strategy = empty ? `<div class="strat">${esc(t("room.noMonsters"))}</div>` : !show.roomSummary ? "" : summary?.strategy !== undefined || d ? (written ? prose(frenchSpaces(written), "strat") : "") : zoneSummaryHtml(monsters, s);
  const roomTags = show.roomSummary ? renderTags(summary?.roomTags ?? [], s.vocabulary, show, icon, "tags roomtags") : "";
  const mechanics = show.roomSummary ? renderMechanicChips(summary?.mechanics, s.mechanics) : "";
  const guide = summary?.guide && /^https:\/\//.test(summary.guide)
    ? `<a class="guide" href="${esc(summary.guide)}" target="_blank" rel="noopener">${t("room.guide")}${navIcon("external")}</a>`
    : "";
  // boss first, then the zone's own monsters, archmonsters, wanted, special and event monsters (stable within a group)
  // special creatures (Œuf de Pwâk, Krtek, chests…) are listed in zones but not met by chance: hidden unless the player asks for them
  // special creatures, archmonsters and wanted-poster monsters are hidden unless asked for (the monster the player
  // searched for always shows)
  const hidden = (m: Monster) =>
    (show.showSpecial === false && m.kind === "special") || (show.showArch === false && m.kind === "archmonster") || (show.showWanted === false && m.kind === "wanted") || (show.showEvent === false && m.kind === "event");
  const shown = monsters.filter((m) => !hidden(m) || m.id === pinned);
  const ordered = [...shown].sort((a, b) => Number(b.boss) - Number(a.boss) || KIND_RANK[a.kind ?? "normal"] - KIND_RANK[b.kind ?? "normal"]);
  const card = (m: Monster, summon?: { of: string }, summons?: number[]) =>
    renderMonster(m, s.spells, summary?.monsters[String(m.id)] ?? s.monsterSummaries?.get(m.id), show, icon, isOpen(m.id), s.vocabulary, counts?.get(m.id), summon, summons, s.mechanics);
  // a boss's key summons (« bossSummons ») come right under it, as part of its fight
  const listed = new Set(ordered.map((m) => m.id));
  const summonsOf = (m: Monster) =>
    (summary?.bossSummons?.[String(m.id)] ?? []).map((id) => s.monsters.get(id)).filter((x): x is Monster => !!x && !listed.has(x.id));
  // the monster the player searched for (owner, 2026-11-22: « ogivol »): its card first, then « Dans ce donjon : X »
  // and the rest of the zone, the searched one not repeated. A boss's summon is searched for too: it is not in the
  // zone's own list, it comes under its boss, and then it comes first instead.
  const bossOf = pinned === undefined || listed.has(pinned) ? undefined : ordered.find((m) => summonsOf(m).some((x) => x.id === pinned));
  const first = pinned === undefined ? undefined : listed.has(pinned) ? ordered.find((m) => m.id === pinned) : bossOf && s.monsters.get(pinned);
  const withSummons = (m: Monster) => {
    const summons = summonsOf(m).filter((x) => x.id !== first?.id);
    return card(m, undefined, summons.map((x) => x.id)) + summons.map((x) => card(x, { of: m.name })).join("");
  };
  const rest = ordered.filter((m) => m.id !== first?.id);
  const top = !first ? "" : bossOf ? card(first, { of: bossOf.name }) : withSummons(first);
  const where = d ? t("room.inDungeon", { name: d.name }) : t("room.inZone", { name: title ?? "" });
  const sep = top && rest.length ? `<div class="room-sep">${esc(where)}</div>` : "";
  const cards = top + sep + rest.map(withSummons).join("");
  // the room's name, how to get there (`trip`, see travel.ts), summary, badges and guide link in one header card
  // (readable over any map)
  // one « Suggestion » button, at the very bottom of the results (the settings' example has none)
  const suggest = show.suggest !== false ? `<button class="suggest" data-suggest-room>${navIcon("edit")}${esc(t("room.suggest"))}</button>` : "";
  return `<div class="room"><div class="roomhead">${head}${trip}${strategy}${roomTags}${mechanics}${guide}</div>${cards}${suggest}</div>`;
}
