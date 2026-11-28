import { t } from "../i18n";
import { icon } from "./icons";

/** The bar at the top of a pinned sheet: the only part that moves or detaches it, so everything under it can be
 * selected and copied (owner, 2026-11-22). It holds the sheet's title (barHead), which is not copied (owner,
 * 2026-11-27). A hover preview is never clicked: no bar. */
export function sheetBar(pinned: boolean, head = ""): string {
  if (!pinned) return "";
  // « Réduire »: a detached sheet folds to this bar alone (owner, 2026-11-27); shown once detached (styles.css)
  const fold = `<button type="button" class="peek-fold" title="${t("peek.fold")}" aria-label="${t("peek.fold")}" aria-expanded="true">${icon("chevron")}</button>`;
  return `<div class="peek-bar" title="${t("peek.detach")}"><span class="grip" aria-hidden="true"></span>${head ? `<span class="bar-head">${head}</span>` : ""}${fold}<button type="button" class="peek-close" title="${t("peek.close")}" aria-label="${t("peek.close")}">${icon("close")}</button></div>`;
}

/** A pinned sheet's title, taken out of its body for its bar (owner, 2026-11-27): the sheet starts with what
 * matters, the bar is no longer an empty strip, and a folded or scrolled sheet still says what it is. A spell's name
 * and range; a mechanic's, « Comment y aller »'s or « Succès »'s title (its first bold line). In the bar they cannot
 * be selected and copied, which the owner accepts. A monster's card keeps its own header: "". */
export function barHead(card: Element): string {
  const sheet = card.classList.contains("peek") && !card.querySelector(":scope > .mh");
  const found = card.classList.contains("pop")
    ? [card.querySelector(":scope > .pname"), card.querySelector(":scope > .prange")]
    : sheet ? [card.querySelector(":scope > b:first-child")] : [];
  const parts = found.filter((e): e is Element => !!e);
  const html = parts.map((e) => e.outerHTML).join("");
  parts.forEach((e) => e.remove());
  return html;
}

/** The width at which a pinned sheet's bar shows its title whole, beside the grip and the ✕ (owner, 2026-11-27:
 * « Comment y aller : Antre du Korriandre » was cut when pinned): the sheet's width now, plus what the title lacks
 * (or minus what it has to spare). The title's room follows the sheet's width one for one, so this holds whatever
 * the width it was measured at, a window still the size of a wider sheet too. */
export function barWidthNeeded(sheetWidth: number, titleRoom: number, titleWidth: number): number {
  return Math.ceil(sheetWidth + titleWidth - titleRoom);
}

/** barWidthNeeded, measured on a drawn sheet: its title's room in the bar and its whole width. */
export function measureBarWidth(card: HTMLElement): number {
  const head = card.querySelector<HTMLElement>(".peek-bar .bar-head");
  if (!head) return 0;
  const room = head.getBoundingClientRect().width;
  const flex = head.style.flex;
  head.style.flex = "none"; // its whole width, nothing cut
  const whole = head.scrollWidth;
  head.style.flex = flex;
  return barWidthNeeded(card.getBoundingClientRect().width, room, whole);
}

/** True when a press on `target` may move the sheet: on its bar, not on its ✕. */
export function startsSheetDrag(target: Element): boolean {
  return !!target.closest(".peek-bar") && !target.closest("button, a");
}

/** A sheet's whole height as drawn, in CSS pixels: its cap (styles.css) lifted for the measure, so a sheet shown
 * in a window still the size of a shorter one asks for all the room it needs, with no scroll bar narrowing its text.
 * getBoundingClientRect and not offsetHeight: the page is zoomed by « Taille du texte » (html{zoom}), and only the
 * former counts the zoom (offsetHeight gave 200 for a sheet drawn 250 tall at 125 %, Fable, 2026-11-22). */
export function sheetHeight(card: HTMLElement): number {
  const cap = card.style.maxHeight;
  card.style.maxHeight = "none";
  const height = card.getBoundingClientRect().height;
  card.style.maxHeight = cap;
  return height;
}

/** True when the scrollbar takes no room of its own: the Mac's overlay scrollbars (« Afficher les barres de
 * défilement : automatiquement »), where `scrollbar-gutter:stable` reserves nothing. A sheet that can scroll keeps
 * 2 px on its right and counts on the 8 px gutter for the rest; with none its bar's ✕ stuck out and the sheet slid
 * 4 px sideways, its grip and text against the left edge (owner, 2026-11-26: inner 418 of 420, borders alone). */
export function overlayScrollbar(el: HTMLElement): boolean {
  const s = getComputedStyle(el);
  return el.offsetWidth - el.clientWidth - parseFloat(s.borderLeftWidth || "0") - parseFloat(s.borderRightWidth || "0") < 1;
}
