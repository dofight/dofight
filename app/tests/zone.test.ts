import { describe, expect, it } from "vitest";
import { parseZone, SHAPES, zoneLabel } from "../src/render/zone";

/** How many cells of a grid 4 around its anchor the zone covers. */
const lit = (zone: string) => {
  const z = parseZone(zone)!;
  let n = 0;
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (SHAPES[z.shape](x, y, z.size, z.second)) n++;
  return n;
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

  it("lights a checkerboard's cells by the parity of its size: even for « 60 », odd for « 61 » (Kimbo's glyphs)", () => {
    // 9 × 9 around the caster: 41 cells at an even distance, the caster's among them, 40 at an odd one
    expect(lit("damier 60")).toBe(41); // Glyphe pair
    expect(lit("damier 61")).toBe(40); // Glyphe impair: never the caster's own cell
    expect(lit("damier 2")).toBe(9); // the caster and the 8 cells 2 away
  });

  it("spares an inverted circle's middle", () => {
    expect(lit("cercle-inversé 63 2")).toBe(81 - 5); // all but the 5 cells within 1
  });

  it("draws a line from the caster from its first number out to its second", () => {
    // « ligne-lanceur 1 10 » on a spell of range 1 to 10: cells 1 to 10 on the target's side (4 fit here)
    expect(lit("ligne-lanceur 1 10")).toBe(4);
    expect(zoneLabel("ligne-lanceur 1 10", false)).toBe("Ligne 10 partant de lui");
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
