import { t, type Key } from "../i18n";
import { mainZone, rangeMarks, rangeSpan } from "../reach";
import { icon as navIcon } from "./icons";
import type { Spell, SpellEffect } from "../types";
import { esc, img, type IconUrl } from "./html";
import { spellGrid, thumbRadius, zonesDiffer, zoneThumb } from "./spellGrid";
import { zoneLabel } from "./zone";

/** A spell's sheet. First what decides where to stand: its range, how the range is shaped (in a line, in a diagonal,
 * line of sight) and its area; then its cost, its effects and its limits. */
export function renderSpellSheet(sp: Spell, icon: IconUrl): string {
  const range = rangeSpan(sp);
  const head = `<div class="prange"><span class="po">${esc(t("spell.range", { range }))}</span></div>`;
  const around = sp.rangeMax === 0;
  const zone = mainZone(sp);
  const marks = rangeMarks(sp);
  const pills = [
    ...marks.filter((k) => k.icon !== "noSight").map((k) => `<span class="shape warn">${navIcon(k.icon)}${esc(k.label)}</span>`),
    // line of sight is the rule: only its absence is said (owner, 2026-11-26)
    sp.rangeMax > 1 && !sp.lineOfSight ? `<span class="shape warn">${navIcon("noSight")}${esc(t("reach.noSight"))}</span>` : "",
    // a single cell needs no pill (« Case ciblée », « Sur lui »): the drawing shows it (owner, 2026-11-26)
    zone ? `<span class="shape zonep${zone === "toute la carte" ? " whole" : ""}">${esc(zoneLabel(zone, around))}</span>` : "",
    sp.editableRange ? `<span class="shape">${esc(t("reach.editable"))}</span>` : "",
  ].join("");
  const stats = [
    `<span>${img(icon, "spell/cost.webp")}${t("spell.ap", { ap: sp.ap })}</span>`,
    sp.critical ? `<span>${img(icon, "spell/critical.webp")}${t("spell.critical", { critical: sp.critical })}</span>` : "",
  ].join("");
  // the rows: each effect, then under it the effects of the spell it casts (`then`, indented)
  const rows: { e: SpellEffect; sub: boolean }[] = [];
  const add = (list: SpellEffect[], sub: boolean) => list.forEach((e) => { rows.push({ e, sub }); add(e.then ?? [], true); });
  add(sp.effects, false);
  // effects with different zones: each row draws its own, all at one size (render/spellGrid.ts zoneThumb); a nested
  // effect's zone is never in the big drawing, so it always draws its own
  const thumbs = zonesDiffer(sp.effects);
  const radius = thumbRadius(rows.filter((r) => thumbs || r.sub).map((r) => r.e.zone));
  const effects = rows
    .map(({ e, sub }) => {
      const dispellable = esc(t("spell.dispellable"));
      const disp = e.dispellable ? img(icon, "spell/dispell/1.webp", `class="disp" title="${dispellable}"`) || `<span class="disp" title="${dispellable}">↺</span>` : "";
      const who = e.target ? `<span class="who ${e.target}" title="${esc(zoneLabel(e.zone, around))}">${t(`who.${e.target}` as Key)}</span>` : "";
      const thumb = thumbs || (sub && e.zone) ? zoneThumb(e.zone, around || e.target === "self", radius) : "";
      const when = e.trigger ? `<b class="when">${esc(t("spell.trigger", { when: e.trigger }))}</b> ` : "";
      // its area only reaches what the caster sees (the Ravalame's Frappe Cardinale, over the whole map)
      const sight = e.inSight ? ` <small class="insight" title="${esc(t("spell.inSightTip"))}">${navIcon("sight")}${esc(t("spell.inSight"))}</small>` : "";
      return `<div class="eff${sub ? " sub" : ""}">${img(icon, `spell/effect/${e.icon}.webp`) || "<i></i>"}<span>${when}${esc(e.text)}${sight}</span>${disp}${who}${thumb}</div>`;
    })
    .join("");
  const limits: string[] = [];
  if (sp.perTurn) limits.push(t("spell.perTurn", { count: sp.perTurn }));
  if (sp.perTarget) limits.push(t("spell.perTarget", { count: sp.perTarget }));
  if (sp.cooldown) limits.push(t(sp.cooldown > 1 ? "spell.cooldownMany" : "spell.cooldownOne", { count: sp.cooldown }));
  if (sp.initialCooldown) limits.push(t("spell.initialCooldown", { turn: sp.initialCooldown + 1 }));
  const conditions = sp.conditions.length
    ? `<div class="pcond"><span class="k">${t(sp.conditions.length > 1 ? "spell.conditions" : "spell.condition")}</span>${sp.conditions.map((c) => `<span>${esc(c)}</span>`).join("")}</div>`
    : "";
  // the spell drawn: where it can be cast from, and what it hits (render/spellGrid.ts)
  const legend = [["me", "grid.caster"], ["rg", "grid.range"], ["ar", "grid.area"], ["tg", "grid.target"]]
    // the target's swatch in its own colour: the caster's, lighter, when the spell is cast on itself
    .map(([cls, key]) => `<span><i class="sw ${cls}${cls === "tg" && around ? " self" : ""}"></i>${esc(t(key as Key))}</span>`).join("");
  const grid = `<div class="pgrid">${spellGrid(sp, "big")}</div><div class="plegend">${legend}</div>`;
  return `<div class="pop"><b class="pname">${esc(sp.name)}</b>${head}<div class="pshape">${pills}</div>${grid}<div class="pstats">${stats}</div>${effects ? `<div class="effs${thumbs ? " zoned" : ""}">${effects}</div>` : ""}${limits.length ? `<div class="plim">${limits.map((l) => `<span>${esc(l)}</span>`).join("")}</div>` : ""}${conditions}</div>`;
}
