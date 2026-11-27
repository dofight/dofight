/** A spell drawn on the game's grid (owner, 2026-11-26, from a mockup the owner reviewed): the caster in the middle, the cells in range in blue (those
 * under the minimum range simply not blue, as in the game), the area around the targeted cell in red, the target
 * lighter in its own colour. Read in a glance where to stand.
 *
 * - The target sits straight ahead, as far as the range allows with its zone inside the grid, never closer than the
 *   minimum range: a spell cast from 6 cells away is never drawn hitting at 3.
 * - The grid is as big as the spell needs, but never more than GRID_CAP cells around the caster: 67 of the 2,490
 *   spells with an area go further (Choune: 16 to 20). The real value is then written past the edge, at the end of
 *   the axis — blue for the range, red for a zone around the caster — so nobody counts the cells drawn and takes
 *   them for the range. No fading edge (owner, 2026-11-26).
 * - A whole-map zone fills the grid; an inverted one spares its middle. An endless range (63 in the game's data, the
 *   whole map) uses the full grid.
 * - Line of sight is not drawn: the grid is empty, without obstacles. The sheet says it in words. */

import { t } from "../i18n";
import { mainZone, rangeSpan } from "../reach";
import type { Spell } from "../types";
import { esc } from "./html";
import { SHAPES, parseZone, zoneLabel } from "./zone";

/** At most this many cells around the caster (owner, 2026-11-26: 8, after trying 12 and 10). */
export const GRID_CAP = 8;
/** 63 in the game's data: the whole map (a historical value). */
const ENDLESS = 60;

const ax = Math.abs;
const d1 = (x: number, y: number) => ax(x) + ax(y);

/** Whether the spell can be cast on this cell, its caster at 0,0. */
function inRange(sp: Spell, x: number, y: number): boolean {
  const d = d1(x, y);
  if (d === 0 || d < sp.rangeMin || d > sp.rangeMax) return false;
  const line = x === 0 || y === 0, diagonal = ax(x) === ax(y);
  if (sp.inLine && sp.inDiagonal) return line || diagonal;
  if (sp.inLine) return line;
  if (sp.inDiagonal) return diagonal;
  return true;
}

const SIZES = {
  // the sheet's drawing: 7 cells around the caster as a rule; at least `cell` px a cell, `base` px across at least
  big: { cap: 7, base: 280, cell: 14 },
};

