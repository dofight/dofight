import { t } from "../i18n";
import { icon } from "./icons";

/** The bar at the top of a pinned sheet: the only part that moves or detaches it, so everything under it, the title
 * too, can be selected and copied (owner, 2026-11-22). A hover preview is never clicked: no bar. */
export function sheetBar(pinned: boolean): string {
  if (!pinned) return "";
  return `<div class="peek-bar"><span class="grip" aria-hidden="true">⠿</span><button type="button" class="peek-close" title="${t("peek.close")}" aria-label="${t("peek.close")}">${icon("close")}</button></div>`;
}

/** True when a press on `target` may move the sheet: on its bar, not on its ✕. */
export function startsSheetDrag(target: Element): boolean {
  return !!target.closest(".peek-bar") && !target.closest("button, a");
}
