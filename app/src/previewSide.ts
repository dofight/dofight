export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The space between the overlay and a window beside it, in CSS pixels (times the screen scale for physical ones). */
export const GAP = 4;

/** Where the preview window goes: beside the overlay, on the side of the screen with more room, kept on screen.
 * `gap`: the space left between them (in the same units as the rects). */
export function previewRect(overlay: Rect, screen: Rect, gap = 0): Rect {
  const spaceLeft = overlay.x - screen.x;
  const spaceRight = screen.x + screen.width - (overlay.x + overlay.width);
  let x = spaceLeft >= spaceRight ? overlay.x - gap - overlay.width : overlay.x + overlay.width + gap;
  x = Math.min(Math.max(x, screen.x), screen.x + screen.width - overlay.width);
  return { x, y: overlay.y, width: overlay.width, height: overlay.height };
}

/** A sheet narrower than the panel (« Succès », owner 2026-11-25): `width` at most, never wider than `side`. A sheet
 * on the panel's left keeps its edge next to the panel (at `panelX`); one on the right is cut from its far edge. */
export function narrowed(side: Rect, panelX: number, width: number): Rect {
  const w = Math.min(side.width, width);
  return { ...side, x: side.x < panelX ? side.x + side.width - w : side.x, width: w };
}

/** A side window's height in physical pixels, for a sheet `cssHeight` tall: never taller than the screen, the sheet
 * scrolls inside instead (a long « Comment y aller » went off the bottom). */
export function sideHeight(cssHeight: number, scale: number, screenHeight: number): number {
  return Math.min(Math.ceil(cssHeight * scale), screenHeight); // never a fraction short: it would scroll
}