/** The spell on a grid, as an SVG. */
export function spellGrid(sp: Spell, size: keyof typeof SIZES): string {
  const { cap, base, cell } = SIZES[size];
  const zone = mainZone(sp);
  const z = parseZone(zone);
  const inverse = !!z && z.shape.endsWith("-inversé");
  // a zone of 63 has no end: a circle or a square of 63 covers the map, but a line, a cross or a cone keeps its shape,
  // drawn to the edge (Razepoutine, the Kolosso's cone of 63, was drawn as the whole map; 60 zones were)
  const endlessZone = !!z && z.size >= ENDLESS && !inverse;
  const whole = zone === "toute la carte" || (endlessZone && (z.shape === "cercle" || z.shape === "carré"));
  const self = sp.rangeMax === 0;
  const fromCaster = z?.shape === "ligne-lanceur"; // a line that starts at the caster, toward the target
  // an inverted zone spares the cells closer than its threshold: the second number, else the first (« carré-inversé
  // 4 »); « cercle-inversé 63 0 » spares nothing
  const threshold = inverse ? z.second || (z.size < ENDLESS ? z.size : 0) : 0;
  // how far the zone reaches from the cell it is aimed at: an endless line, cross or cone keeps 3 cells of room so
  // its shape shows (« Frappe purificatrice », a line of 63 aimed 8 away, showed its target alone); a line from the
  // caster takes no room around the target
  const zr = !z || whole || fromCaster ? 0 : endlessZone ? 3 : inverse ? threshold + 2 : z.shape === "rectangle" ? Math.max(z.size, z.second || 1) : z.size;
  const endless = whole || endlessZone || sp.rangeMax >= ENDLESS;
  const want = (self ? 0 : Math.min(sp.rangeMax, cap)) + zr;
  const need = (self ? 0 : Math.max(sp.rangeMin, 1)) + zr;
  const R = endless ? GRID_CAP : Math.min(GRID_CAP, Math.max(2, Math.min(cap, want + 1), need + 1));
  // the target: as far as its zone still fits, never under the minimum range; when even the minimum is past the
  // edge, at the edge (its real range is written there)
  const low = Math.max(sp.rangeMin, 1);
  // a spell cast in a diagonal only aims along it: the target at (a, a), 2a cells away (« Schnaps du Dopeul », 2 to 7,
  // had its target off the diagonal, on a cell it cannot be cast on)
  const diagonal = sp.inDiagonal && !sp.inLine;
  const place = (lo: number, hi: number) => (self ? 0 : lo > R ? Math.max(1, R - zr) : Math.max(lo, Math.min(hi, R - zr)));
  const tx = diagonal && !self ? place(Math.ceil(low / 2), Math.floor(sp.rangeMax / 2)) : place(low, sp.rangeMax);
  const ty = diagonal && !self ? tx : 0;
  const rangeCut = sp.rangeMax > R;
  const zoneCut = self && !!z && !whole && !inverse && !fromCaster && z.size > R;
  // a line from the caster: its far end is its second number (the game's « ligne-lanceur 1 10 » on a 1-to-10 spell)
  const lineEnd = fromCaster ? Math.max(z.second, z.size) : 0;
  const px = Math.max(base, Math.min((2 * R + 3) * cell, 640));
  const s = px / (2 * R + 3) / Math.SQRT2;
  const cells: string[] = [], plane: string[] = [];
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const cx = (x - y) * s, cy = ((x + y) * s) / 2; // a diamond grid, as the game draws it
      const me = x === 0 && y === 0, tg = x === tx && y === ty;
      const ox = fromCaster ? x : x - tx, oy = fromCaster ? y : y - ty;
      const ar = whole || (z ? SHAPES[z.shape]?.(ox, oy, z.size, inverse ? threshold : z.second) ?? false : tg);
      const rg = inRange(sp, x, y) || (tg && (low > R || (diagonal && 2 * tx > sp.rangeMax)));
      // the plain cells alternate two close shades, as the game's own diagrams do: each cell can be counted
      const alt = !rg && !ar && !me && (x + y) % 2 !== 0;
      const cls = ["c", me ? "me" : "", rg ? "rg" : "", ar && !me ? "ar" : "", tg ? "t" : "", alt ? "alt" : ""].filter(Boolean).join(" ");
      const pts = (k: number) => `${cx},${cy - (s / 2) * k} ${cx + s * k},${cy} ${cx},${cy + (s / 2) * k} ${cx - s * k},${cy}`;
      // a plain cell is part of the checkerboard (no line of its own); a coloured one stands out, parted from the
      // next by a thin line of the plane's grey (owner, 2026-11-26)
      // the plane first, the coloured cells over it: a plain cell drawn later would cover half a coloured cell's edge
      // the target is its own colour made lighter (styles.css `.c.t`): it reads at every grid size, where an
      // outline grew with the cell and a centre mark got lost on the small grids (owner, 2026-11-26)
      (rg || ar || me || tg ? cells : plane).push(`<polygon class="${cls}" data-d="${d1(x, y)}" points="${pts(1)}"/>`);
    }
  }
  // the real values past the edge, on the target's axis (+x runs down to the right), in screen pixels (12 at least)
  const w = (2 * R + 3) * s * 1.02, h = (w / 2) * 1.04;
  const fs = Math.max(s * 0.9, (12 * 2 * w) / px);
  const [lx, ly] = [(R + 1.1) * s, ((R + 1.1) * s) / 2];
  const labels: string[] = [];
  const label = (cls: string, text: string) =>
    labels.push(`<text class="${cls}" x="${lx}" y="${ly + labels.length * fs * 1.15}" font-size="${fs}">→ ${esc(text)}</text>`);
  if (rangeCut) {
    const far = sp.rangeMax >= ENDLESS ? "∞" : String(sp.rangeMax);
    // with its minimum past the edge too (Choune, 16 to 20), both ends; « 6–∞ » keeps its minimum as well
    label("lrg", low > R || (sp.rangeMax >= ENDLESS && low > 1) ? `${low}–${far}` : far);
  }
  if (zoneCut) label("lar", String(z!.size));
  if (fromCaster && lineEnd > R) label("lar", String(lineEnd));
  if (whole || inverse || endlessZone) label("lar", "∞");
  const name = `${zoneLabel(zone, self)} · ${t("spell.range", { range: rangeSpan(sp) })}`;
  return `<svg class="sgrid" viewBox="${-w} ${-h} ${2 * w} ${2 * h}" width="${px}" preserveAspectRatio="xMidYMid meet" style="--edge:${Math.max(0.4, s * 0.04).toFixed(2)}px" role="img" aria-label="${esc(name)}">${plane.join("")}${cells.join("")}${labels.join("")}</svg>`;
}

