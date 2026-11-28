import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { startsDrag } from "../src/drag";
import { copyableSelection, SELECTABLE, selectionTouches, takeSelection } from "../src/selection";
import { showToast } from "../src/render/toast";
import { barHead, sheetBar, startsSheetDrag } from "../src/render/sheetBar";
import { renderSpellSheet } from "../src/render/spellSheet";
import { spell } from "./fixtures";
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
  // the ✕ closes; the bar says how to detach the sheet (owner, 2026-11-24: not tacked on after « Fermer »)
  expect(bar.querySelector(".peek-close")!.getAttribute("title")).toBe("Fermer (Échap)");
  expect(bar.getAttribute("title")).toBe("Fais glisser la fiche ou tire un de ses bords pour la détacher");
  expect(sheetBar(false)).toBe("");
});

it("puts a pinned spell sheet's name and range in its bar (owner, 2026-11-27: not copied, fine)", () => {
    const box = mount(`<div id="peek" class="pinned">${renderSpellSheet(spell({ id: 1, name: "Braise", rangeMin: 1, rangeMax: 6 }), () => null)}</div>`);
    const card = box.firstElementChild!;
    const head = barHead(card);
    card.insertAdjacentHTML("afterbegin", sheetBar(true, head));
    const bar = card.querySelector(".peek-bar")!;
    expect(bar.querySelector(".pname")?.textContent).toBe("Braise");
    expect(bar.querySelector(".po")?.textContent).toBe("1–6 PO");
    // once only: no longer under the bar
    expect(card.querySelectorAll(".pname, .prange").length).toBe(2);
    expect(card.querySelector(":scope > .pname, :scope > .prange")).toBeNull();
    // the title moves the sheet like the rest of the bar; the ✕ still closes it
    expect(startsSheetDrag(bar.querySelector(".pname")!)).toBe(true);
    expect(bar.lastElementChild?.classList.contains("peek-close")).toBe(true);
    // a monster's card keeps its own header
    expect(barHead(mount(`<div class="mob peek"><div class="mh">Bouftou</div></div>`))).toBe("");
});

it("puts every pinned sheet's title in its bar: a mechanic's, « Comment y aller »'s, « Succès »'s", () => {
  for (const [html, title] of [
    [`<div class="mob peek mech-sheet"><b>Kirbili</b><div class="gist">Un tour sur deux</div></div>`, "Kirbili"],
    [`<div class="mob peek access-sheet"><b class="title">Comment y aller : Bworker</b><div>…</div></div>`, "Comment y aller : Bworker"],
    [`<div class="mob peek achv-sheet"><b>Succès</b><ul></ul></div>`, "Succès"],
  ]) {
    const card = mount(html);
    const head = barHead(card);
    expect(card.querySelector(":scope > b")).toBeNull();
    card.insertAdjacentHTML("afterbegin", sheetBar(true, head));
    expect(card.querySelector(".peek-bar .bar-head b")?.textContent).toBe(title);
  }
});

it("gives a pinned sheet's bar a fold button (shown once detached) before its ✕", () => {
  const bar = mount(sheetBar(true));
  const fold = bar.querySelector(".peek-fold")!;
  expect(fold.getAttribute("title")).toBe("Réduire à la barre");
  expect(fold.nextElementSibling?.classList.contains("peek-close")).toBe(true);
  expect(startsSheetDrag(fold)).toBe(false); // a button: a click, never a drag
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toContain("#peek:not(.detached) .peek-fold{display:none}");
  expect(css).toContain("#peek.folded>:not(.toast)>:not(.peek-bar){display:none}");
  // folded, as much room above the bar as below it (owner, 2026-11-27)
  expect(css).toContain("#peek.folded>:not(.toast){padding-block:4px}");
  expect(css).toContain("#peek.folded .peek-bar{padding-top:0}");
});

it("moves a sheet only from its bar, never from its text or its ✕", () => {
  const box = mount(`<div id="peek" class="pinned">${sheetBar(true)}<div class="mob"><div class="detail">Tape fort</div></div></div>`);
  expect(startsSheetDrag(box.querySelector(".peek-bar")!)).toBe(true);
  expect(startsSheetDrag(box.querySelector(".grip")!)).toBe(true);
  expect(startsSheetDrag(box.querySelector(".peek-close")!)).toBe(false);
  expect(startsSheetDrag(box.querySelector(".detail")!)).toBe(false);
});

// a narrow detached spell sheet lost its ✕: the sheet's grid column grew to the title's whole width, the bar went
// past the sheet's right edge (owner's screenshot, 2026-11-27). The title is the part that gives way.
it("keeps a narrow sheet's ✕ and cuts its title instead", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toMatch(/\.pop\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  expect(css).toContain(".peek-bar .grip,.peek-fold,.peek-close{flex:none}");
  expect(css).toMatch(/\.peek-bar \.bar-head\{[^}]*flex:1;min-width:0/);
  expect(css).toMatch(/\.peek-bar \.bar-head \.pname\{[^}]*text-overflow:ellipsis/);
});

it("centres the bar's title on its capitals, level with the grip and the ✕", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toContain(".peek-bar .bar-head>*{text-box:trim-both cap alphabetic}");
});

// the trim cut the box at the baseline, and the name's « … » clips to that box: « Disruption » lost the leg of its
// « p » (owner's Mac, 2026-11-28). Room given back above and below, the centring kept.
it("keeps a bar title's descenders and accents while it centres on its capitals", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toContain(".peek-bar .bar-head>b,.peek-bar .bar-head .pname{padding-block:.35em;margin-block:-.35em}");
});

// « Comment y aller : Antre du Korriandre » was cut once pinned: the grip and the ✕ took its room (owner,
// 2026-11-27). The sheet asks for the width at which its title shows whole, whatever the width it was measured at.
it("asks for the width at which a pinned sheet's title shows whole", async () => {
  const { barWidthNeeded } = await import("../src/render/sheetBar");
  // a 300 px sheet whose title has 220 px of room and needs 260: 340
  expect(barWidthNeeded(300, 220, 260)).toBe(340);
  // measured in a window still 420 wide (a spell's): the same 340, so the panel's 300 is widened all the same
  expect(barWidthNeeded(420, 340, 260)).toBe(340);
  // a short title: under the sheet's width, the panel keeps its own (it only widens)
  expect(barWidthNeeded(300, 220, 120)).toBe(200);
  const main = readFileSync("src/main.ts", "utf8");
  expect(main).toContain("if (w > side.width) side = widened(side, base.x, w, screen);");
});

it("draws every sheet's title in its bar alike: yellow, 14 px, bold", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toContain(".peek-bar .bar-head>b{color:var(--yellow);font-size:14px;font-weight:700}");
});
