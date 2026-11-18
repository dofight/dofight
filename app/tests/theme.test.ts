import { describe, expect, it } from "vitest";
import { applyTheme, THEMES, themeById, themeVars } from "../src/theme";

describe("themes", () => {
  it("has Dofight's default plus the 11 Dofus themes", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["default", "standard", "bonta", "brakmar", "tribute", "gold", "belladone", "unicorn", "emerald", "sufokia", "pandala", "wabbit"]);
  });

  it("keeps the current colours for « Défaut » and falls back to it for an unknown id", () => {
    expect(themeVars("default")["--card"]).toBe("#21303c");
    expect(themeById("nope").id).toBe("default");
  });

  it("derives dark shades from the theme colour, with its accent", () => {
    const v = themeVars("brakmar");
    expect(v["--gold"]).toBe("#ffc88f");
    const [r, g, b] = v["--win"].split(",").map(Number);
    expect(r).toBeGreaterThan(b); // a red tint
    expect(Math.max(r, g, b)).toBeLessThan(60); // dark enough for light text
  });

  it("applies the variables to a document", () => {
    applyTheme(document.documentElement, "pandala");
    expect(document.documentElement.dataset.theme).toBe("pandala");
    expect(document.documentElement.style.getPropertyValue("--gold")).toBe("#ffe98a");
  });
});
