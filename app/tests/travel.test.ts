import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderRoute, renderTrip, showCopied, travelCommand, withPositions, tripTo, zaapCommand, type Travel } from "../src/travel";

const zaap = (x: number, y: number, fr: string, world = 1) => ({ x, y, world, zone: { fr, en: `${fr} EN` } });
const travel: Travel = {
  zaaps: [zaap(-27, -36, "Plaines de Cania"), zaap(-5, -23, "Village d'Amakna"), zaap(-2, -2, "Incarnam", 2)],
  dungeons: { "1": { x: 2, y: -34, world: 1 } },
  zones: { "Routes Rocailleuses": { x: -20, y: -34, world: 1 }, "Lac d'Incarnam": { x: 0, y: 0, world: 2 } },
};

describe("how to get there", () => {
  it("goes to a dungeon's entrance, from the nearest zaap counted in maps walked", () => {
    expect(tripTo(travel, 1, "Cour du Bouftou Royal")).toEqual({ to: { x: 2, y: -34, world: 1 }, zaap: travel.zaaps[1], zaaps: travel.zaaps });
  });

  it("goes to a zone's middle; a zaap of another world map does not count", () => {
    expect(tripTo(travel, null, "Routes Rocailleuses")!.zaap!.zone.fr).toBe("Plaines de Cania");
    expect(tripTo(travel, null, "Lac d'Incarnam")!.zaap!.zone.fr).toBe("Incarnam");
    expect(tripTo({ ...travel, zaaps: [] }, null, "Routes Rocailleuses")).toEqual({ to: travel.zones["Routes Rocailleuses"], zaap: null, zaaps: [] });
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
    // no copy icon: the gold text, the hover and « Copié » say it (owner review, 2026-11-23)
    expect(box.querySelector("svg.ic-copy")).toBeNull();
    expect(box.querySelector(".travel .lbl")!.getAttribute("aria-live")).toBe("polite"); // « Copié » is read out
    // no zaap on that world map: only the coordinates
    box.innerHTML = renderTrip({ to: { x: 1, y: 2, world: 9 }, zaap: null });
    expect(box.querySelectorAll(".travel").length).toBe(1);
    expect(renderTrip(null)).toBe("");
  });

  it("shows a written route instead of the nearest zaap: its steps in order, commands to copy", () => {
    const box = document.createElement("div");
    const route = ["/zaap -78 -41", "Transporteur frigostien → Larmes d'Ouronigride", "/travel -69 -87"];
    const zaaps = [zaap(-78, -41, "La Bourgade")];
    box.innerHTML = renderTrip({ to: { x: -69, y: -87, world: 1, route }, zaap: zaap(-50, -50, "Somewhere"), zaaps });
    expect([...box.querySelectorAll(".step")].map((li) => li.textContent)).toEqual(["La Bourgade", route[1], "[-69,-87]"]);
    expect([...box.querySelectorAll(".travel")].map((b) => (b as HTMLElement).dataset.copy)).toEqual(["/zaap -78 -41", "/travel -69 -87"]);
    expect(box.textContent).not.toContain("Somewhere"); // no computed zaap beside a written route
  });

  it("a route's zaap step is one button: the zaap, the footprints, the zaap's name (owner review, 2026-11-23)", () => {
    const box = document.createElement("div");
    const zaaps = [zaap(-20, -20, "Routes Rocailleuses"), zaap(7, -4, "Port de Madrestam")];
    box.innerHTML = renderRoute(["/zaap -20 -20 ; /travel -22 -24 | Tour des Voyageurs", "/zaap 7 -4 ; /travel -32 -89 | Port de Madrestam", "/zaap 9 9"], false, zaaps);
    const [first, second, third] = [...box.querySelectorAll(".step")];
    const buttons = (li: Element) => [...li.querySelectorAll<HTMLElement>(".travel")].map((b) => [[...b.querySelectorAll("img")].map((i) => i.getAttribute("src")), b.textContent, b.dataset.copy]);
    expect(buttons(first)).toEqual([[["/icons/hud/zaap.png", "/icons/hud/steps.png"], "Routes Rocailleuses", "/zaap -20 -20 ; /travel -22 -24"]]);
    expect(first.textContent).toBe("Routes Rocailleuses Tour des Voyageurs"); // the text after « | » stays
    expect(second.textContent).toBe("Port de Madrestam"); // not twice the zaap's name
    expect(buttons(third)).toEqual([[["/icons/hud/zaap.png"], "/zaap 9 9", "/zaap 9 9"]]); // a zaap alone: no footprints; unknown: its command
    // the header's zaap button too
    box.innerHTML = renderTrip(tripTo(travel, null, "Routes Rocailleuses"));
    expect([...box.querySelectorAll(".zaap img")].map((i) => i.getAttribute("src"))).toEqual(["/icons/hud/zaap.png", "/icons/hud/steps.png"]);
  });

  it("a command in braces in a step's text is its button, so the text can come first (owner review, 2026-11-23)", () => {
    const box = document.createElement("div");
    const zaaps = [zaap(5, -18, "Cité d'Astrub"), zaap(-26, 37, "La Cuirasse")];
    box.innerHTML = renderRoute(["Avec la diligence : {/zaap 5 -18 ; /travel -9 31}", "Sinon : {/zaap -26 37}, puis [-9,31]", "{/zaap x} {/rm -rf}"], false, zaaps);
    const steps = box.querySelectorAll(".step");
    expect(steps[0].textContent).toBe("Avec la diligence : Cité d'Astrub");
    expect(steps[0].querySelector<HTMLElement>(".zaap")!.dataset.copy).toBe("/zaap 5 -18 ; /travel -9 31");
    expect([...steps[1].querySelectorAll<HTMLElement>(".travel")].map((b) => b.dataset.copy)).toEqual(["/zaap -26 37", "/travel -9 31"]);
    expect(steps[2].textContent).toBe("{/zaap x} {/rm -rf}"); // not a command: stays text
    expect(steps[2].querySelector("button")).toBeNull();
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
    // the dark skis and Xélorium's watches (owner review, 2026-11-23)
    box.innerHTML = renderRoute(["{skis_sombres} skis", "{montre_avance} et {montre_retard}"]);
    expect([...box.querySelectorAll(".step img")].map((i) => i.getAttribute("src"))).toEqual(
      ["/icons/hud/skis-sombres.png", "/icons/hud/montre-avance.png", "/icons/hud/montre-retard.png"]);
    // « Aller en [x,y] » too: footprints
    box.innerHTML = renderTrip(tripTo(travel, 1, "x"));
    expect(box.querySelector(".travel:not(.zaap) img")!.getAttribute("src")).toBe("/icons/hud/steps.png");
  });

  it("a command step can go on with text after « | »: the button copies the command only", () => {
    const box = document.createElement("div");
    box.innerHTML = renderRoute(["/travel -68 -34 | ou {skis} Paire de skis rustiques jetables ([Star ski et Dutch](https://www.dofuspourlesnoobs.com/star-ski-et-dutch.html))"]);
    const button = box.querySelector<HTMLElement>(".travel")!;
    expect(button.dataset.copy).toBe("/travel -68 -34");
    expect(button.textContent).toBe("[-68,-34]");
    const step = box.querySelector(".step")!;
    expect(step.querySelector("img[src='/icons/hud/skis.png']")).not.toBeNull();
    expect(step.querySelector("a.quest")!.textContent).toBe("Star ski et Dutch");
    expect(step.textContent).toBe("[-68,-34] ou  Paire de skis rustiques jetables (Star ski et Dutch)");
  });

  it("once copied, the button says « Copié » in place of its text for 1 s, then its text again", () => {
    vi.useFakeTimers();
    const box = document.createElement("div");
    box.innerHTML = renderTrip(tripTo(travel, 1, "x"));
    const button = box.querySelector<HTMLElement>(".travel")!;
    showCopied(button, true);
    expect(button.querySelector(".lbl")!.textContent).toBe("Copié");
    expect(button.classList.contains("copied")).toBe(true);
    showCopied(button, true); // clicked again: still restores the real text
    vi.advanceTimersByTime(1000);
    expect(button.querySelector(".lbl")!.textContent).toBe("[2,-34]");
    expect(button.classList.contains("copied")).toBe(false);
    showCopied(button, false);
    expect(button.querySelector(".lbl")!.textContent).toBe("Copie impossible");
    expect(button.classList.contains("failed")).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(button.querySelector(".lbl")!.textContent).toBe("[2,-34]");
    vi.useRealTimers();
  });

  it("a step's **name** is bold (the zone to pick at the transporter)", () => {
    const box = document.createElement("div");
    box.innerHTML = renderRoute(["Prendre le Transporteur frigostien vers **Larmes d'Ouronigride**", "**<i>x</i>"]);
    const steps = box.querySelectorAll(".step");
    expect(steps[0].querySelector("b")!.textContent).toBe("Larmes d'Ouronigride");
    expect(steps[0].textContent).toBe("Prendre le Transporteur frigostien vers Larmes d'Ouronigride");
    expect(steps[1].querySelector("b, i")).toBeNull(); // unclosed: stays text, and escaped
  });

  it("a copy button's tooltip is the command, nothing more (owner, 2026-11-20)", () => {
    const box = document.createElement("div");
    box.innerHTML = renderTrip(tripTo(travel, null, "Routes Rocailleuses")) + renderRoute(["/zaap -78 -41 ; /travel -68 -34"]);
    expect([...box.querySelectorAll<HTMLElement>(".travel")].map((b) => b.title)).toEqual(["/travel -20 -34", "/zaap -27 -36 ; /travel -20 -34", "/zaap -78 -41 ; /travel -68 -34"]);
  });

  it("a position in a text, [x,y], is a /travel button (owner, 2026-11-20)", () => {
    const box = document.createElement("div");
    box.innerHTML = withPositions("par Fwoued en [-1,33] sur l'île, puis [ 41, -56 ] ; pas [1,2,3] ni [abc]");
    const buttons = [...box.querySelectorAll<HTMLElement>(".travel")];
    expect(buttons.map((b) => b.dataset.copy)).toEqual(["/travel -1 33", "/travel 41 -56"]);
    expect(buttons.map((b) => b.querySelector(".lbl")!.textContent)).toEqual(["[-1,33]", "[41,-56]"]);
    expect(buttons[0].querySelector("img")!.getAttribute("src")).toBe("/icons/hud/steps.png");
    expect(box.textContent).toContain("pas [1,2,3] ni [abc]");
    // in a route step's text too
    box.innerHTML = renderRoute(["Parler à Daoh en [15,-31]"]);
    expect(box.querySelector<HTMLElement>(".travel")!.dataset.copy).toBe("/travel 15 -31");
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

    it("not special: today's line, no key (owner, 2026-11-20)", () => {
      expect(plain(renderTrip(tripTo(travel, 1, "x"), {}))).not.toContain("Clef");
      expect(box.querySelector("button.access")).toBeNull();
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

  it("a copy button's text sits on the line of the text around it (owner review, 2026-11-23)", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\.travel\{[^}]*vertical-align:baseline/);
    expect(css).toContain(".travel .lbl{align-self:baseline}");
  });
});
