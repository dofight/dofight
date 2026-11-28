import { frenchSpaces, getLang, kindName, t, type Key } from "../i18n";
import { levelRange } from "../search";
import type { Achievement, Display, Element, Mechanic, Monster, MonsterSummary, Spell, Tag, TagKind, TagSpec, Vocabulary } from "../types";
import { renderMechanicChips } from "./mechanic";
import { achievementsButton } from "../travel";
import { CATEGORY_ICON, categoryName, esc, escText, img, prose, type IconUrl } from "./html";
import { icon as navIcon } from "./icons";
import { rangeCaption, rangeMarks, spellOrder } from "../reach";

// danger, then mechanics, then tips (owner, 2026-11-24)
const TAG_ORDER: TagKind[] = ["danger", "mechanic", "tip"];
const TAG_SHOWN: Record<TagKind, keyof Display> = { danger: "tagsDanger", tip: "tagsTip", mechanic: "tagsMechanic" };
const TAG_KIND_LABEL: Record<TagKind, Key> = { danger: "opt.tagsDanger", tip: "opt.tagsTip", mechanic: "opt.tagsMechanic" };
const ELEMENTS: [Element, string][] = [["n", "neutral"], ["e", "earth"], ["f", "fire"], ["w", "water"], ["a", "air"]];

/** A small label after the name for monsters that are not the zone's own (« Avis de recherche », « Spécial »…), the
 * same as in the search results. */
const kindTag = (kind: NonNullable<Monster["kind"]>) => kindName(kind);

/** A badge's label in the interface language (the French one when an English label is missing). */
export const tagLabel = (spec: TagSpec): string => (getLang() === "en" && spec.labelEn ? spec.labelEn : spec.label);

const range = (a: number, b: number) => (a === b ? `${a}` : `${a} – ${b}`).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Rows shown before « + N autres sorts », the furthest reaching first (owner, 2026-11-26). */
const SPELL_ROWS = 6;
/** Badges on a spell's row: past it, the last place says « +N ». */
const SPELL_BADGES = 3;

