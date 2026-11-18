import type { Dungeon, Monster, Snapshot, Spell, Vocabulary } from "../src/types";

const res = { n: 0, e: 0, f: 0, w: 0, a: 0 };

export function monster(p: Partial<Monster> & Pick<Monster, "id" | "name">): Monster {
  return {
    boss: false, levelMin: 1, levelMax: 1, hpMin: 10, hpMax: 10, ap: 6, mp: 3, res,
    spellIds: [], dungeonIds: [], subareas: [], ...p,
  };
}

export function spell(p: Partial<Spell> & Pick<Spell, "id" | "name">): Spell {
  return {
    ap: 3, rangeMin: 1, rangeMax: 4, editableRange: false, lineOfSight: true, inLine: false,
    perTurn: 0, perTarget: 0, cooldown: 0, initialCooldown: 0, critical: 0,
    categories: [], effects: [], conditions: [], ...p,
  };
}

export const VOCAB: Vocabulary = {
  tags: {
    one_shot: { category: "danger", label: "One-shot", param: "condition", icon: "spell/effect/77.webp" },
    kill_first: { category: "tip", label: "Tuer en premier", param: "optional", icon: null },
    phase: { category: "mechanic", label: "Change de phase", param: "when", icon: null },
    flees: { category: "mechanic", label: "Fuyard", param: "none", icon: null },
  },
};

export function makeSnapshot(): Snapshot {
  const dungeons: Dungeon[] = [
    { id: 165, name: "Autel de la Déchireuse", level: 200, monsterIds: [8037, 8040], maps: [] },
    { id: 1, name: "Cour du Bouftou Royal", level: 30, monsterIds: [101], maps: [] },
  ];
  const monsters: Monster[] = [
    monster({ id: 8037, name: "Déchireuse", boss: true, levelMin: 220, levelMax: 220, dungeonIds: [165] }),
    monster({ id: 8040, name: "Voracle", levelMin: 212, levelMax: 212, dungeonIds: [165] }),
    monster({ id: 36, name: "Bouftou", levelMin: 1, levelMax: 6, subareas: ["Coin des Bouftous"] }),
    monster({ id: 101, name: "Bouftou", levelMin: 22, levelMax: 30, dungeonIds: [1], subareas: ["Cour du Bouftou Royal"] }),
    monster({ id: 3332, name: "Bouftou", levelMin: 20, levelMax: 200 }),
  ];
  return {
    dungeons: new Map(dungeons.map((d) => [d.id, d])),
    monsters: new Map(monsters.map((m) => [m.id, m])),
    spells: new Map(),
    summaries: new Map(),
    vocabulary: VOCAB,
    icons: new Set(),
  };
}

/** French texts carry narrow no-break spaces (« Exemple : ») : tests compare them with plain spaces. */
/** Text without its French typography (narrow spaces, ’), to compare with plain strings. */
export const plain = (text: string | null | undefined): string => (text ?? "").replaceAll(String.fromCharCode(0x202f), " ").replaceAll("’", "'");

/** A badge's visible text, without the category told to screen readers (« Danger, »). */
export const badgeText = (el: Element | null): string => {
  const copy = el?.cloneNode(true) as Element | undefined;
  copy?.querySelectorAll(".sr-only").forEach((e) => e.remove());
  return plain(copy?.textContent);
};
