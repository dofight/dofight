import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { overlayScrollbar, sheetHeight } from "../src/render/sheetBar";
import { sideHeight } from "../src/previewSide";
import { drawnScale } from "../src/theme";

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
  // the window's height in the zoomed page's pixels, set by the page (theme.ts viewHeight); 100vh / zoom until then
  expect(css).toContain("#peek>:not(.toast){max-height:var(--view-h,calc(100vh / var(--zoom,1)));overflow-y:auto;overflow-x:hidden;box-sizing:border-box}");
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

it("turns a measured length into the window's pixels whichever way the engine counts the text size's zoom (owner, 2026-11-26)", () => {
  const measure = HTMLElement.prototype.getBoundingClientRect;
  const root = document.documentElement;
  root.style.setProperty("--zoom", "0.9");
  try {
    // WebKit (the Mac): the unzoomed length, so a spell's 420 drawn 378 wide must become 378
    HTMLElement.prototype.getBoundingClientRect = function () { return { width: parseFloat(this.style.width) || 0 } as DOMRect; };
    expect(420 * drawnScale(document)).toBeCloseTo(378);
    // WebView2 (Windows): already the drawn length
    HTMLElement.prototype.getBoundingClientRect = function () { return { width: (parseFloat(this.style.width) || 0) * 0.9 } as DOMRect; };
    expect(drawnScale(document)).toBeCloseTo(1);
    expect(document.body.children).toHaveLength(0); // the probe is gone
  } finally {
    HTMLElement.prototype.getBoundingClientRect = measure;
    root.style.removeProperty("--zoom");
  }
});

it("pads a sheet itself when its scrollbar takes no room, as the Mac's overlay scrollbars do (owner, 2026-11-26)", () => {
  const sheet = (offset: number, client: number) => {
    const el = document.createElement("div");
    el.style.border = "1px solid";
    Object.defineProperty(el, "offsetWidth", { value: offset });
    Object.defineProperty(el, "clientWidth", { value: client });
    return el;
  };
  expect(overlayScrollbar(sheet(420, 418))).toBe(true); // the Mac: borders only
  expect(overlayScrollbar(sheet(420, 410))).toBe(false); // Windows: the 8 px gutter
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toMatch(/#peek\.pinned>\.sb-overlay,#peek\.detached>\.sb-overlay\{padding-right:10px\}/);
  // after the 2 px rule, so it wins at the same specificity
  expect(css.indexOf("#peek.pinned>.sb-overlay")).toBeGreaterThan(css.indexOf("#peek.pinned>:not(.toast),#peek.detached>:not(.toast){scrollbar-gutter:stable;padding-right:2px}"));
});

it("keeps a sheet's ✕ out of its scrollbar where the scrollbar takes room, the Mac's overlay one unchanged (owner, 2026-11-26)", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toMatch(/\.peek-bar\{[^}]*margin:-4px -6px 0 -4px/); // the Mac: -6 into its 10 px of padding
  // Windows: 2 px of padding then the 8 px gutter, so no more than -2
  expect(css).toMatch(/#peek\.pinned>:not\(\.sb-overlay\) \.peek-bar,#peek\.detached>:not\(\.sb-overlay\) \.peek-bar\{margin-right:-2px\}/);
});

it("starts a detached sheet's bar at its top, where it sticks, so it never moves when the sheet scrolls (owner, 2026-11-26)", () => {
  const css = readFileSync("src/styles.css", "utf8");
  // sticky sticks below the scrolling box's padding: the sheet has none on top, the bar carries 4 px itself, so it
  // sits at the very top and nothing scrolls above it
  expect(css).toMatch(/#peek\.detached \.peek-bar\{position:sticky;top:0;margin-top:0;padding-top:4px;/);
  expect(css).toMatch(/#peek\.detached>:not\(\.toast\)\{position:fixed;inset:0;max-height:none;padding-top:0;/);
});

// WebKit's 100vh is already in the zoomed page's pixels: `100vh / zoom` divided by the zoom twice on the Mac, and at
// 110 % a pinned sheet in a 408-point window was capped at 337 px (371 drawn), its last line scrolled away (owner's
// Mac, 2026-11-28). The cap is the window's height over the zoom, from the window itself.
it("caps a sheet at its window's height in the zoomed page's pixels, whatever the engine", async () => {
  const { viewHeight, applyViewHeight } = await import("../src/theme");
  expect(viewHeight(408, 1.1)).toBeCloseTo(370.909, 3);
  expect(viewHeight(408, 1)).toBe(408);
  expect(viewHeight(408, 0)).toBe(408);
  const root = document.createElement("html");
  root.style.setProperty("--zoom", "1.1");
  applyViewHeight(root, 408);
  expect(parseFloat(root.style.getPropertyValue("--view-h"))).toBeCloseTo(370.909, 3);
});
