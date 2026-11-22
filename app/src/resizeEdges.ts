// Resizing a window by its edges (owner, 2026-11-21/22). Dofight's windows have no frame: Windows still resizes
// them from an edge (Tauri does it natively, with the arrows), macOS only from a sliver too thin to find. On macOS
// the page lays its own strips along the edges and corners, and a press there starts the system's resize.

/** The edge or corner a resize starts from (Tauri's `ResizeDirection`). */
export type ResizeDirection = "North" | "South" | "East" | "West" | "NorthEast" | "NorthWest" | "SouthEast" | "SouthWest";

export const EDGES: { dir: ResizeDirection }[] = [
  { dir: "North" },
  { dir: "South" },
  { dir: "East" },
  { dir: "West" },
  { dir: "NorthEast" },
  { dir: "NorthWest" },
  { dir: "SouthEast" },
  { dir: "SouthWest" },
];

/** True in macOS's webview (WKWebView says « Macintosh »), false in Windows' WebView2. */
export function isMac(ua = navigator.userAgent): boolean {
  return /Macintosh|Mac OS X/.test(ua);
}

/** The strips, once per document (a second call returns the same ones). A left press on one calls `start` with its
 * direction, and neither moves the window (drag.ts leaves `.edge` alone) nor starts a text selection. Hide them by
 * setting `hidden` on what this returns (the panel's padlock). */
export function addResizeEdges(doc: Document, start: (dir: ResizeDirection) => void): HTMLElement {
  const old = doc.querySelector<HTMLElement>(".edges");
  if (old) return old;
  const box = doc.createElement("div");
  box.className = "edges";
  box.setAttribute("aria-hidden", "true");
  box.innerHTML = EDGES.map(({ dir }) => `<div class="edge" data-dir="${dir}"></div>`).join("");
  box.addEventListener("mousedown", (e) => {
    const edge = (e.target as HTMLElement).closest<HTMLElement>(".edge");
    if (e.button !== 0 || !edge) return;
    e.preventDefault();
    e.stopPropagation();
    start(edge.dataset.dir as ResizeDirection);
  });
  doc.body.appendChild(box);
  return box;
}

/** A sheet's whole height in CSS pixels, border included: its content's, even when the sheet is capped to the window
 * (styles.css) and scrolls. Measured so, a sheet once shown in a short window still asks for all the room it needs. */
export function sheetHeight(card: HTMLElement): number {
  return card.scrollHeight + card.offsetHeight - card.clientHeight;
}
