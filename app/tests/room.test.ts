import { expect, it } from "vitest";
import { roomFor } from "../src/room";
import { makeSnapshot } from "./fixtures";

const s = makeSnapshot();

it("a dungeon result loads its monsters", () => {
  const r = roomFor(s, { kind: "dungeon", label: "Autel de la Déchireuse", info: "", dungeonId: 165 });
  expect(r.dungeon?.id).toBe(165);
  expect(r.monsters.map((m) => m.id)).toEqual([8037, 8040]);
});

it("a monster in a dungeon loads that dungeon", () => {
  const r = roomFor(s, { kind: "monster", label: "Voracle", info: "", monsterId: 8040 });
  expect(r.dungeon?.id).toBe(165);
});

it("a monster outside dungeons loads its sub-area", () => {
  const r = roomFor(s, { kind: "monster", label: "Bouftou", info: "", monsterId: 36 });
  expect(r.dungeon).toBeNull();
  expect(r.title).toBe("Coin des Bouftous");
  expect(r.monsters.map((m) => m.id)).toEqual([36]);
});

it("a monster with neither shows alone", () => {
  const r = roomFor(s, { kind: "monster", label: "Bouftou", info: "", monsterId: 3332 });
  expect(r.monsters.map((m) => m.id)).toEqual([3332]);
  expect(r.title).toBe("Bouftou");
});

it("a sub-area result lists its monsters", () => {
  const r = roomFor(s, { kind: "subarea", label: "Cour du Bouftou Royal", info: "", subarea: "Cour du Bouftou Royal" });
  expect(r.monsters.map((m) => m.id)).toEqual([101]);
});

it("a boss's key summon loads its boss's dungeon, pinned", () => {
  const snap = makeSnapshot();
  snap.monsters.set(900, { ...snap.monsters.get(8040)!, id: 900, name: "Disciple", dungeonIds: [] });
  snap.summaries.set(165, { dungeonId: 165, dungeon: "Autel de la Déchireuse", status: "draft", strategy: "", bossSummons: { "8037": [900] }, monsters: {} });
  const r = roomFor(snap, { kind: "monster", label: "Disciple", info: "", monsterId: 900 });
  expect(r.dungeon?.id).toBe(165);
  expect(r.pinned).toBe(900);
});
