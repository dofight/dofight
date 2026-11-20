import { afterEach, describe, expect, it } from "vitest";
import { applyI18n, DICTIONARIES, getLang, setLang, setPlatform, t, type Key } from "../src/i18n";
import { renderMonster } from "../src/render/monster";
import { zoneSummary } from "../src/render/panel";
import { renderSpellSheet } from "../src/render/spellSheet";
import { zoneLabel } from "../src/render/zone";
import { levelRange } from "../src/search";
import { DEFAULTS, loadSettings } from "../src/settings";
import { shortcutLabel } from "../src/shortcut";
import { themeById, themeName } from "../src/theme";
import type { Display, Vocabulary } from "../src/types";
import { makeSnapshot, monster, plain, spell } from "./fixtures";

afterEach(() => {
  setLang("fr");
  setPlatform("windows");
});

const noIcon = () => null;
const ALL: Display = {
  roomSummary: true, thumbnails: true, tagsDanger: true, tagsTip: true, tagsMechanic: true,
  resistances: true, spells: true, spellBadges: true, details: true,
};
const vocab: Vocabulary = {
  tags: { revives: { category: "danger", label: "Ressuscite ses alliés", labelEn: "Revives allies", param: "optional", icon: null } },
};

describe("dictionaries", () => {
  it("on a Mac, no text names Windows or the PC (a .mac variant takes over), in both languages", () => {
    setPlatform("macos");
    for (const lang of ["fr", "en"] as const) {
      setLang(lang);
      for (const key of Object.keys(DICTIONARIES.fr) as Key[]) {
        if (key.endsWith(".mac")) continue;
        expect(t(key), `${lang} ${key}`).not.toMatch(/Windows|PC/);
      }
    }
  });

  it("the screen-recording message says where to allow it", () => {
    setPlatform("macos");
    expect(t("status.noPermission")).toContain("Enregistrement de l’écran"); // French typography: ’
    setLang("en");
    expect(t("status.noPermission")).toContain("Screen Recording");
  });

  it("have the same keys in French and English, none empty", () => {
    expect(Object.keys(DICTIONARIES.en).sort()).toEqual(Object.keys(DICTIONARIES.fr).sort());
    for (const lang of ["fr", "en"] as const) {
      for (const [key, text] of Object.entries(DICTIONARIES[lang])) expect(text.trim(), `${lang} ${key}`).not.toBe("");
    }
  });

  it("use the same {placeholders} in both languages", () => {
    const names = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(DICTIONARIES.fr) as (keyof typeof DICTIONARIES.fr)[]) {
      expect(names(DICTIONARIES.en[key]), key).toEqual(names(DICTIONARIES.fr[key]));
    }
  });

  it("are French by default and interpolate variables", () => {
    expect(getLang()).toBe("fr");
    expect(plain(t("settings.example", { name: "Serre du Royalmouth" }))).toBe("Exemple : Serre du Royalmouth");
    setLang("en");
    expect(plain(t("settings.example", { name: "Serre du Royalmouth" }))).toBe("Example: Serre du Royalmouth");
  });
});

describe("applyI18n", () => {
  it("fills text, placeholder, title and aria-label", () => {
    const root = document.createElement("div");
    root.innerHTML = `<b data-i18n="app.settings">Paramètres</b><input data-i18n-placeholder="main.searchPlaceholder" data-i18n-aria="main.search"><button data-i18n-title="app.hide"></button>`;
    setLang("en");
    applyI18n(root);
    expect(root.querySelector("b")!.textContent).toBe("Settings");
    expect(root.querySelector("input")!.getAttribute("placeholder")).toBe("Monster, subarea or dungeon…");
    expect(root.querySelector("input")!.getAttribute("aria-label")).toBe("Search");
    expect(root.querySelector("button")!.getAttribute("title")).toBe("Hide the panel");
    setLang("fr");
    applyI18n(root);
    expect(root.querySelector("b")!.textContent).toBe("Paramètres");
  });
});

describe("settings", () => {
  const store = (value: unknown) => ({ getItem: () => JSON.stringify(value) });
  it("keep a known language and fall back to French", () => {
    expect(DEFAULTS.lang).toBe("fr");
    expect(loadSettings(store({ lang: "en" })).lang).toBe("en");
    expect(loadSettings(store({ lang: "de" })).lang).toBe("fr");
    expect(loadSettings(store({ lang: 3 })).lang).toBe("fr");
  });
});

describe("English interface", () => {
  it("translates labels, the spell sheet, zones, badges and the level", () => {
    setLang("en");
    expect(t("opt.expandAll")).toBe("Expand all monsters");
    const sheet = renderSpellSheet(spell({ id: 1, name: "Hémorasoir", perTurn: 2, cooldown: 2, critical: 20 }), noIcon);
    expect(sheet).toContain("Casts per turn: 2");
    expect(sheet).toContain("Cooldown: 2 turns");
    expect(sheet).toContain("Range 1–4");
    expect(sheet).toContain("3 AP");
    expect(sheet).toContain("Line of sight");
    expect(zoneLabel("cercle 2", true)).toBe("Circle 2 around the caster");
    expect(zoneLabel("ligne 60", false)).toBe("Line unlimited on the target cell");
    const card = renderMonster(monster({ id: 7, name: "Bouftou", boss: true, levelMin: 5, levelMax: 7 }), new Map(), { tags: [{ id: "revives" }] }, ALL, noIcon, true, vocab);
    expect(card).toContain("Revives allies");
    expect(card).toContain("Lv. 5–7");
    expect(card).toContain('title="Fire resistance"');
    expect(levelRange(monster({ id: 8, name: "Tofu", levelMin: 3, levelMax: 3 }))).toBe("Lv. 3");
    expect(shortcutLabel("Ctrl+Shift+KeyB")).toBe("Ctrl + Shift + B");
    expect(themeName(themeById("default"))).toBe("Default");
    expect(themeName(themeById("bonta"))).toBe("Bonta");
  });

  it("writes the zone summary with the English badge labels", () => {
    const s = { ...makeSnapshot(), vocabulary: vocab, monsterSummaries: new Map([[36, { tags: [{ id: "revives" }] }]]) };
    const bouftou = s.monsters.get(36)!;
    expect(plain(zoneSummary([bouftou], s))).toBe("À surveiller : Bouftou (ressuscite ses alliés).");
    setLang("en");
    expect(zoneSummary([bouftou], s)).toBe("Watch out for: Bouftou (revives allies).");
    expect(zoneSummary([], s)).toBe("Nothing special in this subarea.");
  });

  it("keeps the French label when a badge has no English one", () => {
    setLang("en");
    const fr: Vocabulary = { tags: { revives: { ...vocab.tags.revives, labelEn: undefined } } };
    const card = renderMonster(monster({ id: 7, name: "Bouftou" }), new Map(), { tags: [{ id: "revives" }] }, ALL, noIcon, true, fr);
    expect(card).toContain("Ressuscite ses alliés");
  });
});
