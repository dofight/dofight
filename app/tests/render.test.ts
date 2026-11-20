import { describe, expect, it } from "vitest";
import { phaseThresholds, renderMonster, renderPeek, renderTags } from "../src/render/monster";
import { renderRoom } from "../src/render/panel";
import { renderSpellSheet } from "../src/render/spellSheet";
import { prose, sentences } from "../src/render/html";
import { renderMechanicSheet } from "../src/render/mechanic";
import type { Display, RoomSummary } from "../src/types";
import { badgeText, makeSnapshot, monster, plain, spell, VOCAB } from "./fixtures";

const ALL: Display = {
  roomSummary: true, thumbnails: true, tagsDanger: true, tagsTip: true, tagsMechanic: true,
  resistances: true, spells: true, spellBadges: true, details: true,
};
const everyIcon = (p: string) => `icons/${p}`;
const noIcon = () => null;

function dom(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

const hemorasoir = spell({
  id: 30921, name: "Hémorasoir", ap: 3, rangeMin: 1, rangeMax: 4, lineOfSight: true, perTurn: 2, perTarget: 1,
  critical: 20, categories: ["dmg_f", "boost", "hinder", "move"],
  effects: [
    { text: "46 à 54 dommages Feu", icon: 7, dispellable: false },
    { text: "-4 PA (1 tour)", icon: 28, dispellable: true },
  ],
  conditions: ["Ne pas posséder l'état Barbarisme"],
});

describe("renderSpellSheet", () => {
  const sheet = dom(renderSpellSheet(hemorasoir, everyIcon));
  const text = plain(sheet.textContent);

  it("shows range, cost and critical chance", () => {
    expect(text).toContain("1–4 PO");
    expect(text).toContain("3 PA");
    expect(text).toContain("20 % CC");
  });

  it("shows effects, limits and conditions", () => {
    expect(text).toContain("46 à 54 dommages Feu");
    expect(text).toContain("Lancers par tour : 2");
    expect(text).toContain("Lancers par cible : 1");
    expect(text).toContain("Ligne de vue");
    expect(text).toContain("Ne pas posséder l'état Barbarisme");
  });

  it("marks dispellable effects only", () => {
    expect(sheet.querySelectorAll('[title="Désenvoûtable"]').length).toBe(1);
  });
});

describe("effect target and area", () => {
  const rinse = spell({
    id: 991, name: "Rinçage", rangeMin: 0, rangeMax: 0,
    effects: [
      { text: "Durée des effets : -2", icon: 73, dispellable: false, target: "enemies", zone: "cercle 2" },
      { text: "51 à 75 soins Feu", icon: 40, dispellable: false, target: "allies", zone: "cercle 2" },
      { text: "16 Dommages Renvoyés", icon: 1, dispellable: false, target: "self", zone: null },
    ],
  });
  const sheet = dom(renderSpellSheet(rinse, everyIcon));
  const effects = [...sheet.querySelectorAll(".eff")];

  it("says who each effect hits", () => {
    expect(effects.map((e) => e.querySelector(".who")?.textContent)).toEqual(["Ennemis", "Alliés", "Lui-même"]);
    expect(effects[0].querySelector(".who")!.className).toContain("enemies");
  });

  it("draws the area as a small grid, described on hover", () => {
    const zone = effects[0].querySelector(".zone")!;
    expect(zone.querySelector("title")!.textContent).toBe("Cercle 2 autour de lui");
    expect(zone.querySelectorAll("rect.on").length).toBe(13); // a circle of radius 2 covers 13 cells
    expect(effects[2].querySelector(".zone")).toBeNull(); // a single cell: no drawing
  });
});

describe("renderMonster", () => {
  const s = makeSnapshot();
  s.spells.set(hemorasoir.id, hemorasoir);
  const m = monster({ id: 8037, name: "Déchireuse", boss: true, res: { n: 25, e: -10, f: 15, w: 15, a: 20 }, spellIds: [30921] });
  const tags = [{ id: "phase", param: "à 50 % PV" }, { id: "kill_first" }, { id: "one_shot", param: "au CaC" }, { id: "laser" }];

  it("shows the resistances right under the level, HP, AP and MP, before the badges", () => {
    const card = dom(renderMonster(m, s.spells, { tags }, ALL, everyIcon, true, VOCAB));
    const order = [...card.querySelectorAll(".lvl, .resrow, .tags")].map((c) => c.className.split(" ")[0]);
    expect(order).toEqual(["lvl", "resrow", "tags"]);
    expect(card.querySelector(".lvl")?.nextElementSibling?.className).toBe("resrow");
  });

  it("shows a folded monster's danger badges as icons on its line (at most 3, then a count)", () => {
    const vocab = { tags: { ...VOCAB.tags, big: { category: "danger" as const, label: "Gros dégâts", param: "optional" as const, icon: null },
      inv: { category: "danger" as const, label: "Invulnérable", param: "optional" as const, icon: null }, heal: { category: "danger" as const, label: "Soigne", param: "optional" as const, icon: null } } };
    const danger = [{ id: "one_shot", param: "au CaC" }, { id: "big" }, { id: "inv" }, { id: "heal" }, { id: "phase" }];
    const folded = dom(renderMonster(m, s.spells, { tags: danger }, ALL, everyIcon, false, vocab));
    const cue = folded.querySelector(".mh .mdanger")!;
    expect(cue.querySelectorAll(".ic-d")).toHaveLength(3);
    expect(cue.textContent).toContain("+1");
    expect(cue.getAttribute("aria-label")).toBe("One-shot · au CaC, Gros dégâts, Invulnérable, Soigne");
    // no danger badge, or danger badges hidden in the settings: nothing
    expect(dom(renderMonster(m, s.spells, { tags: [{ id: "phase" }] }, ALL, everyIcon, false, vocab)).querySelector(".mdanger")).toBeNull();
    expect(dom(renderMonster(m, s.spells, { tags: danger }, { ...ALL, tagsDanger: false }, everyIcon, false, vocab)).querySelector(".mdanger")).toBeNull();
    // an open card shows the badges themselves
    expect(dom(renderMonster(m, s.spells, { tags: danger }, ALL, everyIcon, true, vocab)).querySelector(".mdanger")).toBeNull();
  });

  it("shows a state badge with its state's own icon (French or English name), the generic one otherwise", () => {
    const vocab = { tags: { ...VOCAB.tags, inflicts: { category: "danger" as const, label: "Met en état", param: "what" as const, icon: "spell/effect/54.webp" } },
      stateIcons: { Pesanteur: "states/stateImmobilization.webp", Gravity: "states/stateImmobilization.webp" } };
    const src = (param: string) => dom(renderMonster(m, s.spells, { tags: [{ id: "inflicts", param }] }, ALL, everyIcon, true, vocab)).querySelector(".tag img")?.getAttribute("src");
    expect(src("Pesanteur au CaC")).toBe("icons/states/stateImmobilization.webp");
    expect(src("Affaibli, Pesanteur")).toBe("icons/spell/effect/54.webp"); // the first state names the icon
    expect(src("Gravity in melee")).toBe("icons/states/stateImmobilization.webp");
    // the folded line uses it too
    const folded = dom(renderMonster(m, s.spells, { tags: [{ id: "inflicts", param: "Pesanteur" }] }, ALL, everyIcon, false, vocab));
    expect(folded.querySelector(".mdanger img")?.getAttribute("src")).toBe("icons/states/stateImmobilization.webp");
  });

  it("orders tags danger, tip, mechanic and skips unknown ids", () => {
    // (without the stats line, the phase stays a badge)
    const card = dom(renderMonster(m, s.spells, { tags }, { ...ALL, details: false }, everyIcon, true, VOCAB));
    expect([...card.querySelectorAll(".tag")].map((t) => t.className.split(" ")[1])).toEqual(["danger", "tip", "mechanic"]);
  });

  it("reads the HP thresholds of the phases, not other percentages", () => {
    expect(phaseThresholds(["à 75, 50 et 25 % PV"])).toEqual([75, 50, 25]);
    expect(phaseThresholds(["à 70 % et 40 % PV, début de tour"])).toEqual([70, 40]);
    expect(phaseThresholds(["monture à 50 %, soin 25 % à 1 PV"])).toEqual([50]);
    expect(phaseThresholds(["at 75, 50 and 25% HP"])).toEqual([75, 50, 25]);
    expect(phaseThresholds(["à la mort du Professeur Xa"])).toEqual([]);
  });

  it("shows « Phases » beside the HP, the thresholds on the badge", () => {
    const card = dom(renderMonster(m, s.spells, { tags: [...tags, { id: "phase", param: "à 25 % PV" }] }, ALL, everyIcon, true, VOCAB));
    const phase = card.querySelector(".stats .phase")!;
    expect(phase.hasAttribute("title")).toBe(false); // no tooltip: the badge says the thresholds
    expect(phase.textContent!.replace(/ /g, " ")).toBe("Phases"); // the details are on the badge
    expect(card.querySelector(".tag.mechanic")).not.toBeNull(); // the badge stays, with P1… on hover
    expect(badgeText(card.querySelector(".tag.mechanic")).replace(/ /g, " ")).toBe("Change de phase · 50 %");
    expect(card.querySelector(".tag.mechanic")!.hasAttribute("title")).toBe(false);
    expect(dom(renderMonster(m, s.spells, { tags: [{ id: "one_shot", param: "au CaC" }] }, ALL, everyIcon, true, VOCAB)).querySelector(".phase")).toBeNull();
  });

  it("writes the label, then the parameter", () => {
    const card = dom(renderMonster(m, s.spells, { tags }, ALL, everyIcon, true, VOCAB));
    expect(badgeText(card.querySelector(".tag.danger"))).toBe("One-shot · au CaC");
    expect(badgeText(card.querySelector(".tag.tip"))).toBe("Tuer en premier");
    expect(card.querySelector(".tag.danger img")).not.toBeNull();
  });

  it("says when a monster is harmless", () => {
    const card = dom(renderMonster(m, s.spells, { tags: [] }, ALL, everyIcon, true, VOCAB));
    expect(card.textContent).toContain("Rien de dangereux à signaler");
  });

  it("marks weaknesses and shows every spell badge", () => {
    const card = dom(renderMonster(m, s.spells, { tags }, ALL, everyIcon, true, VOCAB));
    expect(card.querySelector(".r.neg")?.textContent).toContain("-10");
    // a resistance of 0 is muted, a positive one stays in the text colour (no class)
    const zero = dom(renderMonster({ ...m, res: { ...m.res, n: 0 } }, s.spells, { tags }, ALL, everyIcon, true, VOCAB));
    expect(zero.querySelectorAll(".r.zero")).toHaveLength(1);
    expect(zero.querySelectorAll(".r:not(.neg):not(.zero)")).toHaveLength(3);
    expect(card.querySelectorAll(".sp .cats img").length).toBe(4);
    // the hover preview shows a spell's sheet: no native tooltip over it then (the name stays for screen readers)
    const sp = card.querySelector(".sp")!;
    expect(sp.getAttribute("aria-label")).toBeTruthy();
    expect(sp.hasAttribute("title")).toBe(true);
    const peeking = dom(renderMonster(m, s.spells, { tags }, { ...ALL, hoverPeek: true }, everyIcon, true, VOCAB)).querySelector(".sp")!;
    expect(peeking.hasAttribute("title")).toBe(false);
    expect(peeking.getAttribute("aria-label")).toBe(sp.getAttribute("aria-label"));
  });

  it("hides what the display turns off", () => {
    const off = { ...ALL, resistances: false, details: false, tagsMechanic: false, spells: false };
    const card = dom(renderMonster(m, s.spells, { tags }, off, everyIcon, true, VOCAB));
    expect(card.querySelector(".resrow")).toBeNull();
    expect(card.querySelector(".stats")).toBeNull();
    expect(card.querySelector(".spells")).toBeNull();
    expect(card.querySelector(".tag.mechanic")).toBeNull();
  });

  it("renders a bare monster without broken images", () => {
    const bare = monster({ id: 1, name: "Rien" });
    const card = dom(renderMonster(bare, s.spells, undefined, ALL, noIcon));
    expect(card.querySelectorAll("img").length).toBe(0);
    expect(card.querySelector(".spells")).toBeNull();
  });

  it("escapes names", () => {
    const evil = monster({ id: 2, name: "<b>x</b>" });
    expect(dom(renderMonster(evil, s.spells, undefined, ALL, noIcon)).querySelector("b")).toBeNull();
  });
});

describe("renderRoom", () => {
  const s = makeSnapshot();
  const autel = s.dungeons.get(165)!;
  const monsters = autel.monsterIds.map((id) => s.monsters.get(id)!).reverse(); // boss last on purpose

  it("puts the boss first and says nothing when there is no summary", () => {
    const room = dom(renderRoom(autel, monsters, undefined, s, ALL, noIcon));
    expect(room.querySelector(".mob")?.classList.contains("boss")).toBe(true);
    expect(room.querySelector(".empty")).toBeNull();
  });

  it("shows the strategy and the guide link", () => {
    const summary: RoomSummary = { dungeonId: 165, dungeon: "Autel de la Déchireuse", status: "reviewed", strategy: "Tuer le Voracle d'abord.", guide: "https://www.dofuspourlesnoobs.com/autel-de-la-dechireuse.html", monsters: {} };
    const room = dom(renderRoom(autel, monsters, summary, s, ALL, noIcon));
    expect(room.querySelector(".strat")?.textContent).toBe("Tuer le Voracle d’abord."); // the typographic apostrophe
    const link = room.querySelector("a.guide") as HTMLAnchorElement;
    expect(link.textContent).toContain("Guide complet sur Dofus pour les Noobs");
    expect(link.href).toBe(summary.guide);
  });

  it("shows room-level tags under the room summary", () => {
    const summary: RoomSummary = { dungeonId: 165, dungeon: "x", status: "reviewed", strategy: "x", roomTags: [{ id: "phase", param: "vagues aux tours 1, 6, 11" }], monsters: {} };
    const room = dom(renderRoom(autel, monsters, summary, s, ALL, noIcon));
    expect(badgeText(room.querySelector(".roomtags .tag.mechanic"))).toBe("Change de phase · vagues aux tours 1, 6, 11");
  });

  it("only links to https guide pages", () => {
    const bad: RoomSummary = { dungeonId: 165, dungeon: "x", status: "reviewed", strategy: "x", guide: "javascript:alert(1)", monsters: {} };
    expect(dom(renderRoom(autel, monsters, bad, s, ALL, noIcon)).querySelector("a.guide")).toBeNull();
  });

  it("never shows a draft marker", () => {
    const draft: RoomSummary = { dungeonId: 165, dungeon: "Autel de la Déchireuse", status: "draft", strategy: "x", monsters: {} };
    expect(dom(renderRoom(autel, monsters, draft, s, ALL, noIcon)).querySelector(".draft")).toBeNull();
    const done: RoomSummary = { ...draft, status: "reviewed" };
    expect(dom(renderRoom(autel, monsters, done, s, ALL, noIcon)).querySelector(".draft")).toBeNull();
  });

  it("hides the strategy when the display turns it off", () => {
    const summary: RoomSummary = { dungeonId: 165, dungeon: "Autel de la Déchireuse", status: "reviewed", strategy: "x", monsters: {} };
    const room = dom(renderRoom(autel, monsters, summary, s, { ...ALL, roomSummary: false }, noIcon));
    expect(room.querySelector(".strat")).toBeNull();
  });
});

describe("collapsed rows", () => {
  const s = makeSnapshot();
  s.spells.set(hemorasoir.id, hemorasoir);
  const m = monster({ id: 8037, name: "Déchireuse", boss: true, spellIds: [30921] });
  const tags = [{ id: "one_shot", param: "au CaC" }];

  it("a closed row shows only the thumbnail and the name", () => {
    const card = dom(renderMonster(m, s.spells, { tags }, ALL, everyIcon, false, VOCAB));
    expect(card.querySelector(".mh .mname")?.textContent).toBe("Déchireuse");
    expect(card.querySelector(".mh img.thumb")).not.toBeNull();
    expect(card.querySelector(".tags")).toBeNull();
    expect(card.querySelector(".resrow")).toBeNull();
    expect(card.querySelector(".spells")).toBeNull();
    expect(card.querySelector(".mh")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("an open row shows everything", () => {
    const card = dom(renderMonster(m, s.spells, { tags }, ALL, everyIcon, true, VOCAB));
    expect(card.querySelector(".tags")).not.toBeNull();
    expect(card.querySelector(".mh")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("the room opens only the rows asked", () => {
    const autel = s.dungeons.get(165)!;
    const monsters = autel.monsterIds.map((id) => s.monsters.get(id)!);
    const room = dom(renderRoom(autel, monsters, undefined, s, ALL, everyIcon, undefined, (id) => id === 8040));
    const open = [...room.querySelectorAll('.mob[data-open="true"]')].map((e) => (e as HTMLElement).dataset.monster);
    expect(open).toEqual(["8040"]);
  });
});

describe("suggest button", () => {
  it("shows one « Suggestion » button at the bottom of the results, none on the monsters", async () => {
    const { renderMonster } = await import("../src/render/monster");
    const { DEFAULTS } = await import("../src/settings");
    const { monster } = await import("./fixtures");
    const m = monster({ id: 7, name: "Tofu" });
    expect(renderMonster(m, new Map(), undefined, DEFAULTS, () => null)).not.toContain("suggest");
    const s = { ...makeSnapshot(), vocabulary: VOCAB };
    const room = dom(renderRoom(null, [m], undefined, s, { ...ALL, suggest: true }, () => null, "Zone"));
    const buttons = room.querySelectorAll("button.suggest");
    expect(buttons).toHaveLength(1);
    expect(room.querySelector(".room")!.lastElementChild).toBe(buttons[0]);
    // the pencil of the menu's « Envoyer une suggestion », and the same words
    expect(buttons[0].querySelector("svg.ic-edit")).not.toBeNull();
    expect(buttons[0].textContent).toContain("Envoyer une suggestion");
    // the settings' example has none
    expect(dom(renderRoom(null, [m], undefined, s, { ...ALL, suggest: false }, () => null, "Zone")).querySelector(".suggest")).toBeNull();
  });
});

describe("zone order", () => {
  it("lists the zone's own monsters, then archmonsters, wanted, special and event monsters, each labelled", async () => {
    const { monster } = await import("./fixtures");
    const s = makeSnapshot();
    const ms = [
      { ...monster({ id: 1, name: "Évent" }), kind: "event" as const },
      { ...monster({ id: 2, name: "Quêteux" }), kind: "special" as const },
      { ...monster({ id: 3, name: "Recherché" }), kind: "wanted" as const },
      { ...monster({ id: 4, name: "Archi" }), kind: "archmonster" as const },
      { ...monster({ id: 5, name: "Local" }), kind: "normal" as const },
    ];
    const room = dom(renderRoom(null, ms, undefined, s, ALL, noIcon, "Zone"));
    expect([...room.querySelectorAll(".mname")].map((e) => e.textContent)).toEqual(["Local", "Archi", "Recherché", "Quêteux", "Évent"]);
    expect([...room.querySelectorAll(".mkind")].map((e) => e.textContent)).toEqual(["Archimonstre", "Avis de recherche", "Spécial", "Événement"]);
    // stacked under the name, not on the same line
    expect(room.querySelectorAll(".mh > .mkind")).toHaveLength(0);
    expect([...room.querySelectorAll(".mtitle")].map((e) => [e.querySelector(".mname")?.textContent, e.querySelector(":scope > .mkind")?.textContent ?? null]))
      .toEqual([["Local", null], ["Archi", "Archimonstre"], ["Recherché", "Avis de recherche"], ["Quêteux", "Spécial"], ["Évent", "Événement"]]);
  });
});

describe("zone summary", () => {
  it("says nothing special, or names the zone's own monsters with danger badges", async () => {
    const { zoneSummary } = await import("../src/render/panel");
    const { monster, VOCAB } = await import("./fixtures");
    const s = { ...makeSnapshot(), vocabulary: VOCAB };
    const calm = { ...monster({ id: 1, name: "Bouftou" }), kind: "normal" as const };
    const mean = { ...monster({ id: 2, name: "Solfataré" }), kind: "normal" as const };
    const wanted = { ...monster({ id: 3, name: "Bandit" }), kind: "wanted" as const };
    s.monsterSummaries = new Map([
      [2, { tags: [{ id: "one_shot", param: "au CaC" }, { id: "flees" }] }],
      [3, { tags: [{ id: "one_shot", param: "toujours" }] }],
    ]);
    expect(zoneSummary([calm], s)).toBe("Rien de spécial dans cette sous-zone.");
    expect(plain(zoneSummary([calm, mean, wanted], s))).toBe("À surveiller : Solfataré (one-shot au CaC).");
  });
});

describe("special monsters", () => {
  it("are hidden from zone lists unless the option is on", async () => {
    const { monster } = await import("./fixtures");
    const s = makeSnapshot();
    const ms = [{ ...monster({ id: 1, name: "Local" }), kind: "normal" as const }, { ...monster({ id: 2, name: "Œuf de Pwâk" }), kind: "special" as const }];
    const names = (showSpecial: boolean) => [...dom(renderRoom(null, ms, undefined, s, { ...ALL, showSpecial }, noIcon, "Zone")).querySelectorAll(".mname")].map((e) => e.textContent);
    expect(names(false)).toEqual(["Local"]);
    expect(names(true)).toEqual(["Local", "Œuf de Pwâk"]);
    // the monster the player searched for stays visible
    const pinned = [...dom(renderRoom(null, ms, undefined, s, { ...ALL, showSpecial: false }, noIcon, "Zone", () => true, 2)).querySelectorAll(".mname")].map((e) => e.textContent);
    expect(pinned).toEqual(["Local", "Œuf de Pwâk"]);
  });
});

describe("archmonsters", () => {
  it("are hidden from zone lists unless the option is on", async () => {
    const { monster } = await import("./fixtures");
    const s = makeSnapshot();
    const ms = [{ ...monster({ id: 1, name: "Local" }), kind: "normal" as const }, { ...monster({ id: 2, name: "Archi" }), kind: "archmonster" as const }];
    const names = (showArch: boolean) => [...dom(renderRoom(null, ms, undefined, s, { ...ALL, showArch }, noIcon, "Zone")).querySelectorAll(".mname")].map((e) => e.textContent);
    expect(names(false)).toEqual(["Local"]);
    expect(names(true)).toEqual(["Local", "Archi"]);
  });
});

describe("wanted-poster monsters", () => {
  it("are hidden from zone lists unless the option is on", async () => {
    const { monster } = await import("./fixtures");
    const s = makeSnapshot();
    const ms = [{ ...monster({ id: 1, name: "Local" }), kind: "normal" as const }, { ...monster({ id: 2, name: "Bandit" }), kind: "wanted" as const }];
    const names = (showWanted: boolean) => [...dom(renderRoom(null, ms, undefined, s, { ...ALL, showWanted }, noIcon, "Zone")).querySelectorAll(".mname")].map((e) => e.textContent);
    expect(names(false)).toEqual(["Local"]);
    expect(names(true)).toEqual(["Local", "Bandit"]);
  });
});

describe("hover preview", () => {
  const m = monster({ id: 1, name: "Bouftou", boss: true, spellIds: [] });
  const summary = { tags: [{ id: "one_shot", param: "au CaC" }, { id: "phase", param: "à 50 %" }], detail: "Le garder loin." };

  it("shows only the badges and the summary, never the name, numbers or spells", () => {
    const el = dom(renderPeek(m, summary, ALL, everyIcon, VOCAB));
    expect(el.querySelectorAll(".tag")).toHaveLength(2);
    expect(plain(el.querySelector(".detail")?.textContent)).toBe("Le garder loin.");
    expect(el.querySelector(".mname, .stats, .spells, .resrow, .thumb")).toBeNull();
    expect(el.querySelector(".peek.boss")).not.toBeNull();
  });

  it("follows the badge kinds the player shows", () => {
    const el = dom(renderPeek(m, summary, { ...ALL, tagsDanger: false }, everyIcon, VOCAB));
    expect([...el.querySelectorAll(".tag")].map((t) => t.classList.contains("mechanic"))).toEqual([true]);
  });

  it("shows nothing when every badge kind is hidden, or when there is nothing to say", () => {
    expect(renderPeek(m, summary, { ...ALL, tagsDanger: false, tagsTip: false, tagsMechanic: false }, everyIcon, VOCAB)).toBe("");
    expect(renderPeek(m, undefined, ALL, everyIcon, VOCAB)).toBe("");
  });

  it("says a monster is harmless when its summary has no badge", () => {
    expect(dom(renderPeek(m, { tags: [] }, ALL, everyIcon, VOCAB)).querySelector(".empty")).not.toBeNull();
  });
});

describe("boss summons", () => {
  it("are shown right under their boss, labelled, and fold with it", () => {
    const snap = makeSnapshot();
    snap.monsters.set(900, monster({ id: 900, name: "Disciple" }));
    const summary: RoomSummary = { dungeonId: 165, dungeon: "Autel de la Déchireuse", status: "draft", strategy: "", bossSummons: { "8037": [900] }, monsters: { "900": { tags: [], detail: "Ses glyphes comptent." } } };
    const d = snap.dungeons.get(165)!;
    const el = dom(renderRoom(d, d.monsterIds.map((id) => snap.monsters.get(id)!), summary, snap, ALL, noIcon, d.name, () => true));
    const ids = [...el.querySelectorAll<HTMLElement>(".mob")].map((m) => m.dataset.monster);
    expect(ids).toEqual(["8037", "900", "8040"]);
    expect(el.querySelector<HTMLElement>('.mob[data-monster="8037"]')!.dataset.summons).toBe("900");
    const summon = el.querySelector('.mob[data-monster="900"]')!;
    expect(summon.classList.contains("summon") && summon.classList.contains("boss")).toBe(true);
    expect(plain(summon.querySelector(".mkind")?.textContent)).toBe("Invocation");
    expect(summon.querySelector(".detail")?.textContent).toBe("Ses glyphes comptent.");
  });
});

describe("written summaries as bullets", () => {
  it("splits sentences, not abbreviations", () => {
    expect(sentences("Tours impairs : +3 PO. Tsukuyomi gagne. 0 rés. poussée.")).toEqual(["Tours impairs : +3 PO.", "Tsukuyomi gagne.", "0 rés. poussée."]);
  });
  it("keeps one sentence as a line and lists several", () => {
    expect(prose("Le garder loin.", "detail")).toBe('<div class="detail">Le garder loin.</div>');
    const el = document.createElement("div");
    el.innerHTML = prose("Le garder loin. Puis le taper.", "detail");
    expect([...el.querySelectorAll("ul.detail li")].map((li) => li.textContent)).toEqual(["Le garder loin.", "Puis le taper."]);
  });
  it("writes French ordinals with a raised suffix (« 1er », « 2e »), after escaping", () => {
    const el = document.createElement("div");
    el.innerHTML = prose("Au 1er tour, puis au 2e et au 13e <b>", "detail");
    expect([...el.querySelectorAll("sup")].map((s) => s.textContent)).toEqual(["er", "e", "e"]);
    expect(el.textContent).toBe("Au 1er tour, puis au 2e et au 13e <b>");
    // not inside a number or a word, and never in English
    expect(prose("2 PM, 3 PA, 1e5, F2e", "detail")).not.toContain("<sup>");
    const room = document.createElement("div");
    room.innerHTML = renderTags([{ id: "one_shot", param: "au 3e tour" }], VOCAB, ALL, () => null);
    expect(room.querySelector(".tag sup")?.textContent).toBe("e");
  });
});

describe("a zone's watch list", () => {
  it("lists each dangerous monster as a bullet", () => {
    const s = { ...makeSnapshot(), vocabulary: VOCAB };
    const mean = { ...monster({ id: 2, name: "Solfataré" }), kind: "normal" as const };
    s.monsterSummaries = new Map([[2, { tags: [{ id: "one_shot", param: "au CaC" }] }]]);
    const el = document.createElement("div");
    el.innerHTML = renderRoom(null, [mean], undefined, s, ALL, () => null, "Zone");
    expect([...el.querySelectorAll(".strat li")].map((li) => plain(li.textContent))).toEqual(["Solfataré (one-shot au CaC)"]);
  });
});

describe("a zone's watch list, grouped", () => {
  const s = { ...makeSnapshot(), vocabulary: VOCAB };
  const mob = (id: number, name: string) => ({ ...monster({ id, name }), kind: "normal" as const });
  const items = (list: ReturnType<typeof mob>[]) => {
    const el = document.createElement("div");
    el.innerHTML = renderRoom(null, list, undefined, s, ALL, () => null, "Zone");
    return [...el.querySelectorAll(".strat li")].map((li) => plain(li.textContent));
  };
  it("merges monsters with the same badges, and says « every monster » when all share them", () => {
    s.monsterSummaries = new Map([
      [1, { tags: [{ id: "one_shot", param: "au CaC" }] }],
      [2, { tags: [{ id: "one_shot", param: "au CaC" }] }],
      [3, { tags: [{ id: "one_shot", param: "toujours" }] }],
    ]);
    expect(items([mob(1, "Piou Jaune"), mob(2, "Piou Rose"), mob(3, "Bwork")])).toEqual(["Piou Jaune, Piou Rose (one-shot au CaC)", "Bwork (one-shot toujours)"]);
    expect(items([mob(1, "Piou Jaune"), mob(2, "Piou Rose")])).toEqual(["Tous les monstres (one-shot au CaC)"]);
  });
});

describe("mechanic sheets", () => {
  const lunar = { title: "Cycle lunaire", gist: "Une phase par tour.", points: ["Pleine lune : renvoie 200 dommages.", "Ne pas tuer en Pleine lune."], guide: "https://www.dofuspourlesnoobs.com/sanctuaire-de-torkelonia.html" };
  const room = (summary: RoomSummary, show = ALL, d = true) => {
    const s = { ...makeSnapshot(), vocabulary: VOCAB, mechanics: new Map([["lunar-cycle", lunar]]) };
    const el = document.createElement("div");
    el.innerHTML = d ? renderRoom(s.dungeons.get(165) ?? null, [], summary, s, show, () => null) : renderRoom(null, [], summary, s, show, () => null, "Zone");
    return el;
  };
  const base: RoomSummary = { dungeonId: 165, dungeon: "x", status: "draft", strategy: "x", monsters: {} };

  it("shows a chip per known mechanic in the room header, skipping unknown ids", () => {
    const chips = room({ ...base, mechanics: ["lunar-cycle", "nope"] }).querySelectorAll(".roomhead .mech");
    expect([...chips].map((c) => [c.getAttribute("data-mechanic"), c.textContent])).toEqual([["lunar-cycle", "Cycle lunaire"]]);
  });

  it("shows no chip when the room summary is turned off", () => {
    expect(room({ ...base, mechanics: ["lunar-cycle"] }, { ...ALL, roomSummary: false }).querySelector(".mech")).toBeNull();
  });

  it("shows a monster's own sheet as a chip on its open card, not in the room header", () => {
    const s = { ...makeSnapshot(), vocabulary: VOCAB, mechanics: new Map([["lunar-cycle", lunar]]) };
    const boss = monster({ id: 8037, name: "Déchireuse", boss: true });
    const summary = { ...base, monsters: { "8037": { tags: [], mechanics: ["lunar-cycle", "nope"] } } };
    const el = document.createElement("div");
    el.innerHTML = renderRoom(s.dungeons.get(165) ?? null, [boss], summary, s, ALL, () => null);
    expect(el.querySelector(".roomhead .mech")).toBeNull();
    const chips = el.querySelectorAll('.mob[data-monster="8037"] .mech');
    expect([...chips].map((c) => c.getAttribute("data-mechanic"))).toEqual(["lunar-cycle"]);
  });

  it("lists every point of a sheet; only a pinned sheet links to its guide", () => {
    const el = document.createElement("div");
    el.innerHTML = renderMechanicSheet({ ...lunar, guide: "javascript:alert(1)" });
    expect(el.querySelector("b")?.textContent).toBe("Cycle lunaire");
    expect([...el.querySelectorAll("li")].map((li) => plain(li.textContent))).toEqual(lunar.points);
    expect(el.querySelector("a")).toBeNull();
    el.innerHTML = renderMechanicSheet(lunar);
    expect(el.querySelector("a")).toBeNull();
    // a pinned sheet (opened by a click) can be reached: it links to its guide section
    el.innerHTML = renderMechanicSheet(lunar, { link: true });
    expect(el.querySelector("a.guide")?.getAttribute("href")).toBe(lunar.guide);
    el.innerHTML = renderMechanicSheet({ ...lunar, guide: "javascript:alert(1)" }, { link: true });
    expect(el.querySelector("a")).toBeNull();
    // the term before the colon stands out, to scan the points
    el.innerHTML = renderMechanicSheet(lunar);
    expect(el.querySelector("li b")?.textContent).toBe("Pleine lune");
  });

  it("keeps a zone's generated watch list when its summary has mechanics but no written strategy", () => {
    const s = { ...makeSnapshot(), vocabulary: VOCAB, mechanics: new Map([["lunar-cycle", lunar]]) };
    const mean = { ...monster({ id: 2, name: "Solfataré" }), kind: "normal" as const };
    s.monsterSummaries = new Map([[2, { tags: [{ id: "one_shot", param: "au CaC" }] }]]);
    const zone: RoomSummary = { zone: "Zone", dungeonId: 165, dungeon: "x", status: "draft", mechanics: ["lunar-cycle"], monsters: {} };
    const el = document.createElement("div");
    el.innerHTML = renderRoom(null, [mean], zone, s, ALL, () => null, "Zone");
    expect([...el.querySelectorAll(".strat li")].map((li) => plain(li.textContent))).toEqual(["Solfataré (one-shot au CaC)"]);
    expect(el.querySelector(".mech")).not.toBeNull();
  });
});
