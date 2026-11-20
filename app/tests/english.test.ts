import { describe, expect, it } from "vitest";
import { englishReading, englishView, frenchRoom, loadEnglish, translateParam, translateText, zoneName } from "../src/english";
import { locate } from "../src/screen/locate";
import { makeSnapshot, monster } from "./fixtures";

const t = {
  text: { "Le garder loin.": "Keep him away.", "ses alliés, 1 tour": "its allies, 1 turn" },
  token: { PA: "AP", PM: "MP", Pesanteur: "Gravity", "lui et ses alliés autour de lui": "itself and its allies around it", Intellig: "Intelligence" },
};

describe("English summaries", () => {
  it("translates whole texts, and the French when there is no translation", () => {
    expect(translateText(t, "Le garder loin.")).toBe("Keep him away.");
    expect(translateText(t, "Pas encore traduit.")).toBe("Pas encore traduit.");
  });

  it("translates a written parameter whole, a derived one piece by piece (numbers kept, cut at 32)", () => {
    expect(translateParam(t, "ses alliés, 1 tour")).toBe("its allies, 1 turn");
    expect(translateParam(t, "PA, PM, Pesanteur")).toBe("AP, MP, Gravity");
    expect(translateParam(t, "PA, 2")).toBe("AP, 2");
    expect(translateParam(t, "lui et ses alliés autour de lui")).toBe("itself and its allies around it");
    expect(translateParam(t, "PA, Intellig").length).toBeLessThanOrEqual(32);
    // one unknown piece: the French parameter, rather than a half-translated one
    expect(translateParam(t, "PA, Inconnu")).toBe("PA, Inconnu");
  });
});

describe("English view of the game data", () => {
  async function english() {
    const fr = makeSnapshot();
    fr.summaries.set(165, { dungeonId: 165, dungeon: "Autel de la Déchireuse", status: "draft", strategy: "Le garder loin.",
      monsters: { "8037": { tags: [{ id: "one_shot", param: "PA, PM" }], detail: "Le garder loin." } } });
    const files: Record<string, unknown> = {
      "snapshot/en/monsters.json": [...fr.monsters.values()].map((m) => ({ ...m, name: `${m.name} EN`, subareas: m.subareas.map((z) => `${z} EN`) })),
      "snapshot/en/dungeons.json": [...fr.dungeons.values()].map((d) => ({ ...d, name: `${d.name} EN` })),
      "snapshot/en/spells.json": [],
      "summaries/en.json": t,
    };
    const en = await loadEnglish(async (path) => files[path], fr);
    return { fr, en, view: englishView(fr, en) };
  }

  it("shows English names and summaries, with the French ids and zone names kept for the reading", async () => {
    const { fr, en, view } = await english();
    expect(view.monsters.get(8037)!.name).toBe("Déchireuse EN");
    expect(view.dungeons.get(165)!.name).toBe("Autel de la Déchireuse EN");
    expect(view.monsters.get(36)!.subareas).toEqual(fr.monsters.get(36)!.subareas);
    expect(zoneName(en, "Coin des Bouftous")).toBe("Coin des Bouftous EN");
    expect(en.zoneFr.get("Coin des Bouftous EN")).toBe("Coin des Bouftous");
    const summary = view.summaries.get(165)!;
    expect(summary.strategy).toBe("Keep him away.");
    expect(summary.monsters["8037"].detail).toBe("Keep him away.");
    expect(summary.monsters["8037"].tags[0].param).toBe("AP, MP");
    // the French snapshot is left as it was
    expect(fr.summaries.get(165)!.strategy).toBe("Le garder loin.");
    expect(fr.monsters.get(8037)!.name).toBe("Déchireuse");
  });

  it("keeps the French names when a monster has no English entry", async () => {
    const { view } = await english();
    expect(monster({ id: 1, name: "x" }).name).toBe("x");
    expect(view.monsters.get(3332)!.name).toBe("Bouftou EN");
  });
});

describe("an English game client", () => {
  it("finds the zone by its English name, as the French room", async () => {
    const fr = makeSnapshot();
    const files: Record<string, unknown> = {
      "snapshot/en/monsters.json": [...fr.monsters.values()].map((m) => ({ ...m, name: `${m.name} EN`, subareas: m.subareas.map((z) => (z === "Coin des Bouftous" ? "Gobball Corner" : z)) })),
      "snapshot/en/dungeons.json": [...fr.dungeons.values()],
      "snapshot/en/spells.json": [],
    };
    const en = await loadEnglish(async (path) => files[path] ?? null, fr);
    const header = { title: "Gobball Corner", x: 1, y: 2, cut: false };
    expect(locate(fr, header)).toBeNull();
    const found = locate(englishReading(fr, en), header);
    expect(found?.title).toBe("Gobball Corner");
    const room = frenchRoom(fr, en, found!);
    expect(room.title).toBe("Coin des Bouftous");
    expect(room.monsters.map((m) => m.name)).toEqual(["Bouftou"]);
  });
});

describe("a sub-area with no monsters, in English (owner, 2026-11-20)", () => {
  it("is found by its English name, shown in English, kept French for the reading", async () => {
    const fr = makeSnapshot();
    fr.travel = { zaaps: [], dungeons: {}, zones: {}, emptyZones: [["Village des Éleveurs", "Breeder Village"]], emptyPlaces: { "-17,0": [0] } };
    fr.emptyAt = new Map([["-17,0", ["Village des Éleveurs"]]]);
    const files: Record<string, unknown> = {
      "snapshot/en/monsters.json": [...fr.monsters.values()],
      "snapshot/en/dungeons.json": [...fr.dungeons.values()],
      "snapshot/en/spells.json": [],
    };
    const en = await loadEnglish(async (path) => files[path] ?? null, fr);
    const found = locate(englishReading(fr, en), { title: "Koalak Mountain (Breeder Village)", x: -17, y: 0, cut: false });
    expect(found?.empty).toBe(true);
    expect(frenchRoom(fr, en, found!).title).toBe("Village des Éleveurs");
    expect(zoneName(en, "Village des Éleveurs")).toBe("Breeder Village");
  });
});

describe("English mechanic sheets", () => {
  it("translates a sheet's title, gist and points, French when missing", async () => {
    const fr = { ...makeSnapshot(), mechanics: new Map([["lunar-cycle", { title: "Cycle lunaire", gist: "Une phase par tour.", points: ["Pas encore traduit."] }]]) };
    const en = { monsters: new Map(), dungeons: new Map(), spells: new Map(), zoneEn: new Map(), zoneFr: new Map(),
      translations: { text: { "Cycle lunaire": "Lunar cycle", "Une phase par tour.": "One phase per turn." }, token: {} } };
    const sheet = englishView(fr, en).mechanics?.get("lunar-cycle");
    expect(sheet).toMatchObject({ title: "Lunar cycle", gist: "One phase per turn.", points: ["Pas encore traduit."] });
  });
});
