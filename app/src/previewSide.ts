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
