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
    const order = ["Comment y aller : Ventre de la Baleine", "Prérequis", "Niveau 190", "Clef du Ventre", "Accès (Île d'Otomaï) :",
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

  it("a key off the keyring says so", () => {
    expect(sheet({ ...baleine, offKeyring: true }).all).toContain("Clef du Ventre · hors trousseau");
  });

  it("a dimension heads its lines « Dimension X : »", () => {
    const pa: PlaceAccess = { ...baleine, areaName: "Osavora", dimension: true, areaReqs: [{ level: 50 }, { other: { fr: "Faire la chasse d'Osavora une fois.", en: "Do the hunt." } }] };
    const { all } = sheet(pa);
    expect(all).toContain("Dimension Osavora :");
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
    expect(all).toContain("Vaincre Antre du Korriandre");
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
    expect(all).toContain("Belly Key");
    expect(all).toContain("Le nouveau monde EN (lvl 35)");
    expect(all).toContain("At least 4");
    expect(all).toContain("Access (Otomai Island):");
  });

  it("escapes every text", () => {
    const { box } = sheet({ ...baleine, ownReqs: [{ other: { fr: "<b>x</b>", en: "y" } }] }, zaapTrip, "<i>t</i>");
    expect(box.querySelector("b.x, i")).toBeNull();
    expect(box.innerHTML).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("copying from the sheet (the side window cannot take the focus)", () => {
  it("sends the command to the panel, then says « Copié » right after the button", () => {
    const { box } = sheet(baleine);
    const sent: string[] = [];
    const button = box.querySelectorAll<HTMLElement>(".travel")[0];
    expect(sheetCopy(button.querySelector(".lbl")!, (c) => sent.push(c))).toBe(true);
    expect(sent).toEqual(["/travel -55 15"]);
    expect(box.querySelector(".copied-tag")).toBeNull(); // not before the panel says the clipboard took it
    sheetCopied(box, "/travel -55 15", true);
    expect(button.classList.contains("copied")).toBe(true);
    const tag = button.nextElementSibling!;
    expect(tag.classList.contains("copied-tag")).toBe(true);
    expect(tag.textContent).toBe("Copié");
    expect(box.querySelector(".access-sheet > .tripmsg")).toBeNull(); // no line of its own under the sheet
    sheetCopied(box, "/travel -55 15", true); // copied again: still one tag
    expect(box.querySelectorAll(".copied-tag")).toHaveLength(1);
  });

  it("says so beside the button when the clipboard refused", () => {
    const { box } = sheet(baleine);
    sheetCopied(box, "/travel -55 15", false);
    expect(box.querySelector(".copied-tag")!.textContent).toBe("Copie impossible");
    expect(box.querySelector(".copied")).toBeNull();
  });

  it("ignores a click elsewhere", () => {
    const { box } = sheet(baleine);
    const sent: string[] = [];
    expect(sheetCopy(box.querySelector("h3")!, (c) => sent.push(c))).toBe(false);
    expect(sent).toEqual([]);
  });
});
