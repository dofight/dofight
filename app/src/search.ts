import { kindName, t } from "./i18n";
import type { Monster, Snapshot } from "./types";

export type ResultKind = "dungeon" | "subarea" | "monster";

export interface Result {
  kind: ResultKind;
  label: string;
  info: string;
  dungeonId?: number;
  subarea?: string;
  monsterId?: number;
}

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** 0 = no match; a substring match scores 100 minus its position, letters in order score at most 50. */
export function score(text: string, query: string): number {
  const t = normalize(text);
  const q = normalize(query).trim();
  if (!q) return 0;
  const at = t.indexOf(q);
  if (at >= 0) return 100 - Math.min(at, 49);
  let j = 0;
  let gaps = 0;
  for (const c of t) {
    if (c === q[j]) j++;
    else if (j > 0) gaps++;
    if (j === q.length) return Math.max(1, 50 - gaps);
  }
  // typos: closest stretch of the text within a small edit distance
  const allowed = Math.max(1, Math.floor(q.length / 5));
  let best = Infinity;
  for (let len = q.length - 1; len <= q.length + 1; len++) {
    for (let i = 0; i + len <= t.length; i++) best = Math.min(best, editDistance(t.slice(i, i + len), q));
  }
  return best <= allowed ? 40 - 10 * best : 0;
}

export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function levelRange(m: Monster): string {
  return m.levelMin === m.levelMax ? t("monster.level", { level: m.levelMax }) : t("monster.levels", { min: m.levelMin, max: m.levelMax });
}

const MIN_FUZZY = 20;

/** « Archimonstre · », « Avis de recherche · »… before the level of a monster that is not the zone's own; "" for a normal one. */
const kindLabel = (kind: NonNullable<Monster["kind"]>): string => (kindName(kind) ? `${kindName(kind)} · ` : "");

export function search(s: Snapshot, query: string, limit = 8): (Result & { score?: number })[] {
  if (!query.trim()) return [];
  const scored: (Result & { score: number })[] = [];
  const subareas = new Set<string>();

  for (const d of s.dungeons.values()) {
    const sc = score(d.name, query);
    if (sc >= MIN_FUZZY) scored.push({ kind: "dungeon", label: d.name, info: t("monster.level", { level: d.level }), dungeonId: d.id, score: sc + 20 });
  }
  for (const m of s.monsters.values()) {
    m.subareas.forEach((a) => subareas.add(a));
    const sc = score(m.name, query);
    if (sc < MIN_FUZZY) continue;
    // a monster met in several dungeons (Servitude: its own, Fers de la Tyrannie, and the Tempête de l'Eliocalypse):
    // the one it heads (first of its monsters) first
    const dungeons = m.dungeonIds
      .map((id) => s.dungeons.get(id))
      .filter((d): d is NonNullable<typeof d> => !!d)
      .sort((a, b) => Number(b.monsterIds[0] === m.id) - Number(a.monsterIds[0] === m.id));
    const where = dungeons[0]?.name ?? m.subareas[0];
    const tag = kindLabel(m.kind ?? "normal");
    const info = tag + (where ? `${levelRange(m)} · ${where}` : levelRange(m));
    // normal monsters first, then expedition and wanted-poster versions of the same name
    scored.push({ kind: "monster", label: m.name, info, monsterId: m.id, score: m.kind && m.kind !== "normal" ? sc - 5 : sc });
    // a monster's dungeons come first
    dungeons.forEach((dungeon, i) => {
      if (sc < 50 || scored.some((r) => r.kind === "dungeon" && r.dungeonId === dungeon.id)) return;
      scored.push({ kind: "dungeon", label: dungeon.name, info: t("search.contains", { name: m.name }), dungeonId: dungeon.id, score: sc + 30 - i * 0.1 });
    });
  }
  const dungeonNames = new Set([...s.dungeons.values()].map((d) => normalize(d.name)));
  for (const a of subareas) {
    if (dungeonNames.has(normalize(a))) continue; // a dungeon's sub-area has the dungeon's name
    const sc = score(a, query);
    // its area (« Amakna », « Île de Frigost »), which tells two zones apart better than « sous-zone »
    if (sc >= MIN_FUZZY) scored.push({ kind: "subarea", label: a, info: s.areas?.get(a) ?? "", subarea: a, score: sc + 10 });
  }
  return scored
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(({ score: _s, ...r }) => r);
}
