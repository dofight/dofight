/** The unit windows are measured and placed in: the screen's pixels on Windows, points on a Mac.
 *
 * On Windows pixels are the one space every monitor shares (each with its own DPI). On a Mac they are not: Tauri's
 * « physical » values are each some screen's pixels, a window's at the scale of the screen it is on, the pointer's at
 * the main display's, a monitor's at its own, and a physical size given to a window is read at that window's scale
 * (tao 0.37). With a Retina screen beside a 1x one, two of them compared or copied were off by two: the panel came
 * back at half its size, sheets were placed at half their place (owner's Mac, 2026-11-28). Points are the Mac's
 * global space. */

import { LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { getPlatform } from "./i18n";

const points = () => getPlatform() === "macos";

/** A value Tauri measured in pixels at `scale` (the window's, the monitor's, the main display's for the pointer), in
 * screen units. */
export const toUnits = (pixels: number, scale: number): number => (points() ? pixels / scale : pixels);

/** Screen units in one CSS pixel of a page drawn at `scale` (before its own zoom). */
export const unitsPerPx = (scale: number): number => (points() ? 1 : scale);

/** A rectangle Tauri measured in pixels at `scale`, in screen units. */
export function rectInUnits(
  r: { x: number; y: number; width: number; height: number },
  scale: number,
): { x: number; y: number; width: number; height: number } {
  return { x: toUnits(r.x, scale), y: toUnits(r.y, scale), width: toUnits(r.width, scale), height: toUnits(r.height, scale) };
}

/** A size in screen units, as Tauri takes it. */
export const unitSize = (width: number, height: number) =>
  points() ? new LogicalSize(width, height) : new PhysicalSize(width, height);

/** A position in screen units, as Tauri takes it. */
export const unitPosition = (x: number, y: number) =>
  points() ? new LogicalPosition(x, y) : new PhysicalPosition(x, y);

/** Where the pointer is in a window's page (CSS pixels before its own zoom), or null when it is outside. `pointer` at
 * `pointerScale` as Tauri gives it (the main display's on a Mac), the window's inside at its own `scale`: on a Mac with
 * the panel on a Retina screen and a 1x main display, the two differ by two and the pointer was never found over the
 * panel, nor ever left it. */
export function pointerInPage(
  pointer: { x: number; y: number },
  pointerScale: number,
  origin: { x: number; y: number },
  size: { width: number; height: number },
  scale: number,
): { x: number; y: number } | null {
  const at = { x: toUnits(pointer.x, pointerScale), y: toUnits(pointer.y, pointerScale) };
  const box = rectInUnits({ ...origin, ...size }, scale);
  if (at.x < box.x || at.x >= box.x + box.width || at.y < box.y || at.y >= box.y + box.height) return null;
  const px = unitsPerPx(scale);
  return { x: (at.x - box.x) / px, y: (at.y - box.y) / px };
}
