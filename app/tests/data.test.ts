import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DICTIONARIES, frenchSpaces, setLang, t, type Key } from "../src/i18n";

const data = (path: string) => JSON.parse(readFileSync(resolve(__dirname, "../../data", path), "utf-8"));

describe("data the panel relies on", () => {
  it("every badge has an icon that exists (a missing file would leave the badge without one, silently)", () => {
    const vocab = data("summaries/vocabulary.json") as { tags: Record<string, { icon?: string | null }> };
    const icons = new Set(data("icons/index.json") as string[]);
    const missing = Object.entries(vocab.tags).filter(([, tag]) => !tag.icon || !icons.has(tag.icon)).map(([id]) => id);
    expect(missing).toEqual([]);
  });
});

describe("French typography", () => {
  const NNBSP = String.fromCharCode(0x202f);

  it("puts a narrow no-break space before « : ; ! ? % » and inside « »", () => {
    setLang("fr");
    expect(frenchSpaces("Zone : « A » 20 % !")).toBe(`Zone${NNBSP}: «${NNBSP}A${NNBSP}» 20${NNBSP}%${NNBSP}!`);
    setLang("en");
    expect(frenchSpaces("Zone : A")).toBe("Zone : A");
    setLang("fr");
  });

  it("turns straight apostrophes into ’ (French only)", () => {
    setLang("fr");
    expect(frenchSpaces("l'invocation d'Ougah")).toBe("l’invocation d’Ougah");
    setLang("en");
    expect(frenchSpaces("the boss's turn")).toBe("the boss's turn");
    setLang("fr");
  });

  it("no French text of the interface keeps a breakable space before those marks", () => {
    setLang("fr");
    const bad = (Object.keys(DICTIONARIES.fr) as Key[]).filter((key) => / [:;!?%»]|« /.test(t(key)));
    expect(bad).toEqual([]);
  });
});
