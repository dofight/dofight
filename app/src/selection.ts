// Text a player can select in the panel, to paste it to other players (owner, 2026-11-22): monster names, the zone's
// header, strategy, summaries and badges. A press on these selects instead of moving the window (drag.ts), and what
// is selected is copied when the mouse is released. styles.css makes the same list `user-select:text` (a test checks).
export const SELECTABLE = ".mname, .dj, .strat, .detail, .tag, .empty";

/** The selection, trimmed, when it lies inside `root` and holds two characters or more; "" otherwise (a stray
 * swipe does not overwrite a /travel command copied just before). */
export function copyableSelection(sel: Selection | null, root: Element): string {
  if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return "";
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return "";
  const text = sel.toString().trim();
  return text.length >= 2 ? text : "";
}

/** True when some text is selected inside `el`: the click that ends a selection on a card's name does not fold it. */
export function selectionTouches(el: Element): boolean {
  const sel = el.ownerDocument.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  return sel.getRangeAt(0).intersectsNode(el);
}
