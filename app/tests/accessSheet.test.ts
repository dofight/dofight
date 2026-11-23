import { afterEach, describe, expect, it } from "vitest";
import type { PlaceAccess } from "../src/access";
import { setLang } from "../src/i18n";
import { renderAccessSheet, sheetCopied, sheetCopy } from "../src/render/accessSheet";
import type { Trip } from "../src/travel";

const quest = (id: number, fr: string, x: number, y: number) => ({ quest: { id, fr, en: `${fr} EN`, level: 35, start: { x, y } } });
const baleine: PlaceAccess = {
  level: 190, key: { fr: "Clef du Ventre", en: "Belly Key" }, offKeyring: false, areaName: "Île d'Otomaï", areaEn: "Otomai Island", dimension: false,
  areaReqs: [quest(231, "Le nouveau monde", 15, 28), quest(232, "L'île des naufragés", -43, 2)],
  ownReqs: [], guide: "https://www.dofuspourlesnoobs.com/ventre.html",
};
const zaapTrip: Trip = { to: { x: -55, y: 15, world: 1 }, zaap: { x: -46, y: 18, world: 1, zone: { fr: "Port de Madrestam", en: "Madrestam Harbour" } } };

/** The sheet as a DOM, its texts with French narrow spaces made plain. */
function sheet(pa: PlaceAccess | null, trip: Trip | null = zaapTrip, title = "Ventre de la Baleine") {
  const box = document.createElement("div");
  box.innerHTML = renderAccessSheet(title, pa, trip);
  const text = (el: Element | null) => (el?.textContent ?? "").replace(/[  ]/g, " ").replace(/’/g, "'");
  return { box, text, all: text(box) };
}

afterEach(() => setLang("fr"));

