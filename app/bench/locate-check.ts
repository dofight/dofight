import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseHeader } from "../src/screen/header";
import { locate } from "../src/screen/locate";
const DATA = resolve(__dirname, "../../data");
const json = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), "utf-8"));
const snap: any = { dungeons: new Map(json("snapshot/dungeons.json").map((d: any) => [d.id, d])), monsters: new Map(json("snapshot/monsters.json").map((m: any) => [m.id, m])), spells: new Map(), summaries: new Map(), vocabulary: { tags: {} }, icons: new Set() };
const pairs = new Map<string, number>();
for (const line of readFileSync(process.argv[2], "utf-8").split("\n").filter(Boolean)) {
  const h = parseHeader(JSON.parse(line).lines);
  if (!h || h.cut) continue;
  const r = locate(snap, h);
  if (r) pairs.set(`${h.title}  =>  ${r.title}`, (pairs.get(`${h.title}  =>  ${r.title}`) ?? 0) + 1);
}
for (const [k, v] of [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(v, k);
