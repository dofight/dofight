/** The dev debug window (debug.html, dev builds only): a red box around each area the reader just read. */

export interface DebugAreas {
  /** Where the read frame's top left is on screen, in the reader's pixels; null when unknown. */
  origin: [number, number] | null;
  /** x, y, width, height in the frame's pixels: the header corner, then each tooltip Songe found. */
  areas: [number, number, number, number][];
}

/** One box to draw, in CSS pixels. */
export interface DebugBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The boxes to draw (`scale`: reader pixels per CSS pixel, the screen's on Windows, 1 on macOS). */
export function debugBoxes(d: DebugAreas, scale: number): DebugBox[] {
  if (!d.origin) return [];
  const px = (v: number) => Math.round(v / scale);
  return d.areas.map(([x, y, w, h]) => ({ left: px(d.origin![0] + x), top: px(d.origin![1] + y), width: px(w), height: px(h) }));
}

/** The boxes as elements, their size and place set through the stylesheet object and never as a `style` attribute:
 * an attribute written into the page is subject to the content security policy, and WebKit dropped it — the boxes
 * were in the page, visible, and six pixels wide (their borders alone) at 0,0 (owner, 2026-11-21). */
export function debugElements(boxes: DebugBox[]): HTMLElement[] {
  return boxes.map((b) => {
    const el = document.createElement("div");
    el.className = "area";
    el.style.left = `${b.left}px`;
    el.style.top = `${b.top}px`;
    el.style.width = `${b.width}px`;
    el.style.height = `${b.height}px`;
    return el;
  });
}
