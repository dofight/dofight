import { SELECTABLE } from "./selection";

const CONTROLS = "input, button, a, select, textarea, label, [contenteditable], .edge";

/** True when a press on `target` may move the window: anything but a control or text the player can select. */
export function startsDrag(target: HTMLElement): boolean {
  return !target.closest(CONTROLS) && !target.closest(SELECTABLE);
}

/** Press and move more than 4 px on a non-control moves the window; a plain click stays a click. */
export function enableDragAnywhere(startDragging: () => Promise<void>): void {
  let start: { x: number; y: number } | null = null;
  document.addEventListener("mousedown", (e) => {
    start = e.button === 0 && startsDrag(e.target as HTMLElement) ? { x: e.screenX, y: e.screenY } : null;
  });
  document.addEventListener("mousemove", (e) => {
    if (start && Math.hypot(e.screenX - start.x, e.screenY - start.y) > 4) {
      start = null;
      void startDragging();
    }
  });
  document.addEventListener("mouseup", () => (start = null));
}
