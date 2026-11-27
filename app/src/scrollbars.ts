/** Scrollbars that show only while the player scrolls (owner, 2026-11-26): a scrolled element gets « scrolling » for a
 * moment, and styles.css hides its scrollbar's thumb without it. Hovering the thumb still shows it, so it can be
 * grabbed. A scroll the code makes itself (a list drawn again, the guide opened at its top) shows nothing: only one
 * that follows the wheel, a touch, a key or a press on the bar within INPUT_WINDOW. */
const SHOWN_FOR = 900;
const INPUT_WINDOW = 1000;

export function scrollbarsWhileScrolling(doc: Document = document): void {
  const win = doc.defaultView ?? window;
  const timers = new WeakMap<Element, number>();
  let input = -Infinity;
  const touched = () => (input = Date.now());
  for (const type of ["wheel", "pointerdown", "keydown", "touchmove"]) doc.addEventListener(type, touched, { capture: true, passive: true });
  doc.addEventListener(
    "scroll",
    (e) => {
      const el = e.target;
      if (!(el instanceof win.Element)) return; // the document itself has no bar of its own here
      if (Date.now() - input > INPUT_WINDOW) return; // not the player's
      el.classList.add("scrolling");
      win.clearTimeout(timers.get(el));
      timers.set(el, win.setTimeout(() => el.classList.remove("scrolling"), SHOWN_FOR));
    },
    true, // « scroll » does not bubble
  );
}
