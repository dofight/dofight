import type { PlaceAccess, Req, Text } from "../access";
import { frenchSpaces, getLang, t } from "../i18n";
import { renderRoute, renderTrip, routeOf, type Trip } from "../travel";
import { esc, escText } from "./html";
import { icon } from "./icons";

/* « Comment y aller » (owner, 2026-11-20): what a dungeon or zone needs before going there, then the way there, in
 * the side window beside the panel (pinned by a click on the header's button, as a mechanic sheet). */

const say = (text: Text): string => (getLang() === "en" ? text.en : text.fr) || text.fr;
const line = (text: string): string => escText(frenchSpaces(text));

function req(r: Req): string {
  if ("quest" in r) {
    const q = r.quest;
    const name = q.url && /^https:\/\//.test(q.url) ? `<a class="quest" href="${esc(q.url)}" target="_blank" rel="noopener">${line(say(q))}</a>` : line(say(q));
    return `<li>${name} ${line(`(${t("access.questLevel", { level: q.level })})`)}</li>`; // no /travel to the quest giver (owner, 2026-11-20): the quest page says where
  }
  if ("beat" in r) return `<li>${line(t("access.beat", { name: say(r.beat) }))}</li>`;
  if ("item" in r) return `<li><b>${line(say(r.item))}</b>${r.how ? line(` : ${say(r.how)}`) : ""}</li>`;
  if ("level" in r) return `<li>${line(t("access.levelMin", { level: r.level }))}</li>`;
  if ("other" in r) return `<li>${line(say(r.other))}</li>`;
  if ("event" in r) return `<li class="event">${line(say(r.event))}</li>`;
  return `<li>${line(t("access.anyOf"))}<ul>${r.anyOf.map(req).join("")}</ul></li>`;
}

const list = (head: string, reqs: Req[]): string =>
  reqs.length ? `<div class="reqs">${head ? `<span class="head">${line(head)}</span>` : ""}<ol>${reqs.map(req).join("")}</ol></div>` : "";

/** The sheet of `title`: « Prérequis » (level and key, the area's requirements, the place's own), then « Trajet »
 * (the written route, else « Aller en » and the nearest zaap), then the guide. `pa` null: the route only. */
export function renderAccessSheet(title: string, pa: PlaceAccess | null, trip: Trip | null): string {
  let needs = "";
  if (pa) {
    const facts = [
      pa.level !== null ? t("access.level", { level: pa.level }) : "",
      pa.key ? say(pa.key) : "",
      pa.key && pa.offKeyring ? t("access.offKeyring") : "",
    ].filter(Boolean);
    const area = (getLang() === "en" && pa.areaEn) || pa.areaName || "";
    const areaHead = pa.dimension ? t("access.dimension", { area }) : t("access.quests", { area });
    const body = (facts.length ? `<div class="facts">${line(facts.join(" · "))}</div>` : "") + list(areaHead, pa.areaReqs) + list("", pa.ownReqs);
    if (body) needs = `<section class="needs"><h3>${line(t("access.needs"))}</h3>${body}</section>`;
  }
  const route = trip ? routeOf(trip.to) : [];
  const way = trip ? `<section class="way"><h3>${line(t("access.route"))}</h3>${route.length ? renderRoute(route, false) : renderTrip(trip)}</section>` : "";
  const guide = pa?.guide && /^https:\/\//.test(pa.guide)
    ? `<a class="guide" href="${esc(pa.guide)}" target="_blank" rel="noopener">${esc(t("access.guide"))}${icon("external")}</a>`
    : "";
  return `<div class="mob peek access-sheet"><b class="title">${line(t("access.title", { place: title }))}</b>${needs}${way}${guide}</div>`;
}

/** A click in the side window on one of the sheet's copy buttons: the command goes to the panel (`send`), which owns
 * the clipboard (this window cannot take the focus) and answers with `sheetCopied`. False when the click was not on a
 * copy button. */
export function sheetCopy(target: Element, send: (command: string) => void): boolean {
  const command = target.closest<HTMLElement>(".access-sheet .travel")?.dataset.copy;
  if (!command) return false;
  send(command);
  return true;
}

let copiedTimer: number | undefined;

/** The panel's answer to a copy: « Copié » right after the button (or « Copie impossible » when the clipboard refused),
 * for 2 s, as in the header. */
export function sheetCopied(root: ParentNode, command: string, ok: boolean): void {
  const button = [...root.querySelectorAll<HTMLElement>(".access-sheet .travel")].find((b) => b.dataset.copy === command);
  root.querySelectorAll(".access-sheet .copied").forEach((b) => b.classList.remove("copied"));
  root.querySelectorAll(".access-sheet .copied-tag").forEach((tag) => tag.remove());
  if (!button) return;
  if (ok) button.classList.add("copied");
  const tag = document.createElement("span");
  tag.className = ok ? "copied-tag" : "copied-tag failed";
  tag.setAttribute("role", "status");
  tag.textContent = t(ok ? "access.copied" : "access.copyFailed");
  button.after(tag);
  window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    button.classList.remove("copied");
    tag.remove();
  }, 2000);
}
