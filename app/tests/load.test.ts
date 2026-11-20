import { expect, it } from "vitest";
import { loadSnapshot } from "../src/load";

const files: Record<string, unknown> = {
  "snapshot/dungeons.json": [{ id: 1, name: "Cour du Bouftou Royal", level: 30, monsterIds: [101], maps: [] }],
  "snapshot/monsters.json": [{ id: 101, name: "Bouftou" }],
  "snapshot/spells.json": [{ id: 202, name: "Morsure du Bouftou" }],
};
const withSummaries: Record<string, unknown> = {
  ...files,
  "summaries/index.json": { "1": { dungeonId: 1, dungeon: "Cour du Bouftou Royal", status: "draft", strategy: "x", monsters: {} } },
  "summaries/vocabulary.json": { tags: { flees: { category: "mechanic", label: "Fuyard", param: "none", icon: null } } },
};

it("loads summaries keyed by dungeon id and the vocabulary", async () => {
  const s = await loadSnapshot(async (p) => {
    if (!(p in withSummaries)) throw new Error("404");
    return withSummaries[p];
  });
  expect(s.summaries.get(1)?.dungeon).toBe("Cour du Bouftou Royal");
  expect(s.vocabulary.tags.flees.label).toBe("Fuyard");
});

it("loads the snapshot into maps", async () => {
  const s = await loadSnapshot(async (p) => {
    if (!(p in files)) throw new Error("404");
    return files[p];
  });
  expect(s.dungeons.get(1)?.name).toBe("Cour du Bouftou Royal");
  expect(s.monsters.get(101)?.name).toBe("Bouftou");
  expect(s.spells.get(202)?.name).toBe("Morsure du Bouftou");
  expect(s.summaries.size).toBe(0); // no summaries file: still loads
  expect(s.icons.size).toBe(0);
  expect(s.vocabulary.tags).toEqual({});
});

it("loads data/access.json when there, and does without it", async () => {
  const access = { areas: {}, dungeons: { "1": { area: "Astrub", level: 30, key: null, reqs: [] } } };
  const s = await loadSnapshot(async (p) => {
    const all: Record<string, unknown> = { ...files, "access.json": access };
    if (!(p in all)) throw new Error("404");
    return all[p];
  });
  expect(s.access).toEqual(access);
  const none = await loadSnapshot(async (p) => {
    if (!(p in files)) throw new Error("404");
    return files[p];
  });
  expect(none.access).toBeUndefined();
});
