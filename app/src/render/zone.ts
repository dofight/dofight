/** A spell effect's area drawn as a small diamond grid (the game's isometric look), cells lit where it hits.
 * Zones come from the snapshot as "<shape> <size>[ <second>]" (the game's own area type, see tools/snapshot.py).
 * Directional shapes point away from the caster: +dx is the cast direction. The shapes follow the game's own zone
 * algorithms (cone, half circle, fork, boomerang and rectangle were checked cell by cell against them). */

import { t, type Key } from "../i18n";

type Hit = (dx: number, dy: number, n: number, m: number) => boolean;

const ax = Math.abs;
const d1 = (dx: number, dy: number) => ax(dx) + ax(dy);
const dmax = (dx: number, dy: number) => Math.max(ax(dx), ax(dy));

export const SHAPES: Record<string, Hit> = {
  cercle: (dx, dy, n, m) => d1(dx, dy) <= n && d1(dx, dy) >= m,
  "cercle-inversé": (dx, dy, _n, m) => d1(dx, dy) >= m,
  croix: (dx, dy, n, m) => (dx === 0 || dy === 0) && d1(dx, dy) <= n && d1(dx, dy) >= m,
  "croix-diag": (dx, dy, n, m) => ax(dx) === ax(dy) && ax(dx) <= n && ax(dx) >= m,
  étoile: (dx, dy, n) => ((dx === 0 || dy === 0) && d1(dx, dy) <= n) || (ax(dx) === ax(dy) && ax(dx) <= n),
  carré: (dx, dy, n) => dmax(dx, dy) <= n,
  "carré-inversé": (dx, dy, _n, m) => dmax(dx, dy) >= m,
  "carré-sans-diag": (dx, dy, n) => dmax(dx, dy) <= n && !(dx !== 0 && ax(dx) === ax(dy)),
  rectangle: (dx, dy, n, m) => ax(dy) <= n && dx >= 0 && dx <= Math.max(m, 1), // depth from the target to m
  ligne: (dx, dy, n) => dy === 0 && dx >= 0 && dx <= n,
  // from the caster, `n` cells out to `m` (the game's « ligne-lanceur 1 10 » on a spell of range 1 to 10)
  "ligne-lanceur": (dx, dy, n, m) => dy === 0 && dx >= n && dx <= Math.max(n, m),
  "ligne-perp": (dx, dy, n) => dx === 0 && ax(dy) <= n,
  cône: (dx, dy, n) => dx >= 0 && dx <= n && ax(dy) <= dx,
  "demi-cercle": (dx, dy, n) => dx <= 0 && ax(dy) === -dx && -dx <= n,
  fourche: (dx, dy, n) => dx >= 0 && dx <= n && (dy === 0 || ax(dy) === dx),
  boomerang: (dx, dy, n) => (dx === 0 && ax(dy) <= n - 1) || (dx === -1 && ax(dy) === n), // as the game draws it
  // the cells at a distance of the size's parity: « damier 60 » the even ones (Glyphe pair), « damier 61 » the odd
  // ones (Glyphe impair), which the even rule drew on the same cells (owner, 2026-11-26)
  damier: (dx, dy, n) => d1(dx, dy) <= n && (d1(dx, dy) - n) % 2 === 0,
};

const UNLIMITED = 60;

/** "cercle 3 1" → its parts; null for a single cell, fixed cells or an unknown shape. */
export function parseZone(zone: string | null | undefined): { shape: string; size: number; second: number } | null {
  if (!zone) return null;
  const [shape, sizeText, secondText] = zone.split(" ");
  if (!SHAPES[shape]) return null;
  return { shape, size: Math.max(0, Number(sizeText) || 0), second: Math.max(0, Number(secondText) || 0) };
}

function sizeText(z: { shape: string; size: number; second: number }): string {
  const feminine = /^(ligne|croix|étoile|fourche)/.test(z.shape);
  const n = z.size >= UNLIMITED ? t(feminine ? "zone.unlimitedFeminine" : "zone.unlimited") : String(z.size);
  if (z.shape === "cercle-inversé" || z.shape === "carré-inversé") return t("zone.from", { count: z.second || z.size });
  if (z.shape === "rectangle") return `${z.size * 2 + 1} × ${(z.second || 1) + 1}`;
  if ((z.shape === "cercle" || z.shape === "croix" || z.shape === "croix-diag") && z.second) return t("zone.between", { min: z.second, max: n });
  if (z.shape === "ligne-lanceur") return String(Math.max(z.size, z.second));
  return n;
}

export function zoneLabel(zone: string | null | undefined, aroundCaster: boolean): string {
  if (zone === "toute la carte") return t("zone.wholeMap");
  if (zone === "cases") return t("zone.cells");
  const z = parseZone(zone);
  if (!z || (z.size === 0 && !z.second)) return t(aroundCaster ? "zone.onCaster" : "zone.targetCell");
  const where = t(z.shape === "ligne-lanceur" ? "zone.fromCaster" : aroundCaster ? "zone.aroundCaster" : "zone.onTarget");
  return t("zone.label", { shape: t(`zone.${z.shape}` as Key), size: sizeText(z), where });
}
