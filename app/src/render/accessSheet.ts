import type { PlaceAccess, Req, Text } from "../access";
import { frenchSpaces, getLang, t } from "../i18n";
import { renderRoute, renderTrip, routeOf, travelCommand, type Trip } from "../travel";
import { esc, escText } from "./html";
import { icon } from "./icons";

/* « Comment y aller » (owner, 2026-11-20): what a dungeon or zone needs before going there, then the way there, in
 * the side window beside the panel (pinned by a click on the header's button, as a mechanic sheet). */

const say = (text: Text): string => (getLang() === "en" ? text.en : text.fr) || text.fr;
const line = (text: string): string => escText(frenchSpaces(text));

function copyButton(command: string): string {
  return `<button type="button" class="travel" data-copy="${esc(command)}" title="${esc(t("trip.copy", { command }))}"><span class="lbl">${esc(command)}</span>${icon("copy")}</button>`;
}

function req(r: Req): string {
  if ("quest" in r) {
    const q = r.quest;
    const go = q.start ? ` ${copyButton(travelCommand({ x: q.start.x, y: q.start.y, world: 1 }))}` : "";
    return `<li>${line(`${say(q)} (${t("access.questLevel", { level: q.level })})`)}${go}</li>`;
  }
  if ("beat" in r) return `<li>${line(t("access.beat", { name: say(r.beat) }))}</li>`;
  if ("item" in r) return `<li><b>${line(say(r.item))}</b>${r.how ? line(` : ${say(r.how)}`) : ""}</li>`;
  if ("level" in r) return `<li>${line(t("access.levelMin", { level: r.level }))}</li>`;
  if ("other" in r) return `<li>${line(say(r.other))}</li>`;
  if ("event" in r) return `<li class="event">${line(say(r.event))}</li>`;
  return `<li>${line(t("access.anyOf"))}<ul>${r.anyOf.map(req).join("")}</ul></li>`;
}

const list = (head: string, reqs: Req[]): string =>
  reqs.length ? `<div class="reqs"><span class="head">${line(head)}</span><ol>${reqs.map(req).join("")}</ol></div>` : "";

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
    const areaHead = pa.dimension ? t("access.dimension", { area: pa.areaName ?? "" }) : t("access.quests", { area: pa.areaName ?? "" });
    const body = (facts.length ? `<div class="facts">${line(facts.join(" · "))}</div>` : "") + list(areaHead, pa.areaReqs) + list(t("access.ownQuests"), pa.ownReqs);
    if (body) needs = `<section class="needs"><h3>${line(t("access.needs"))}</h3>${body}</section>`;
  }
  const route = trip ? routeOf(trip.to) : [];
  const way = trip ? `<section class="way"><h3>${line(t("access.route"))}</h3>${route.length ? renderRoute(route, false) : renderTrip(trip)}</section>` : "";
  const guide = pa?.guide && /^https:\/\//.test(pa.guide)
    ? `<a class="guide" href="${esc(pa.guide)}" target="_blank" rel="noopener">${esc(t("access.guide"))}${icon("external")}</a>`
    : "";
  return `<div class="mob peek access-sheet"><b class="title">${line(t("access.title", { place: title }))}</b>${needs}${way}${guide}<span class="tripmsg" role="status"></span></div>`;
}
