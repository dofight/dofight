import { t, type Key } from "../i18n";
import { mainZone, rangeMarks } from "../reach";
import { icon as navIcon } from "./icons";
import type { Spell } from "../types";
import { esc, img, type IconUrl } from "./html";
import { renderZone, zoneLabel } from "./zone";

/** A spell's sheet. First what decides where to stand: its range, how the range is shaped (in a line, in a diagonal,
 * line of sight) and its area; then its cost, its effects and its limits. */
export function renderSpellSheet(sp: Spell, icon: IconUrl): string {
  const range = sp.rangeMin === sp.rangeMax ? `${sp.rangeMax}` : `${sp.rangeMin}–${sp.rangeMax}`;
  const head = `<div class="prange"><span class="po">${esc(t("spell.range", { range }))}</span></div>`;
  const around = sp.rangeMax === 0;
  const zone = mainZone(sp);
  const marks = rangeMarks(sp);
  const pills = [
    ...marks.filter((k) => k.icon !== "noSight").map((k) => `<span class="shape warn">${navIcon(k.icon)}${esc(k.label)}</span>`),
    sp.rangeMax > 1
      ? sp.lineOfSight ? `<span class="shape">${esc(t("reach.sight"))}</span>` : `<span class="shape warn">${navIcon("noSight")}${esc(t("reach.noSight"))}</span>`
      : "",
    `<span class="shape">${renderZone(zone, around)}${esc(zoneLabel(zone, around))}</span>`,
    sp.editableRange ? `<span class="shape">${esc(t("reach.editable"))}</span>` : "",
  ].join("");
  const stats = [
    `<span>${img(icon, "spell/cost.webp")}${t("spell.ap", { ap: sp.ap })}</span>`,
    sp.critical ? `<span>${img(icon, "spell/critical.webp")}${t("spell.critical", { critical: sp.critical })}</span>` : "",
  ].join("");
  const effects = sp.effects
    .map((e) => {
      const dispellable = esc(t("spell.dispellable"));
      const disp = e.dispellable ? img(icon, "spell/dispell/1.webp", `class="disp" title="${dispellable}"`) || `<span class="disp" title="${dispellable}">↺</span>` : "";
      const who = e.target ? `<span class="who ${e.target}" title="${esc(zoneLabel(e.zone, around))}">${t(`who.${e.target}` as Key)}</span>` : "";
      return `<div class="eff">${img(icon, `spell/effect/${e.icon}.webp`) || "<i></i>"}<span>${esc(e.text)}</span>${who}${renderZone(e.zone, around)}${disp}</div>`;
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
  return `<div class="pop"><b class="pname">${esc(sp.name)}</b>${head}<div class="pshape">${pills}</div><div class="pstats">${stats}</div>${effects ? `<div class="effs">${effects}</div>` : ""}${limits.length ? `<div class="plim">${limits.map((l) => `<span>${esc(l)}</span>`).join("")}</div>` : ""}${conditions}</div>`;
}
