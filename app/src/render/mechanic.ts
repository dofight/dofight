import { frenchSpaces, t } from "../i18n";
import type { Mechanic } from "../types";
import { esc, escText } from "./html";
import { icon as navIcon } from "./icons";

/** The chips of a room's mechanics (« ⓘ Cycle lunaire »), in the room header; ids with no sheet are skipped. "" when
 * there is none. Hovering a chip previews its sheet beside the panel, a click pins it (main.ts). */
export function renderMechanicChips(ids: string[] | undefined, mechanics: Map<string, Mechanic> | undefined): string {
  const chips = (ids ?? [])
    .filter((id) => mechanics?.has(id))
    .map((id) => `<button class="mech" aria-expanded="false" data-mechanic="${esc(id)}">${navIcon("info")}${esc(mechanics!.get(id)!.title)}</button>`);
  return chips.length ? `<div class="mechs">${chips.join("")}</div>` : "";
}

/** A point of a sheet: the term before its first colon (« Pleine lune : … ») in bold, to scan the list. */
function point(text: string): string {
  const p = frenchSpaces(text);
  const term = /^([^:]{1,32}?)[\s  ]:/.exec(p);
  if (term) return `<li><b>${escText(term[1])}</b>${escText(p.slice(term[1].length))}</li>`;
  return `<li>${escText(p)}</li>`;
}

/** A mechanic's sheet, for the preview window: its title, the gist, one bullet per point. A hover preview has no link
 * (it closes when the pointer leaves the chip); a sheet pinned by a click can be reached, so it links to its guide
 * section (owner, 2026-11-18). */
export function renderMechanicSheet(m: Mechanic, opts: { link?: boolean } = {}): string {
  const points = m.points.map(point).join("");
  const guide =
    opts.link && m.guide && /^https:\/\//.test(m.guide)
      ? `<a class="guide" href="${esc(m.guide)}" target="_blank" rel="noopener">${t("room.guide")}${navIcon("external")}</a>`
      : "";
  return `<div class="mob peek mech-sheet"><b>${esc(m.title)}</b><div class="gist">${escText(frenchSpaces(m.gist))}</div><ul class="bullets">${points}</ul>${guide}</div>`;
}
