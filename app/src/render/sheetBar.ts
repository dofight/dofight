import { t } from "../i18n";
import { icon } from "./icons";

/** The bar at the top of a pinned sheet: the only part that moves or detaches it, so everything under it, the title
 * too, can be selected and copied (owner, 2026-11-22). A hover preview is never clicked: no bar. */
export function sheetBar(pinned: boolean, head = ""): string {
  if (!pinned) return "";
  return `<div class="peek-bar" title="${t("peek.detach")}"><span class="grip" aria-hidden="true"></span>${head ? `<span class="bar-head">${head}</span>` : ""}<button type="button" class="peek-close" title="${t("peek.close")}" aria-label="${t("peek.close")}">${icon("close")}</button></div>`;
}

/** A pinned spell sheet's name and range, taken out of its body for its bar (owner, 2026-11-27): the sheet starts
 * with what matters, and the bar is no longer an empty strip. In the bar they cannot be selected and copied, which
 * the owner accepts. Any other sheet keeps its title: "". */
export function barHead(card: Element): string {
  if (!card.classList.contains("pop")) return "";
  const parts = [card.querySelector(":scope > .pname"), card.querySelector(":scope > .prange")].filter((e): e is Element => !!e);
  const html = parts.map((e) => e.outerHTML).join("");
  parts.forEach((e) => e.remove());
  return html;
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