export function renderMonster(
  m: Monster,
  spells: Map<number, Spell>,
  summary: MonsterSummary | undefined,
  show: Display,
  icon: IconUrl,
  open = true,
  vocab: Vocabulary = { tags: {} },
  count?: number,
  /** A summon that drives the boss fight (« bossSummons »): shown right under its boss, like a boss. */
  summon?: { of: string },
  /** A boss's own summons (their ids): they fold and unfold with it. */
  summons?: number[],
  /** The mechanic sheets, for the chips of the monster's own sheets. */
  mechanics?: Map<string, Mechanic>,
  /** Its own challenge achievements (an anomaly boss: no dungeon to hold them): the « Succès » button on its card. */
  achievements?: Achievement[],
): string {
  const parts: string[] = [];
  const kind = summon ? t("monster.summonOf") : kindTag(m.kind ?? "normal");
  const kindTitle = summon ? ` title="${esc(summon.of)}"` : "";
  const cls = `mob${m.boss || summon ? " boss" : ""}${summon ? " summon" : ""}`;
  const more = summons?.length ? ` data-summons="${summons.join(",")}"` : "";
  const thumb = show.thumbnails ? img(icon, `monsters/${m.id}.webp`, 'class="thumb"') : "";
  // folded: its danger badges as icons on the line (at most 3, then « +N »), so the list warns without opening
  const cue = open ? "" : dangerCue(summary, vocab, show, icon);
  // an anomaly boss's own achievements: « Succès » next to its name (owner, 2026-11-25), folded or open
  const achv = achievements?.length ? achievementsButton(m.id) : "";
  parts.push(`<div class="mh" role="button" tabindex="0" aria-expanded="${open}">${thumb}<span class="mtitle"><span class="mline"><span class="mname">${esc(m.name)}</span>${count && count > 1 ? `<small class="mcount">×${count}</small>` : ""}${achv}</span>${kind ? `<small class="mkind"${kindTitle}>${esc(kind)}</small>` : ""}</span>${cue}<span class="chev" aria-hidden="true">${navIcon("chevron")}</span></div>`);
  if (!open) return `<div class="${cls}" data-monster="${m.id}"${more} data-open="false">${parts.join("")}</div>`;
  // its phases: HP thresholds only (a « Change de phase » badge with percentages), beside its HP with the yellow heart,
  // « P1 75 % - P2 50 % - P3 25 % » on hover (owner, 2026-11-19: a phase is an HP threshold; a change on an event
  // stays a badge)
  const isPhase = (tag: Tag) => tag.id === "phase" && phaseThresholds([tag.param ?? ""]).length > 0;
  const phases = (summary?.tags ?? []).filter(isPhase).map((tag) => tag.param ?? "");
  const thresholds = phaseThresholds(phases);
  const phaseSpan = thresholds.length
    ? `<span class="phase">${img(icon, "badges/phase.webp")}${esc(t("monster.phases"))}</span>`
    : "";
  if (show.details) {
    parts.push(
      `<div class="lvl stats"><span>${m.boss ? `${t("monster.boss")} · ` : ""}${levelRange(m)}</span>` +
        `<span>${img(icon, "hud/health.webp") || `${t("monster.hp")} `}${range(m.hpMin, m.hpMax)}</span>${phaseSpan}` +
        `<span>${img(icon, "hud/ap.webp") || `${t("monster.ap")} `}${m.ap}</span><span>${img(icon, "hud/mp.webp") || `${t("monster.mp")} `}${m.mp}</span></div>`,
    );
  }
  if (show.resistances) {
    parts.push(
      `<div class="resrow">${ELEMENTS.map(([k, file]) => {
        const v = m.res[k] ?? 0;
        const label = t(`element.${k}` as Key);
        const ic = img(icon, `characteristics/resper_${file}.webp`) || `${label} `;
        return `<span class="r${v < 0 ? " neg" : v === 0 ? " zero" : ""}" title="${esc(t("monster.resistance", { element: label }))}">${ic}${v} %</span>`;
      }).join("")}</div>`,
    );
  }
  // the states it keeps the whole fight (Indéplaçable, Lourd…), from the game data: a line of their own before the
  // badges, the game's icon and name, its description on hover (owner, 2026-11-27)
  if (m.states?.length) {
    parts.push(`<div class="states">${m.states.map((s) => `<span class="st" title="${esc(s.text)}">${img(icon, `states/${s.icon}.webp`)}${esc(s.name)}</span>`).join("")}</div>`);
  }
  // (the « Change de phase » badge stays as well: owner, 2026-11-19)
  const tags =renderTags(summary?.tags ?? [], vocab, show, icon);
  if (tags) {
    parts.push(tags);
  } else if (summary && summary.tags.length === 0) {
    parts.push(`<div class="empty">${t("monster.harmless")}</div>`);
  }
  if (summary?.detail) parts.push(prose(frenchSpaces(summary.detail), "detail"));
  const chips = renderMechanicChips(summary?.mechanics, mechanics);
  if (chips) parts.push(chips);
  // a monster with its own guide (a wanted poster's « On recherche » page on DPLN)
  if (summary?.guide && /^https:\/\//.test(summary.guide)) {
    parts.push(`<a class="guide" href="${esc(summary.guide)}" target="_blank" rel="noopener">${t("room.guide")}${navIcon("external")}</a>`);
  }
  const own = m.spellIds.map((id) => spells.get(id)).filter((s): s is Spell => !!s);
  const passive = passiveSpell(m, spells);
  if (show.spells && (own.length || passive)) {
    // one row per spell, in reach.ts spellOrder's order (the damage, then the moves, then the rest, each the furthest
    // reaching first): its icon, its name, its badges (the damage elements first, SPELL_BADGES at most), its range in
    // a column of its own (owner, 2026-11-26). The ones that cannot touch you nor move anyone (a buff, a summon) come
    // last, greyed; past SPELL_ROWS, the rest folds under « + N autres sorts ». Each is still a `.sp` with its `data-spell`: hovering shows its sheet, a click pins it
    const label = (s: Spell) => [s.name, rangeCaption(s), ...rangeMarks(s).map((k) => k.label)].join(" · ");
    // with the hover preview on, its sheet shows beside the panel: a native tooltip would cover it
    const title = (s: Spell) => (show.hoverPeek ? "" : ` title="${esc(label(s))}"`);
    const face = (s: Spell) => img(icon, `spells/${s.spellId ?? s.id}.webp`) || `<span class="abbr">${esc(s.name.slice(0, 4))}</span>`;
    const badges = (s: Spell) => {
      if (!show.spellBadges) return `<span class="cats"></span>`;
      const cats = [...s.categories].sort((a, b) => Number(!a.startsWith("dmg")) - Number(!b.startsWith("dmg")));
      const fits = cats.length > SPELL_BADGES ? SPELL_BADGES - 1 : SPELL_BADGES;
      const shown = cats.slice(0, fits).map((c) => img(icon, `spell/effect/${CATEGORY_ICON[c]}.webp`, `class="c-${c.split("_")[0]}" title="${esc(categoryName(c))}"`));
      const rest = cats.slice(fits);
      const more = rest.length ? `<span class="more" title="${esc(rest.map(categoryName).join(", "))}">+${rest.length}</span>` : "";
      return `<span class="cats">${shown.join("")}${more}</span>`;
    };
    const { listed, calm } = spellOrder(own, m.mp);
    const hits = [...listed, ...calm]; // the ones that cannot touch you last (owner, 2026-11-26: no line apart)
    const row = (s: Spell) => {
      // its range and how it is shaped (in a line, a diagonal, without line of sight), read at a glance
      const shape = rangeMarks(s).map((k) => `<span class="mk" title="${esc(k.label)}">${navIcon(k.icon)}</span>`).join("");
      // the range and its marks in two columns of their own, so every range lines up (owner, 2026-11-26)
      const rng = `<span class="rng">${esc(rangeCaption(s))}</span><span class="mks">${shape}</span>`;
      // one that cannot touch you (a buff, a summon) is greyed, but kept: a summon or a state can be the fight
      const off = calm.includes(s) ? " off" : "";
      return `<button class="sp${off}" aria-pressed="false"${title(s)} aria-label="${esc(label(s))}" data-spell="${s.id}">${face(s)}<span class="spn">${esc(s.name)}</span>${badges(s)}${rng}</button>`;
    };
    // what it does from the start of the fight, first (owner, 2026-11-27: the Ravalame's Fanatisme, hit by an enemy
    // it takes 1 turn off Frappe Cardinale): « Passif » in the range's column, its sheet on hover like the others
    const passiveRow = passive
      ? `<button class="sp passive" aria-pressed="false"${show.hoverPeek ? "" : ` title="${esc(`${t("spells.passive")} · ${passive.name}`)}"`} aria-label="${esc(`${t("spells.passive")} · ${passive.name}`)}" data-spell="${passive.id}">${face(passive)}<span class="spn">${esc(passive.name)}</span>${badges(passive)}<span class="rng">${esc(t("spells.passive"))}</span><span class="mks"></span></button>`
      : "";
    const rest = hits.slice(SPELL_ROWS);
    const folded = rest.length
      ? `<details class="spmore" data-monster="${m.id}"><summary>${esc(t(rest.length > 1 ? "spells.more" : "spells.moreOne", { count: rest.length }))}</summary><div class="spells">${rest.map(row).join("")}</div></details>`
      : "";
    parts.push(`<div class="spells">${passiveRow}${hits.slice(0, SPELL_ROWS).map(row).join("")}</div>${folded}`);
  }
  return `<div class="${cls}" data-monster="${m.id}"${more} data-open="true">${parts.join("")}</div>`;
}

