// npx vite-node bench/screen-bench.ts <bench-out.jsonl>
// Accuracy of the screen reading on saved game frames: header found, room located, fight state, per frame.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fightState } from "../src/screen/fight";
import { parseHeader } from "../src/screen/header";
import { locate } from "../src/screen/locate";
import type { OcrLine } from "../src/screen/ocr";
import type { Snapshot } from "../src/types";

const DATA = resolve(__dirname, "../../data");
const json = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), "utf-8"));
const snap: Snapshot = {
  dungeons: new Map(json("snapshot/dungeons.json").map((d: { id: number }) => [d.id, d])),
  monsters: new Map(json("snapshot/monsters.json").map((m: { id: number }) => [m.id, m])),
  spells: new Map(),
  summaries: new Map(),
  vocabulary: { tags: {} },
  icons: new Set(),
};

type Frame = { image: string; w: number; h: number; ms: number; lines: OcrLine[] };
const frames: Frame[] = readFileSync(process.argv[2], "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const count = new Map<string, number>();
const add = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
const unknown = new Map<string, number>();
const located = new Map<string, number>();
const fightByHint: Record<string, Record<string, number>> = {};
let ms = 0;

for (const f of frames) {
  ms += f.ms;
  const name = f.image.toLowerCase();
  const hint = /prep|preparation/.test(name) ? "preparation" : /combat_end|end_/.test(name) ? "end" : /turn|fight|cast|spell|hp_|our_turn/.test(name) ? "fight?" : /out_of_fight|map|group|walk|travel/.test(name) ? "none?" : "?";
  const fight = fightState(f.lines);
  (fightByHint[hint] ??= {})[fight] = (fightByHint[hint][fight] ?? 0) + 1;
  const h = parseHeader(f.lines);
  if (!h) { add("no header"); continue; }
  if (h.cut) { add("header cut"); continue; }
  add(h.x === null ? "header, no coords" : "header + coords");
  const r = locate(snap, h);
  if (r) { add("located"); located.set(r.title, (located.get(r.title) ?? 0) + 1); }
  else { add("unknown"); unknown.set(h.title, (unknown.get(h.title) ?? 0) + 1); }
}

const top = (m: Map<string, number>, n = 15) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
console.log(`${frames.length} frames, OCR ${Math.round(ms / frames.length)} ms per frame`);
console.log("header:", Object.fromEntries(count));
console.log("fight state by file-name hint:", fightByHint);
console.log("located as:", top(located));
console.log("unknown titles:", top(unknown, 25));
