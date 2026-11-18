import { readFileSync } from "node:fs";
import { fightState } from "../src/screen/fight";
const frames = readFileSync(process.argv[2], "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
for (const f of frames) {
  const name = f.image.toLowerCase();
  const s = fightState(f.lines);
  const noneHint = /out_of_fight|map|group|walk|travel/.test(name);
  const fightHint = /turn|fight|cast|spell|hp_|our_turn/.test(name);
  if ((noneHint && s !== "none") || (fightHint && s === "none")) {
    const keys = f.lines.map((l: { text: string }) => l.text).filter((t: string) => /fin de|pr[eê]t|challenge|termin|victoire|d[ée]faite/i.test(t));
    console.log(s.padEnd(11), f.image.split("/").slice(-2).join("/"), JSON.stringify(keys));
  }
}