/** How far an effect's zone reaches from its anchor, for the thumbnails' shared size (Infinity: no end). */
function thumbReach(zone: string | null | undefined): number {
  if (!zone || zone === "cases") return 0;
  if (zone === "toute la carte") return Infinity;
  const z = parseZone(zone);
  if (!z) return 0;
  if (z.shape.endsWith("-inversé")) return z.second || (z.size < ENDLESS ? z.size : 0);
  if (z.shape === "ligne-lanceur") return Math.max(z.size, z.second);
  if (z.size >= ENDLESS) return Infinity;
  return z.shape === "rectangle" ? Math.max(z.size, z.second || 1) : z.size;
}

/** The thumbnails' radius for a spell: its effects' largest zone, between 2 and 3 cells (at 4 the cells would be
 * lost under their lines; Fable, 2026-11-26). One size for all its rows, so a cross of 1 and one of 2 compare. */
export function thumbRadius(zones: (string | null | undefined)[]): number {
  return Math.min(3, Math.max(2, ...zones.map(thumbReach).map((r) => (r === Infinity ? 3 : r))));
}

/** A spell whose effects have different zones (a self effect on its own cell does not count): it gets a thumbnail on
 * each effect row; with a single zone the big drawing says it all (owner, 2026-11-26). */
export function zonesDiffer(effects: { zone?: string | null; target?: string }[]): boolean {
  return new Set(effects.filter((e) => !(e.target === "self" && !e.zone)).map((e) => e.zone ?? "")).size > 1;
}

/** One effect's zone, drawn small (56 × 28 px) beside its row in the big drawing's colours: the zone alone around its
 * anchor (the targeted cell, or the caster for a spell cast on itself or an effect on itself), no range; a zone past
 * the edge says its real size in the corner (« ∞ » endless, « ≥7 » for an inverted one). Fable's advice, 2026-11-26. */
export function zoneThumb(zone: string | null | undefined, onCaster: boolean, R: number): string {
  // the diamond in a 56 × 28 box, its corner value beside it on the right (owner, 2026-11-26: in the corner it was
  // too small to read); the whole thing scales with the sheet (styles.css .zthumb)
  const D = 56, W = D + 20, H = 28, s = D / (4 * R + 2), ox = D / 2, oy = H / 2;
  const z = parseZone(zone);
  const inverse = !!z && z.shape.endsWith("-inversé");
  const whole = zone === "toute la carte" || (!!z && z.size >= ENDLESS && !inverse && (z.shape === "cercle" || z.shape === "carré"));
  const endless = !!z && z.size >= ENDLESS && !inverse && !whole;
  const threshold = inverse ? z!.second || (z!.size < ENDLESS ? z!.size : 0) : 0;
  const square = z?.shape === "carré-inversé";
  const hole = threshold <= 2 ? threshold : 3; // a wide hole is drawn at 2 around, its threshold written
  const cells: string[] = [];
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const anchor = x === 0 && y === 0;
      const hit = whole || (!zone || zone === "cases" ? anchor : inverse ? (square ? Math.max(ax(x), ax(y)) : d1(x, y)) >= hole : SHAPES[z?.shape ?? ""]?.(x, y, z!.size, z!.second) ?? anchor);
      let cls = "";
      if (anchor && !whole) cls = onCaster ? (hit ? "me lit" : "me") : hit ? "ar t" : "an";
      else if (hit) cls = "ar";
      if (!cls) continue;
      const cx = ox + (x - y) * s, cy = oy + ((x + y) * s) / 2;
      cells.push(`<polygon class="${cls}" points="${cx},${cy - s / 2} ${cx + s},${cy} ${cx},${cy + s / 2} ${cx - s},${cy}"/>`);
    }
  }
  const reach = thumbReach(zone);
  const corner = whole || endless ? "∞" : inverse ? `≥${threshold}` : reach > R ? String(reach) : "";
  const text = corner ? `<text x="${D + 3}" y="${oy}">${corner}</text>` : "";
  const plane = `<polygon class="p" points="${ox},${oy - R * s - s / 2} ${ox + 2 * R * s + s},${oy} ${ox},${oy + R * s + s / 2} ${ox - 2 * R * s - s},${oy}"/>`;
  const label = esc(zoneLabel(zone, onCaster));
  return `<svg class="zthumb" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}"><title>${label}</title>${plane}${cells.join("")}${text}</svg>`;
}