describe("the « Comment y aller » sheet", () => {
  it("lists the requirements, then the route, then the guide", () => {
    const { box, all } = sheet(baleine);
    const order = ["Comment y aller : Ventre de la Baleine", "Prérequis", "Accès (Île d'Otomaï) :",
      "Le nouveau monde", "L'île des naufragés", "Trajet"];
    let at = -1;
    for (const part of order) {
      const i = all.indexOf(part, at + 1);
      expect(i, part).toBeGreaterThan(at);
      at = i;
    }
    const copies = [...box.querySelectorAll<HTMLElement>(".travel")].map((b) => b.dataset.copy);
    expect(copies).toEqual(["/travel -55 15", "/zaap -46 18 ; /travel -55 15"]); // the quests: no /travel (owner, 2026-11-20)
    expect(box.querySelectorAll(".needs .travel")).toHaveLength(0);
    expect(box.querySelector<HTMLAnchorElement>("a.guide")!.href).toBe("https://www.dofuspourlesnoobs.com/ventre.html");
  });

  it("a quest with its DPLN page is a link to it", () => {
    const pa: PlaceAccess = { ...baleine, areaReqs: [{ quest: { id: 231, fr: "Le nouveau monde", en: "The New World", level: 35, start: null, url: "https://www.dofuspourlesnoobs.com/le-nouveau-monde.html" } }] };
    const link = sheet(pa).box.querySelector<HTMLAnchorElement>("a.quest")!;
    expect(link.href).toBe("https://www.dofuspourlesnoobs.com/le-nouveau-monde.html");
    expect(link.textContent).toBe("Le nouveau monde");
    expect(sheet(baleine).box.querySelector("a.quest")).toBeNull(); // no page: plain text
  });

  it("shows the level of a quest", () => {
    const { box, all } = sheet({ ...baleine, areaReqs: [{ quest: { id: 1, fr: "Sans départ", en: "x", level: 80, start: null } }] });
    expect(all).toContain("Sans départ (niv. 80)");
    expect(box.querySelectorAll(".needs .travel")).toHaveLength(0);
  });

  it("a written route replaces « Aller en » and the zaap", () => {
    const trip: Trip = { to: { x: -63, y: -76, world: 1, route: ["/zaap -78 -41", "Transporteur frigostien → Larmes d'Ouronigride", "/travel -63 -76"] }, zaap: zaapTrip.zaap };
    const { box, all } = sheet(baleine, trip);
    expect(all).toContain("Transporteur frigostien → Larmes d'Ouronigride");
    expect(box.querySelectorAll(".route .travel")).toHaveLength(2);
    expect(box.querySelector(".zaap")).toBeNull();
  });

  it("no level, and the key only when it is off the keyring (owner, 2026-11-20)", () => {
    expect(sheet(baleine).all).not.toMatch(/Niveau 190|Clef du Ventre/);
    expect(sheet({ ...baleine, offKeyring: true }).all).toContain("Clef du Ventre (hors trousseau)");
    expect(sheet({ ...baleine, offKeyring: true }).all).not.toContain("Clef : Clef"); // the key's name says it is a key
    expect(sheet(baleine).box.querySelector(".reqs ol")).toBeNull(); // bullets: requirements are not steps
  });

  it("a dimension heads its lines « Accès dimension X : » (owner review, 2026-11-22)", () => {
    const pa: PlaceAccess = { ...baleine, areaName: "Osavora", dimension: true, areaReqs: [{ level: 50 }, { other: { fr: "Faire la chasse d'Osavora une fois.", en: "Do the hunt." } }] };
    const { all } = sheet(pa);
    expect(all).toContain("Accès dimension Osavora :");
    expect(all).toContain("Niveau 50 minimum");
    expect(all).toContain("Faire la chasse d'Osavora une fois.");
    expect(all).not.toContain("Accès (");
  });

  it("its own requirements: a dungeon to beat, an item and how, a choice, an event", () => {
    const pa: PlaceAccess = {
      ...baleine, areaReqs: [], ownReqs: [
        { beat: { id: 59, fr: "Antre du Korriandre", en: "Korriandre's Lair" } },
        { item: { fr: "Baguette Rikiki", en: "Rikiki Wand" }, how: { fr: "L'équiper.", en: "Equip it." } },
        { anyOf: [{ item: { fr: "Baguette Rikiki", en: "Rikiki Wand" } }, quest(2520, "Un problème de taille", 0, 18)] },
        { event: { fr: "Ouvert seulement l'été.", en: "Summer only." } },
      ],
    };
    const { all } = sheet(pa);
    expect(all).not.toContain("Ce lieu");
    expect(all).toContain("Terminer le donjon Antre du Korriandre");
    expect(all).toContain("Baguette Rikiki : L'équiper.");
    expect(all).toContain("Au choix :");
    expect(all).toContain("Un problème de taille");
    expect(all).toContain("Ouvert seulement l'été.");
  });

  it("a zone: no level or key line", () => {
    const { all } = sheet({ ...baleine, level: null, key: null, guide: null }, zaapTrip, "Jungle obscure");
    expect(all).not.toContain("Niveau");
    expect(all).toContain("Accès (Île d'Otomaï) :");
  });

  it("only a route (nothing in the access data): no « Prérequis »", () => {
    const trip: Trip = { to: { x: 1, y: 2, world: 1, route: ["/travel 1 2"] }, zaap: null };
    const { all } = sheet(null, trip);
    expect(all).not.toContain("Prérequis");
    expect(all).toContain("Trajet");
  });

  it("in English: English names and texts", () => {
    setLang("en");
    const { all } = sheet({ ...baleine, ownReqs: [{ other: { fr: "Au moins 4", en: "At least 4" } }] });
    expect(all).toContain("How to get there: Ventre de la Baleine");
    expect(all).not.toContain("Belly Key"); // on the keyring: not shown
    expect(all).toContain("Le nouveau monde EN (lvl 35)");
    expect(all).toContain("At least 4");
    expect(all).toContain("Access (Otomai Island):");
  });

  it("in English, an item's how-to follows a plain colon", () => {
    setLang("en");
    const { all } = sheet({ ...baleine, areaReqs: [], ownReqs: [{ item: { fr: "Multygely", en: "Multijely" }, how: { fr: "x", en: "No key." } }] });
    expect(all).toContain("Multijely: No key.");
  });

  it("a position in a requirement's text is a /travel button", () => {
    const { box } = sheet({ ...baleine, areaReqs: [], ownReqs: [{ other: { fr: "Parler à Daoh en [15,-31].", en: "Talk to Daoh at [15,-31]." } }] });
    expect(box.querySelector<HTMLElement>(".needs .travel")!.dataset.copy).toBe("/travel 15 -31");
  });

  it("escapes every text", () => {
    const { box } = sheet({ ...baleine, ownReqs: [{ other: { fr: "<b>x</b>", en: "y" } }] }, zaapTrip, "<i>t</i>");
    expect(box.querySelector("b.x, i")).toBeNull();
    expect(box.innerHTML).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("copying from the sheet (the side window cannot take the focus)", () => {
  it("sends the command to the panel, then the button says « Copié » in place of its text", () => {
    const { box } = sheet(baleine);
    const sent: string[] = [];
    const button = box.querySelectorAll<HTMLElement>(".travel")[0];
    expect(sheetCopy(button.querySelector(".lbl")!, (c) => sent.push(c))).toBe(true);
    expect(sent).toEqual(["/travel -55 15"]);
    expect(button.classList.contains("copied")).toBe(false); // not before the panel says the clipboard took it
    sheetCopied(box, "/travel -55 15", true);
    expect(button.querySelector(".lbl")!.textContent).toBe("Copié");
    expect(box.querySelector(".copied-tag, .access-sheet > .tripmsg")).toBeNull();
  });

  it("says so in the button when the clipboard refused", () => {
    const { box } = sheet(baleine);
    sheetCopied(box, "/travel -55 15", false);
    expect(box.querySelector(".travel .lbl")!.textContent).toBe("Copie impossible");
  });

  it("ignores a click elsewhere", () => {
    const { box } = sheet(baleine);
    const sent: string[] = [];
    expect(sheetCopy(box.querySelector("h3")!, (c) => sent.push(c))).toBe(false);
    expect(sent).toEqual([]);
  });
});
