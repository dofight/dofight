import { describe, expect, it } from "vitest";
import { renderTrip, travelCommand, tripTo, zaapCommand, type Travel } from "../src/travel";

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
});