/** The spell a monster casts as the fight begins (Monster.startSpellId), when it says more than the states already on
 * their line: Boostache's only puts Enraciné and Lourd, the Ravalame's Fanatisme reacts to every enemy hit. */
export function passiveSpell(m: Monster, spells: Map<number, Spell>): Spell | null {
  const sp = m.startSpellId === undefined ? undefined : spells.get(m.startSpellId);
  if (!sp?.effects.length) return null;
  const onLine = new Set((m.states ?? []).map((st) => st.name));
  // « État Lourd », « Rooted state »: a state put on for good, already on the states line
  const said = (text: string) => [...onLine].some((n) => text === `État ${n}` || text === `${n} state`);
  return sp.effects.some((e) => e.trigger || e.then?.length || !said(e.text)) ? sp : null;
}

/** The preview shown beside the panel when a folded monster is hovered: its whole card, as it reads unfolded (its
 * numbers, resistances, badges, summary and spells; owner, 2026-11-26: the badges alone left the spells out). The
 * chevron is hidden there (styles.css `.mob.peek`). */
export function renderPeek(m: Monster, spells: Map<number, Spell>, summary: MonsterSummary | undefined, show: Display, icon: IconUrl, vocab: Vocabulary): string {
  const card = renderMonster(m, spells, summary, show, icon, true, vocab);
  // a preview cannot be clicked (the pointer never reaches it): « + N autres sorts » comes unfolded
  return card.replace(/^<div class="mob\b/, '<div class="mob peek').replace(/<details class="spmore"/g, '<details class="spmore" open');
}

/** Tags from the vocabulary as badges: danger, then tip, then mechanic; unknown ids skipped; "" when none shown. */
/** A badge's icon: a state badge (« Met en état · Pesanteur ») shows its first state's own icon when known, other
 * badges their tag's icon. */
function tagIcon(tag: Tag, spec: TagSpec, vocab: Vocabulary): string | null {
  if ((tag.id === "inflicts" || tag.id === "state") && tag.param && vocab.stateIcons) {
    const first = tag.param.trim().split(/,\s*/)[0];
    const name = Object.keys(vocab.stateIcons)
      .filter((k) => k !== "_note" && (first === k || first.startsWith(`${k} `)))
      .sort((a, b) => b.length - a.length)[0];
    if (name) return vocab.stateIcons[name];
  }
  return spec.icon;
}

/** A folded monster's danger badges as small icons (at most 3, then « +N »), the labels in its tooltip and its
 * accessible name. "" when it has none or the danger badges are hidden. */
function dangerCue(summary: MonsterSummary | undefined, vocab: Vocabulary, show: Display, icon: IconUrl): string {
  if (!show.tagsDanger) return "";
  const danger = (summary?.tags ?? []).filter((tag) => vocab.tags[tag.id]?.category === "danger");
  if (!danger.length) return "";
  const labels = danger.map((tag) => frenchSpaces(tagLabel(vocab.tags[tag.id])) + (tag.param?.trim() ? ` · ${frenchSpaces(tag.param.trim())}` : ""));
  const icons = danger.slice(0, 3).map((tag) => {
    const path = tagIcon(tag, vocab.tags[tag.id], vocab);
    return `<span class="ic-d">${(path ? img(icon, path) : "") || '<i class="dot" aria-hidden="true"></i>'}</span>`;
  });
  const more = danger.length > 3 ? `<small>+${danger.length - 3}</small>` : "";
  const all = esc(labels.join(", "));
  return `<span class="mdanger" title="${all}" aria-label="${all}">${icons.join("")}${more}</span>`;
}

export function renderTags(list: Tag[], vocab: Vocabulary, show: Display, icon: IconUrl, cls = "tags"): string {
  const known = list.filter((tag) => vocab.tags[tag.id]);
  const tags = TAG_ORDER.flatMap((k) => (show[TAG_SHOWN[k]] ? known.filter((tag) => vocab.tags[tag.id].category === k) : []));
  if (!tags.length) return "";
  // every badge is shown, however many (owner, 2026-11-24): danger, then mechanic, then tip
  const badge = (tag: Tag) => {
    const spec = vocab.tags[tag.id];
    // no icon (or a missing file): a small dot in the badge's colour keeps the labels aligned
    const path = tagIcon(tag, spec, vocab);
    const ic = (path ? img(icon, path) : "") || '<i class="dot" aria-hidden="true"></i>';
    const param = tag.param?.trim() ? ` · ${escText(frenchSpaces(tag.param.trim()))}` : "";
    // the category is told by colour on screen, and in words to screen readers
    const kind = `<span class="sr-only">${esc(t(TAG_KIND_LABEL[spec.category]))}, </span>`;
    // a phase badge with HP thresholds says just them: « Change de phase · 70 % | 30 % » (owner, 2026-11-19)
    const steps = tag.id === "phase" ? phaseThresholds([tag.param ?? ""]) : [];
    const shown = steps.length ? ` · ${escText(frenchSpaces(steps.map((p) => `${p} %`).join(" | ")))}` : param;
    return `<span class="tag ${spec.category}">${kind}${ic}${escText(frenchSpaces(tagLabel(spec)))}${shown}</span>`;
  };
  return `<div class="${cls}">${tags.map(badge).join("")}</div>`;
}

/** The HP percentages at which a monster changes phase, read off its « Change de phase » badges: only those after
 * « à » / « at » (« à 75, 50 et 25 % PV », « à 70 % et 40 % PV »), not a heal or another percentage (« soin 25 % »). */
export function phaseThresholds(phases: string[]): number[] {
  const out: number[] = [];
  for (const text of phases) {
    for (const m of text.matchAll(/(?<![\p{L}])(?:à|at)\s+((?:\d+\s*%?\s*(?:,|et|and)\s*)*\d+)\s*%/giu)) {
      for (const n of m[1].match(/\d+/g) ?? []) out.push(Number(n));
    }
  }
  return [...new Set(out)].sort((a, b) => b - a);
}
