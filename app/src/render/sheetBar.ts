import { t } from "../i18n";
import { icon } from "./icons";

/** The bar at the top of a pinned sheet: the only part that moves or detaches it, so everything under it, the title
 * too, can be selected and copied (owner, 2026-11-22). A hover preview is never clicked: no bar. */
export function sheetBar(pinned: boolean): string {
  if (!pinned) return "";
  return `<div class="peek-bar" title="${t("peek.detach")}"><span class="grip" aria-hidden="true"></span><button type="button" class="peek-close" title="${t("peek.close")}" aria-label="${t("peek.close")}">${icon("close")}</button></div>`;
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
