import { expect, it } from "vitest";
import { startsDrag } from "../src/drag";

function el(html: string, selector: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root.querySelector(selector) as HTMLElement;
}

it("drags from plain text and empty areas", () => {
  expect(startsDrag(el('<div class="mob"><span class="mtitle">Bouftou</span></div>', ".mtitle"))).toBe(true);
  expect(startsDrag(el('<div class="room"></div>', ".room"))).toBe(true);
});

it("never drags from controls", () => {
  expect(startsDrag(el('<input id="q">', "#q"))).toBe(false);
  expect(startsDrag(el('<button class="sp"><img></button>', "img"))).toBe(false);
  expect(startsDrag(el('<a class="guide" href="#">x</a>', "a"))).toBe(false);
  expect(startsDrag(el('<button class="res-item"><span>Donjon</span></button>', "span"))).toBe(false);
  expect(startsDrag(el('<label><input type="checkbox"></label>', "label"))).toBe(false);
});
