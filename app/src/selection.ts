// Text a player can select in the panel, to paste it to other players (owner, 2026-11-22): monster names, the zone's
// header, strategy, summaries and badges. A press on these selects instead of moving the window (drag.ts), and what
// is selected is copied when the mouse is released. styles.css makes the same list `user-select:text` (a test checks).
export const SELECTABLE = ".mname, .dj, .strat, .detail, .tag, .empty";

/** The selection, trimmed, when it lies inside `root` and holds two characters or more; "" otherwise (a stray
 * swipe does not overwrite a /travel command copied just before). */
export function copyableSelection(sel: Selection | null, root: Element): string {
  if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return "";
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return "";
  const text = selectedText(sel).trim();
  return text.length >= 2 ? text : "";
}

const BLOCKS = new Set(["LI", "P", "DIV", "SECTION", "H3", "OL", "UL", "BR"]);

/** The selected text, a copy button in it giving its command (owner review, 2026-11-23): « Aller en [3,-17] » and a
 * zaap button named « Cité d'Astrub » paste as « /travel 3 -17 » and « /zaap 5 -18 ; /travel 3 -17 », not as their
 * labels, icons or « Copié ». A block (a route step, a requirement line) is a line of its own. Without a button: the
 * browser's own text. */
function selectedText(sel: Selection): string {
  if (!sel.rangeCount) return sel.toString();
  const range = sel.getRangeAt(0);
  // inside one button (a few letters of its label): its command
  const common = range.commonAncestorContainer;
  const inside = (common.nodeType === Node.ELEMENT_NODE ? (common as Element) : common.parentElement)?.closest<HTMLElement>("[data-copy]");
  if (inside) return inside.dataset.copy ?? "";
  const frag = range.cloneContents();
  if (!frag.querySelector("[data-copy]")) return sel.toString();
  // a button partly selected is cloned with its attributes: its whole command is copied
  frag.querySelectorAll<HTMLElement>("[data-copy]").forEach((b) => b.replaceWith(` ${b.dataset.copy} `));
  frag.querySelectorAll("img, svg").forEach((x) => x.remove());
  let out = "";
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) { out += n.textContent ?? ""; return; }
    const block = BLOCKS.has((n as Element).tagName);
    if (block) out += "\n";
    n.childNodes.forEach(walk);
    if (block) out += "\n";
  };
  frag.childNodes.forEach(walk);
  return out.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

/** True when some text is selected inside `el`: the click that ends a selection on a card's name does not fold it. */
export function selectionTouches(el: Element): boolean {
  const sel = el.ownerDocument.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  return sel.getRangeAt(0).intersectsNode(el);
}

/** copyableSelection, then unselected once taken: the highlight would stay on the panel otherwise (owner,
 * 2026-11-22). A selection too short to copy is left as it is. Unselected just after, not at once: the click that
 * follows the release must still see it, or a name selected in a card's header would fold the card. */
export function takeSelection(sel: Selection | null, root: Element): string {
  const text = copyableSelection(sel, root);
  if (text) setTimeout(() => sel!.removeAllRanges(), 0);
  return text;
}
