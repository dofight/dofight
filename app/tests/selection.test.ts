import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { startsDrag } from "../src/drag";
import { copyableSelection, SELECTABLE, selectionTouches } from "../src/selection";
import { showToast } from "../src/render/toast";
import { sheetBar, startsSheetDrag } from "../src/render/sheetBar";
import { setLang } from "../src/i18n";

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

function select(node: Node, from: number, to: number): Selection {
  const sel = window.getSelection()!;
  const range = document.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  sel.removeAllRanges();
  sel.addRange(range);
  return sel;
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
  vi.useRealTimers();
  setLang("fr");
});

it("copies a selection of two characters or more inside the results, trimmed", () => {
  const room = mount('<div id="room"><span class="mname">Bouftou Royal</span></div><p id="out">Ailleurs</p>');
  const name = room.querySelector(".mname")!.firstChild!;
  expect(copyableSelection(select(name, 0, 8), room)).toBe("Bouftou");
  expect(copyableSelection(select(name, 0, 1), room)).toBe("");
  expect(copyableSelection(select(document.getElementById("out")!.firstChild!, 0, 8), room)).toBe("");
});

it("knows a selection made in a card header, so the click that ends it does not fold the card", () => {
  const room = mount('<div id="room"><div class="mh"><span class="mname">Bouftou</span></div><div class="detail">Tape fort</div></div>');
  const head = room.querySelector<HTMLElement>(".mh")!;
  select(head.querySelector(".mname")!.firstChild!, 0, 4);
  expect(selectionTouches(head)).toBe(true);
  select(room.querySelector(".detail")!.firstChild!, 0, 4);
  expect(selectionTouches(head)).toBe(false);
  window.getSelection()!.removeAllRanges();
  expect(selectionTouches(head)).toBe(false);
});

it("selects instead of moving the panel on names and summaries, moves it elsewhere", () => {
  const room = mount(
    '<div class="mob"><div class="mh"><img class="thumb"><span class="mname">Bouftou</span></div><div class="lvl stats"><span>Niv. 5</span></div><div class="detail">Tape fort</div><span class="tag danger">Poison</span></div>',
  );
  expect(startsDrag(room.querySelector(".mname")!)).toBe(false);
  expect(startsDrag(room.querySelector(".detail")!)).toBe(false);
  expect(startsDrag(room.querySelector(".tag")!)).toBe(false);
  expect(startsDrag(room.querySelector(".thumb")!)).toBe(true);
  expect(startsDrag(room.querySelector(".lvl span")!)).toBe(true);
});

it("lets the selectable parts of the panel be selected (the panel is user-select:none)", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const rule = css.match(/#app :is\(([^)]*)\)\{user-select:text;cursor:text\}/);
  expect(rule?.[1].split(",").map((s) => s.trim())).toEqual(SELECTABLE.split(",").map((s) => s.trim()));
});

it("says « Copié » at the bottom of the window for a second, « Copie impossible » on failure", () => {
  vi.useFakeTimers();
  showToast(document, true);
  expect(document.querySelectorAll(".toast")).toHaveLength(1);
  expect(document.querySelector(".toast")!.textContent).toBe("Copié");
  expect(document.querySelector(".toast")!.getAttribute("role")).toBe("status");
  showToast(document, false);
  expect(document.querySelectorAll(".toast")).toHaveLength(1);
  expect(document.querySelector(".toast")!.textContent).toBe("Copie impossible");
  vi.advanceTimersByTime(1000);
  expect(document.querySelector(".toast")).toBeNull();
  setLang("en");
  showToast(document, true);
  expect(document.querySelector(".toast")!.textContent).toBe("Copied");
});

it("gives a pinned sheet a bar with a grip and ✕, and a hover preview none", () => {
  const bar = mount(sheetBar(true));
  expect(bar.classList.contains("peek-bar")).toBe(true);
  expect(bar.querySelector(".grip")).not.toBeNull();
  expect(bar.querySelector("button.peek-close")).not.toBeNull();
  expect(sheetBar(false)).toBe("");
});

it("moves a sheet only from its bar, never from its text or its ✕", () => {
  const box = mount(`<div id="peek" class="pinned">${sheetBar(true)}<div class="mob"><div class="detail">Tape fort</div></div></div>`);
  expect(startsSheetDrag(box.querySelector(".peek-bar")!)).toBe(true);
  expect(startsSheetDrag(box.querySelector(".grip")!)).toBe(true);
  expect(startsSheetDrag(box.querySelector(".peek-close")!)).toBe(false);
  expect(startsSheetDrag(box.querySelector(".detail")!)).toBe(false);
});
