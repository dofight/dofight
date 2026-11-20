import { frenchSpaces, getLang, kindName, t, type Key } from "../i18n";
import { levelRange } from "../search";
import type { Display, Element, Mechanic, Monster, MonsterSummary, Spell, Tag, TagKind, TagSpec, Vocabulary } from "../types";
import { renderMechanicChips } from "./mechanic";
import { CATEGORY_ICON, categoryName, esc, escText, img, prose, type IconUrl } from "./html";
import { icon as navIcon } from "./icons";
import { rangeCaption, rangeMarks, sortByReach, touchesYou } from "../reach";

const TAG_ORDER: TagKind[] = ["danger", "tip", "mechanic"];
const TAG_SHOWN: Record<TagKind, keyof Display> = { danger: "tagsDanger", tip: "tagsTip", mechanic: "tagsMechanic" };
const TAG_KIND_LABEL: Record<TagKind, Key> = { danger: "opt.tagsDanger", tip: "opt.tagsTip", mechanic: "opt.tagsMechanic" };
const ELEMENTS: [Element, string][] = [["n", "neutral"], ["e", "earth"], ["f", "fire"], ["w", "water"], ["a", "air"]];

/** A small label after the name for monsters that are not the zone's own (« Avis de recherche », « Spécial »…), the
 * same as in the search results. */
const kindTag = (kind: NonNullable<Monster["kind"]>) => kindName(kind);

/** A badge's label in the interface language (the French one when an English label is missing). */
export const tagLabel = (spec: TagSpec): string => (getLang() === "en" && spec.labelEn ? spec.labelEn : spec.label);

const range = (a: number, b: number) => (a === b ? `${a}` : `${a} – ${b}`).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

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
): string {
  const parts: string[] = [];
  const kind = summon ? t("monster.summonOf") : kindTag(m.kind ?? "normal");
  const kindTitle = summon ? ` title="${esc(summon.of)}"` : "";
  const cls = `mob${m.boss || summon ? " boss" : ""}${summon ? " summon" : ""}`;
  const more = summons?.length ? ` data-summons="${summons.join(",")}"` : "";
  const thumb = show.thumbnails ? img(icon, `monsters/${m.id}.webp`, 'class="thumb"') : "";
  // folded: its danger badges as icons on the line (at most 3, then « +N »), so the list warns without opening
  const cue = open ? "" : dangerCue(summary, vocab, show, icon);
  parts.push(`<div class="mh" role="button" tabindex="0" aria-expanded="${open}">${thumb}<span class="mtitle"><span class="mline"><span class="mname">${esc(m.name)}</span>${count && count > 1 ? `<small class="mcount">×${count}</small>` : ""}</span>${kind ? `<small class="mkind"${kindTitle}>${esc(kind)}</small>` : ""}</span>${cue}<span class="chev" aria-hidden="true">${navIcon("chevron")}</span></div>`);
  if (!open) return `<div class="${cls}" data-monster="${m.id}"${more} data-open="false">${parts.join("")}</div>`;
  // its phases (the « Change de phase » badges): beside its HP, each one on hover (owner, 2026-11-19)
  const phases = (summary?.tags ?? []).filter((tag) => tag.id === "phase").map((tag) => frenchSpaces(tag.param?.trim() ?? "")).filter(Boolean);
  const phaseSpan = phases.length
    ? `<span class="phase" tabindex="0" title="${esc(`${t("monster.phasesTitle")} ${phases.join(" ; ")}`)}">${img(icon, "badges/phase.webp")}${esc(t("monster.phases"))}</span>`
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
  // (shown beside the HP, the phases leave the badges)
  const shownTags = show.details && phases.length ? (summary?.tags ?? []).filter((tag) => tag.id !== "phase") : (summary?.tags ?? []);
  const tags = renderTags(shownTags, vocab, show, icon);
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
  const own = sortByReach(m.spellIds.map((id) => spells.get(id)).filter((s): s is Spell => !!s), m.mp);
  if (show.spells && own.length) {
    parts.push(
      `<div class="spells">${own
        .map((s) => {
          const badges = show.spellBadges
            ? `<span class="cats">${s.categories.map((c) => img(icon, `spell/effect/${CATEGORY_ICON[c]}.webp`, `class="c-${c.split("_")[0]}" title="${esc(categoryName(c))}"`)).join("")}</span>`
            : "";
          const face = img(icon, `spells/${s.spellId ?? s.id}.webp`) || `<span class="abbr">${esc(s.name.slice(0, 4))}</span>`;
          // its range and how it is shaped (in a line, a diagonal, without line of sight), read at a glance
          const marks = rangeMarks(s);
          const shape = marks.map((k) => `<span class="mk" title="${esc(k.label)}">${navIcon(k.icon)}</span>`).join("");
          const rng = `<span class="rng">${esc(rangeCaption(s))}${shape}</span>`;
          const label = [s.name, rangeCaption(s), ...marks.map((k) => k.label)].join(" · ");
          const off = touchesYou(s) ? "" : " off";
          // with the hover preview on, its sheet shows beside the panel: a native tooltip would cover it
          const title = show.hoverPeek ? "" : ` title="${esc(label)}"`;
          return `<button class="sp${off}" aria-pressed="false"${title} aria-label="${esc(label)}" data-spell="${s.id}">${face}${rng}${badges}</button>`;
        })
        .join("")}</div>`,
    );
  }
  return `<div class="${cls}" data-monster="${m.id}"${more} data-open="true">${parts.join("")}</div>`;
}

/** The preview shown beside the panel when a folded monster is hovered: only its badges (the kinds the player shows)
 * and its written summary, never its name, numbers or spells (the row already names it). "" when there is nothing to
 * show, or when every kind of badge is hidden (the player turned the badges off: no preview either). */
export function renderPeek(m: Monster, summary: MonsterSummary | undefined, show: Display, icon: IconUrl, vocab: Vocabulary): string {
  if (!TAG_ORDER.some((k) => show[TAG_SHOWN[k]])) return "";
  const parts: string[] = [];
  const tags = renderTags(summary?.tags ?? [], vocab, show, icon);
  if (tags) parts.push(tags);
  else if (summary && summary.tags.length === 0) parts.push(`<div class="empty">${t("monster.harmless")}</div>`);
  if (summary?.detail) parts.push(prose(frenchSpaces(summary.detail), "detail"));
  return parts.length ? `<div class="mob peek${m.boss ? " boss" : ""}">${parts.join("")}</div>` : "";
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
  return `<div class="${cls}">${tags
    .map((tag) => {
      const spec = vocab.tags[tag.id];
      // no icon (or a missing file): a small dot in the badge's colour keeps the labels aligned
      const path = tagIcon(tag, spec, vocab);
      const ic = (path ? img(icon, path) : "") || '<i class="dot" aria-hidden="true"></i>';
      const param = tag.param?.trim() ? ` · ${escText(frenchSpaces(tag.param.trim()))}` : "";
      // the category is told by colour on screen, and in words to screen readers
      const kind = `<span class="sr-only">${esc(t(TAG_KIND_LABEL[spec.category]))}, </span>`;
      return `<span class="tag ${spec.category}">${kind}${ic}${escText(frenchSpaces(tagLabel(spec)))}${param}</span>`;
    })
    .join("")}</div>`;
}
