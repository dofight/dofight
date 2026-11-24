import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { startsDrag } from "../src/drag";
import { copyableSelection, SELECTABLE, selectionTouches, takeSelection } from "../src/selection";
import { showToast } from "../src/render/toast";
import { sheetBar, startsSheetDrag } from "../src/render/sheetBar";
import { setLang } from "../src/i18n";
import { renderRoute } from "../src/travel";

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

it("copies the commands of the buttons in a selection, one line per step (owner review, 2026-11-23)", () => {
  const zaap = { x: 5, y: -18, world: 1, zone: { fr: "Cité d'Astrub", en: "Astrub City" } };
  const room = mount(`<div id="room">${renderRoute(["{/zaap 5 -18 ; /travel -9 31} avec la diligence", "Parler à Daoh en [15,-31]", "/travel -9 29"], true, [zaap])}</div>`);
  const steps = room.querySelectorAll("li");
  const sel = window.getSelection()!;
  const range = document.createRange();
  range.setStartBefore(steps[0]);
  range.setEndAfter(steps[2]);
  sel.removeAllRanges();
  sel.addRange(range);
  expect(copyableSelection(sel, room)).toBe("/zaap 5 -18 ; /travel -9 31 avec la diligence\nParler à Daoh en /travel 15 -31\n/travel -9 29");
  // a button only partly selected (its label's first letters): its whole command
  const label = steps[2].querySelector(".lbl")!.firstChild!;
  expect(copyableSelection(select(label, 0, 3), room)).toBe("/travel -9 29");
});

it("unselects what it copied, and leaves a selection it does not copy alone (owner, 2026-11-22)", () => {
  const room = mount('<div id="room"><span class="mname">Bouftou Royal</span></div>');
  const name = room.querySelector(".mname")!.firstChild!;
  vi.useFakeTimers();
  const sel = select(name, 0, 7);
  expect(takeSelection(sel, room)).toBe("Bouftou");
  expect(selectionTouches(room.querySelector(".mname")!)).toBe(true); // the click after the release still sees it
  vi.runAllTimers();
  expect(sel.rangeCount).toBe(0);
  select(name, 0, 1);
  expect(takeSelection(sel, room)).toBe("");
  expect(sel.rangeCount).toBe(1);
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

it("says « Copié » inside a sheet, at its bottom, not at the bottom of a taller window", () => {
  const box = mount(`<div id="peek"><div class="pop">Wakpot Kwayal</div></div>`);
  showToast(document, true, box);
  const toast = document.querySelector<HTMLElement>(".toast")!;
  expect(toast.parentElement).toBe(box);
  expect(toast.classList.contains("in-box")).toBe(true);
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toContain(".toast.in-box{position:absolute}");
  expect(css).toContain("#peek{padding:0;position:relative}"); // the box the toast is placed in
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
