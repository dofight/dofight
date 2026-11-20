import { describe, expect, it } from "vitest";
import { renderZone, zoneLabel } from "../src/render/zone";

const lit = (zone: string) => {
  const div = document.createElement("div");
  div.innerHTML = renderZone(zone, false);
  return div.querySelectorAll("rect.on").length;
};

describe("zone", () => {
  it("draws each game shape with the right number of cells", () => {
    expect(lit("cercle 2")).toBe(13);
    expect(lit("croix 2")).toBe(9);
    expect(lit("croix-diag 1")).toBe(5);
    expect(lit("étoile 1")).toBe(9);
    expect(lit("carré 1")).toBe(9);
    expect(lit("cercle 2 1")).toBe(12); // rings 1 to 2: the centre is spared
    expect(lit("cône 2")).toBe(1 + 3 + 5);
    expect(lit("ligne 3")).toBe(4);
  });

  it("labels sizes, rings, unlimited and inverted areas", () => {
    expect(zoneLabel("étoile 2", true)).toBe("Étoile 2 autour de lui");
    expect(zoneLabel("cercle 3 1", false)).toBe("Cercle 1 à 3 sur la case ciblée");
    expect(zoneLabel("ligne 63", false)).toBe("Ligne illimitée sur la case ciblée");
    expect(zoneLabel("cercle-inversé 63 5", true)).toBe("Cercle inversé à partir de 5 cases autour de lui");
    expect(zoneLabel("cases", false)).toBe("Cases fixes de la carte");
    expect(zoneLabel(null, true)).toBe("Sur lui");
  });

  it("draws an inverted circle with its spared middle", () => {
    const div = document.createElement("div");
    div.innerHTML = renderZone("cercle-inversé 63 2", true);
    expect(div.querySelector("rect.caster")!.classList.contains("on")).toBe(false);
  });
});

describe("zone shapes checked against the game", () => {
  it("draws the boomerang and the rectangle like the game", () => {
    expect(lit("boomerang 2")).toBe(5); // a 3-cell line and two bent ends
    expect(lit("rectangle 1 3")).toBe(12); // 3 wide, 4 deep
    expect(lit("cône 3")).toBe(16);
    expect(lit("demi-cercle 2")).toBe(5);
    expect(lit("fourche 2")).toBe(7);
  });
});
