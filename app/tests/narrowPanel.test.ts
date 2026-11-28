import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// The panel can be as narrow as 240 px (tauri.conf.json), at 90, 100 or 110 % text size. At 240 px the list was cut
// on the right at 100 % and 110 % (owner, 2026-11-26): measured in the panel's page at 240 px, the dungeon's header
// held it 2 px too wide at 100 %, 24 at 110 %; the settings' « Affichage » header 3 px at 110 %; the gear went under
// the title (6 px at 100 %, 19 at 110 %). After these rules nothing passes the right edge on 13 dungeons, the
// settings, the guide and the report form, at the three sizes.
const css = readFileSync("src/styles.css", "utf8");

it("keeps a dungeon's level beside its name, the name wrapping, and never stairs its actions down (owner, 2026-11-26)", () => {
  expect(css).toMatch(/\.dj\{display:flex;justify-content:space-between;/);
  expect(css).toMatch(/\.dj small\{flex:none;/);
  // space-between and no margin: wrapped, the way there starts its own line on the left
  expect(css).toMatch(/\.dj-acts\{display:flex;flex-wrap:wrap;justify-content:space-between;/);
  expect(css).not.toContain(".dj-acts>.achv+.trip{margin-left:auto}");
});

it("keeps the settings' « Aperçu » pill to its eye in a narrow card, the card no wider than the panel", () => {
  expect(css).toContain("#view-settings .cardhead:has(>.eye){container-type:inline-size}");
  expect(css).not.toMatch(/\.card\{container-type/); // a card as a container buries its info bubbles under the next card
  expect(css).toMatch(/@container \(max-width:199px\)\{\.eye span\{display:none\}\}/);
});

it("never puts the title bar's buttons under its title: even sides no narrower than their buttons, the logo alone when narrow", () => {
  expect(css).toMatch(/\.topbar\{[^}]*grid-template-columns:minmax\(min-content,1fr\) auto minmax\(min-content,1fr\)/);
  expect(css).not.toMatch(/\.topbar\{[^}]*minmax\(0,1fr\)/);
  expect(css).toMatch(/@container \(max-width:269px\)\{\.brand~\.title\{font-size:0;gap:0\}\}/); // not the example window's « Aperçu »
});

it("ends a placeholder too long for the field in « … »", () => {
  expect(css).toContain("#q,#find-q{text-overflow:ellipsis}");
});

it("lets « Revenir à ta sous-zone » shrink, its name ending in « … », instead of widening the whole list", () => {
  expect(css).toMatch(/\.backzone\{[^}]*max-width:100%;min-width:0;/);
});

it("holds each column that the list sits in to its box, so no line ever widens the page (a field's default width, a long name)", () => {
  // an auto column grew to its widest child: typing in the filter, its count and ✕ widened the page at 110 %
  for (const rule of [".view{", ".view.paged>.pagebody{", ".mainhead{", ".room{", ".mob{"]) {
    const i = css.indexOf(rule);
    expect(i, rule).toBeGreaterThanOrEqual(0);
    expect(css.slice(i, css.indexOf("}", i)), rule).toContain("grid-template-columns:minmax(0,1fr)");
  }
});

// the narrow panel at 90 and 110 % (owner's Mac, 2026-11-28; the language buttons on Windows too): a monster's « Avis de
// recherche » broke after « de », « English » went past the card's edge, « Tendancieux » fell to « Tendancieu » / « x »
it("puts a monster's kind on its own line, wraps the language buttons, and cuts a monster's name between syllables", () => {
  expect(css).toContain(".mh:has(.mkind) .mkind{grid-column:2/4;grid-row:2;justify-self:start;white-space:nowrap}");
  expect(css).toMatch(/\.langs\{display:flex;flex-wrap:wrap;/);
  expect(css).toMatch(/\.mname\{[^}]*hyphens:auto/);
});
