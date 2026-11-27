import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { sheetHeight } from "../src/render/sheetBar";
import { sideHeight } from "../src/previewSide";

it("measures a sheet's whole height as drawn, zoomed by « Taille du texte », with its cap lifted (Fable, 2026-11-22)", () => {
  const card = document.createElement("div");
  // drawn: 1400 tall in full, but capped to 250 while max-height applies; offsetHeight would say the unzoomed 200
  card.getBoundingClientRect = () => ({ height: card.style.maxHeight === "none" ? 1400 : 250 }) as DOMRect;
  Object.defineProperty(card, "offsetHeight", { value: 200 });
  card.style.maxHeight = "";
  expect(sheetHeight(card)).toBe(1400);
  expect(card.style.maxHeight).toBe(""); // the cap is back
});

it("keeps a sheet no taller than the screen (it scrolls inside), and never a fraction shorter than it", () => {
  expect(sideHeight(300, 1.5, 2160)).toBe(450);
  expect(sideHeight(300.2, 1.25, 2160)).toBe(376); // 375.25: rounded down, the sheet's last line would scroll
  expect(sideHeight(1600, 1.5, 2160)).toBe(2160);
});

it("lets a sheet scroll inside its window, and a detached one fill the window the player sized", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toContain("#peek>:not(.toast){max-height:calc(100vh / var(--zoom,1));overflow-y:auto;box-sizing:border-box}");
  // the page is zoomed (html{zoom}): a bare 100vh is the window's height times the zoom, taller than the window
  // a detached sheet is held by the window's edges, not sized from vh: the Mac cut its bottom border (owner, 2026-11-26)
  expect(css).toMatch(/#peek\.detached>:not\(\.toast\)\{position:fixed;inset:0;max-height:none;/);
  expect(css).not.toMatch(/#peek\.detached>:not\(\.toast\)\{[^}]*height:calc/);
  // « Copié » goes inside #peek (toast.ts): a rule for every child stretched it to the window's height
  expect(css).not.toMatch(/#peek(\.detached)?>\*\{/);
});

it("gives a detached sheet's bar its own sheet's colour, a spell's as well as a monster's", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toMatch(/#peek\.detached \.peek-bar\{[^}]*background:inherit[^}]*\}/);
});

it("gives a spell's sheet the colour of the other sheets (« Comment y aller », a monster's), not the lighter grey of the pills (owner, 2026-11-24)", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toMatch(/\.pop\{background:var\(--card\);/);
});

it("borders the sheets as the panel and the cards are, not in gold (owner, 2026-11-26)", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toMatch(/\.pop\{[^}]*border:1px solid var\(--line\)/);
});

it("draws the sheet's grip instead of a font's « ⠿ », so it takes the same room on Windows and the Mac (owner, 2026-11-26)", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toMatch(/\.peek-bar \.grip\{width:8px;height:12px;/);
  expect(readFileSync("src/render/sheetBar.ts", "utf8")).not.toContain("⠿");
});

it("puts the zaap and its footprints close together, the name keeping its gap (owner, 2026-11-24)", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toMatch(/\.travel\{[^}]*gap:4px/);
  expect(css).toMatch(/\.travel img\+img\{margin-left:-3px\}/);
});
