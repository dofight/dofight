import { describe, expect, it } from "vitest";
import { renderRoute, renderTrip, travelCommand, tripTo, zaapCommand, type Travel } from "../src/travel";

const zaap = (x: number, y: number, fr: string, world = 1) => ({ x, y, world, zone: { fr, en: `${fr} EN` } });
const travel: Travel = {
  zaaps: [zaap(-27, -36, "Plaines de Cania"), zaap(-5, -23, "Village d'Amakna"), zaap(-2, -2, "Incarnam", 2)],
  dungeons: { "1": { x: 2, y: -34, world: 1 } },
  zones: { "Routes Rocailleuses": { x: -20, y: -34, world: 1 }, "Lac d'Incarnam": { x: 0, y: 0, world: 2 } },
};

describe("how to get there", () => {
  it("goes to a dungeon's entrance, from the nearest zaap counted in maps walked", () => {
    expect(tripTo(travel, 1, "Cour du Bouftou Royal")).toEqual({ to: { x: 2, y: -34, world: 1 }, zaap: travel.zaaps[1] });
  });

  it("goes to a zone's middle; a zaap of another world map does not count", () => {
    expect(tripTo(travel, null, "Routes Rocailleuses")!.zaap!.zone.fr).toBe("Plaines de Cania");
    expect(tripTo(travel, null, "Lac d'Incarnam")!.zaap!.zone.fr).toBe("Incarnam");
    expect(tripTo({ ...travel, zaaps: [] }, null, "Routes Rocailleuses")).toEqual({ to: travel.zones["Routes Rocailleuses"], zaap: null });
  });

  it("knows nothing of an unknown place, or without the data", () => {
    expect(tripTo(travel, 999, "x")).toBeNull();
    expect(tripTo(travel, null, "Nulle part")).toBeNull();
    expect(tripTo(undefined, 1, "x")).toBeNull();
  });

  it("like Ganymède: [x,y] copies /travel x y, the zaap copies /zaap then /travel", () => {
    expect(travelCommand({ x: 3, y: -21, world: 1 })).toBe("/travel 3 -21");
    expect(zaapCommand({ x: 5, y: -18, world: 1 }, { x: 3, y: -21, world: 1 })).toBe("/zaap 5 -18 ; /travel 3 -21");
    const box = document.createElement("div");
    box.innerHTML = renderTrip(tripTo(travel, null, "Routes Rocailleuses"));
    const [go, zaap] = box.querySelectorAll<HTMLElement>(".travel");
    expect(go.textContent).toBe("[-20,-34]");
    expect(go.dataset.copy).toBe("/travel -20 -34");
    expect(zaap.textContent).toBe("Plaines de Cania");
    expect(zaap.dataset.copy).toBe("/zaap -27 -36 ; /travel -20 -34");
    // a small copy icon after each, and a line that tells where to paste once copied
    expect(go.querySelector("svg.ic-copy")).not.toBeNull();
    expect(zaap.querySelector("svg.ic-copy")).not.toBeNull();
    expect(box.querySelector(".tripmsg")!.getAttribute("role")).toBe("status");
    // no zaap on that world map: only the coordinates
    box.innerHTML = renderTrip({ to: { x: 1, y: 2, world: 9 }, zaap: null });
    expect(box.querySelectorAll(".travel").length).toBe(1);
    expect(renderTrip(null)).toBe("");
  });

  it("shows a written route instead of the nearest zaap: its steps in order, commands to copy", () => {
    const box = document.createElement("div");
    const route = ["/zaap -78 -41", "Transporteur frigostien → Larmes d'Ouronigride", "/travel -69 -87"];
    box.innerHTML = renderTrip({ to: { x: -69, y: -87, world: 1, route }, zaap: zaap(-50, -50, "Somewhere") });
    expect([...box.querySelectorAll(".step")].map((li) => li.textContent)).toEqual(route);
    expect([...box.querySelectorAll(".travel")].map((b) => (b as HTMLElement).dataset.copy)).toEqual(["/zaap -78 -41", "/travel -69 -87"]);
    expect(box.querySelector(".zaap")).toBeNull(); // no computed zaap beside a written route
  });

  it("a route step can link a quest to its page: [name](https://…)", () => {
    const box = document.createElement("div");
    box.innerHTML = renderRoute(["Prendre le Transporteur frigostien (ou des skis, après [Star ski et Dutch](https://www.dofuspourlesnoobs.com/star-ski-et-dutch.html))"]);
    const link = box.querySelector<HTMLAnchorElement>("a.quest")!;
    expect(link.href).toBe("https://www.dofuspourlesnoobs.com/star-ski-et-dutch.html");
    expect(link.textContent).toBe("Star ski et Dutch");
    expect(box.querySelector(".step")!.textContent).toBe("Prendre le Transporteur frigostien (ou des skis, après Star ski et Dutch)");
    // only https links; anything else stays text
    box.innerHTML = renderRoute(["[x](javascript:alert(1)) <b>"]);
    expect(box.querySelector("a")).toBeNull();
    expect(box.querySelector("b")).toBeNull();
  });

  it("game icons: the zaap on a /zaap command, footprints on a /travel one, the skis where a step says {skis}", () => {
    const box = document.createElement("div");
    box.innerHTML = renderRoute(["/zaap -78 -41 ; /travel -68 -34", "Prendre le Transporteur (ou une {skis} Paire de skis rustiques jetables)", "/travel -71 -83", "{autre}"]);
    const [zaapStep, travelStep] = box.querySelectorAll<HTMLElement>(".travel");
    expect(zaapStep.querySelector("img")!.getAttribute("src")).toBe("/icons/hud/zaap.png");
    expect(travelStep.querySelector("img")!.getAttribute("src")).toBe("/icons/hud/steps.png");
    const steps = box.querySelectorAll(".step");
    expect(steps[1].querySelector("img")!.getAttribute("src")).toBe("/icons/hud/skis.png");
    expect(steps[1].textContent).toBe("Prendre le Transporteur (ou une  Paire de skis rustiques jetables)");
    expect(steps[3].textContent).toBe("{autre}"); // an unknown mark stays text
    // « Aller en [x,y] » too: footprints
    box.innerHTML = renderTrip(tripTo(travel, 1, "x"));
    expect(box.querySelector(".travel:not(.zaap) img")!.getAttribute("src")).toBe("/icons/hud/steps.png");
  });

  describe("« Comment y aller » in the header", () => {
    const route = ["/zaap -78 -41", "Transporteur frigostien → Larmes d'Ouronigride", "/travel -69 -87"];
    const box = document.createElement("div");
    const plain = (html: string) => { box.innerHTML = html; return (box.textContent ?? "").replace(/[  ]/g, " "); };

    it("special with a written route: « Aller en », no zaap, no steps, the button", () => {
      box.innerHTML = renderTrip({ to: { x: -69, y: -87, world: 1, route }, zaap: zaap(-50, -50, "Somewhere") }, { special: true });
      expect(box.querySelector(".travel")!.textContent).toBe("[-69,-87]");
      expect(box.querySelector(".zaap")).toBeNull();
      expect(box.querySelector(".step")).toBeNull();
      expect(box.querySelector("button.access")!.getAttribute("aria-expanded")).toBe("false");
    });

    it("special without a route: the zaap stays, then the button", () => {
      box.innerHTML = renderTrip(tripTo(travel, 1, "x"), { special: true });
      expect(box.querySelector(".zaap")).not.toBeNull();
      expect(box.querySelector("button.access")).not.toBeNull();
    });

    it("not special: today's line, then the key", () => {
      const key = { fr: "Clef de la Cour du Bouftou Royal", en: "Royal Gobball Key" };
      const text = plain(renderTrip(tripTo(travel, 1, "x"), { key }));
      expect(text).toContain("· Clef de la Cour du Bouftou Royal");
      expect(box.querySelector("button.access")).toBeNull();
      expect(plain(renderTrip(tripTo(travel, 1, "x"), { key, offKeyring: true }))).toContain("Clef de la Cour du Bouftou Royal · hors trousseau");
    });

    it("special with no known position: the button alone", () => {
      box.innerHTML = renderTrip(null, { special: true });
      expect(box.querySelector("button.access")).not.toBeNull();
      expect(box.querySelector(".travel")).toBeNull();
      expect(renderTrip(null, { key: { fr: "k", en: "k" } })).toBe("");
    });

    it("no options: exactly today's line", () => {
      const trip = tripTo(travel, 1, "x");
      expect(renderTrip(trip, {})).toBe(renderTrip(trip));
    });
  });
});
