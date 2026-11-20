/** The dev debug window (debug.html, `pnpm tauri dev` only): a red box around each area the reader just read. */

export interface DebugAreas {
  /** Where the read frame's top left is on screen, in the reader's pixels; null when unknown. */
  origin: [number, number] | null;
  /** x, y, width, height in the frame's pixels: the header corner, Songe's area around the mouse. */
  areas: [number, number, number, number][];
}

/** The boxes as HTML, in CSS pixels (`scale`: reader pixels per CSS pixel, the screen's on Windows, 1 on macOS). */
export function debugBoxes(d: DebugAreas, scale: number): string {
  if (!d.origin) return "";
  const px = (v: number) => `${Math.round(v / scale)}px`;
  return d.areas
    .map(([x, y, w, h]) => `<div class="area" style="left:${px(d.origin![0] + x)};top:${px(d.origin![1] + y)};width:${px(w)};height:${px(h)}"></div>`)
    .join("");
}
