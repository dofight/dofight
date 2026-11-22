import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { sheetHeight } from "../src/render/sheetBar";
import { sideHeight } from "../src/previewSide";

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

it("lets a sheet scroll inside its window, and a detached one fill the window the player sized", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toContain("#peek>:not(.toast){max-height:100vh;overflow-y:auto;box-sizing:border-box}");
  expect(css).toContain("#peek.detached>:not(.toast){height:100vh;align-content:start}");
  // « Copié » goes inside #peek (toast.ts): a rule for every child stretched it to the window's height
  expect(css).not.toMatch(/#peek(\.detached)?>\*\{/);
});

it("gives a detached sheet's bar its own sheet's colour, a spell's as well as a monster's", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toMatch(/#peek\.detached \.peek-bar\{[^}]*background:inherit[^}]*\}/);
});
