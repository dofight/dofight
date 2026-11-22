import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { addResizeEdges, EDGES, isMac, sheetHeight } from "../src/resizeEdges";
import { startsDrag } from "../src/drag";
import { sideHeight } from "../src/previewSide";

afterEach(() => {
  document.body.innerHTML = "";
});

it("knows a Mac from its webview, and Windows from its own", () => {
  expect(isMac("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)")).toBe(true);
  expect(isMac("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0")).toBe(false);
});

it("puts a strip on each edge and a square on each corner, each resizing its own way", () => {
  const box = addResizeEdges(document, () => {});
  const dirs = [...box.querySelectorAll<HTMLElement>(".edge")].map((e) => e.dataset.dir);
  expect(dirs.sort()).toEqual(["East", "North", "NorthEast", "NorthWest", "South", "SouthEast", "SouthWest", "West"]);
  expect(EDGES).toHaveLength(8);
  expect(addResizeEdges(document, () => {})).toBe(box); // once per window
  expect(document.querySelectorAll(".edges")).toHaveLength(1);
});

it("starts a resize from a strip, and nothing else: no move, no selection", () => {
  const started: string[] = [];
  addResizeEdges(document, (d) => started.push(d));
  const corner = document.querySelector<HTMLElement>('.edge[data-dir="SouthEast"]')!;
  const press = new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true });
  corner.dispatchEvent(press);
  expect(started).toEqual(["SouthEast"]);
  expect(press.defaultPrevented).toBe(true); // no text selection starts there
  expect(startsDrag(corner)).toBe(false); // nor does the window move
  corner.dispatchEvent(new MouseEvent("mousedown", { button: 2, bubbles: true }));
  expect(started).toEqual(["SouthEast"]); // a right click is not a resize
});

it("gives every strip its cursor, and hides them with the container", () => {
  const css = readFileSync("src/styles.css", "utf8");
  for (const { dir } of EDGES) expect(css).toMatch(new RegExp(`\\.edge\\[data-dir="${dir}"\\]\\{[^}]*cursor:[a-z]+-resize`));
  expect(css).toContain(".edges[hidden]{display:none}");
});

it("measures a sheet's whole height, even while it is capped and scrolls", () => {
  const card = document.createElement("div");
  Object.defineProperty(card, "scrollHeight", { value: 1400 });
  Object.defineProperty(card, "offsetHeight", { value: 202 });
  Object.defineProperty(card, "clientHeight", { value: 200 });
  expect(sheetHeight(card)).toBe(1402); // the content, plus the 1 px border above and below
});

it("keeps a sheet no taller than the screen (it scrolls inside)", () => {
  expect(sideHeight(300, 1.5, 2160)).toBe(450);
  expect(sideHeight(1600, 1.5, 2160)).toBe(2160);
});
