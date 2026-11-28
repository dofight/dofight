import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, expect, it, vi } from "vitest";
import { plain } from "./fixtures";

// the real overlay page, its real data, and Tauri replaced by inert stubs
const emitted: { event: string; payload: any }[] = [];
const listeners = new Map<string, (e: { payload: unknown }) => unknown>();
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (event: string, cb: (e: { payload: unknown }) => unknown) => (listeners.set(event, cb), () => {})), emit: vi.fn((event: string, payload: unknown) => emitted.push({ event, payload })) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => []) }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-window-state", () => ({ saveWindowState: vi.fn(), StateFlags: { ALL: 63, VISIBLE: 2 } }));
vi.mock("@tauri-apps/api/window", () => {
  const win = {
    show: vi.fn(), hide: vi.fn(), isVisible: vi.fn(async () => true), setSize: vi.fn(), setPosition: vi.fn(), scaleFactor: vi.fn(async () => 1),
    startDragging: vi.fn(), setResizable: vi.fn(async () => {}), onResized: vi.fn(async () => () => {}), onMoved: vi.fn(async () => () => {}), onCloseRequested: vi.fn(async () => () => {}), isMinimized: vi.fn(async () => false),
    outerPosition: vi.fn(async () => ({ x: 1590, y: 40 })), outerSize: vi.fn(async () => ({ width: 320, height: 1000 })),
    innerPosition: vi.fn(async () => ({ x: 1590, y: 40 })), innerSize: vi.fn(async () => ({ width: 320, height: 1000 })),
  };
  const monitor = { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 };
  return {
    getCurrentWindow: () => win, currentMonitor: vi.fn(async () => monitor), LogicalSize: class {}, LogicalPosition: class {}, PhysicalSize: class {}, PhysicalPosition: class {},
    // the panel asks where the pointer is (main.ts): far away, so the guide's own steps are what is tested
    cursorPosition: vi.fn(async () => ({ x: -1, y: -1 })),
    primaryMonitor: vi.fn(async () => null),
    Window: { getByLabel: vi.fn(async () => win) },
  };
});

const DATA = resolve(__dirname, "../../data");

beforeAll(async () => {
  const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
  vi.stubGlobal("fetch", async (url: string) => {
    try {
      const text = readFileSync(resolve(DATA, url.replace(/^\//, "")), "utf-8");
      return { ok: true, status: 200, json: async () => JSON.parse(text) };
    } catch {
      return { ok: false, status: 404, json: async () => null };
    }
  });
  await import("../src/main");
  await vi.waitFor(() => expect(document.getElementById("status")!.textContent).toBe(""), { timeout: 5000 });
});

/** The handler main.ts gave to `listen(event)` (the Rust side's events, called by hand here). */
function handler(event: string): (e: { payload: unknown }) => unknown {
  return listeners.get(event)!;
}

// a map header as the Windows OCR reads it: the subarea, then the coordinates
const at = (text: string, y: number) => ({ text, x: 8, y, w: 220, h: 18 });
const HEADER = [at("Landes de Sidimote (Gisgoul)", 40), at("-16,19 • Niveau 170", 66)];
const view = () => document.getElementById("view-guide")!;
const click = (id: string) => (document.getElementById(id) as HTMLButtonElement).click();
const last = () => emitted.filter((e) => e.event === "preview:tour").at(-1)!.payload;
const count = () => plain(document.getElementById("tour-count")!.textContent);
const card = () => document.querySelector<HTMLElement>("#guide-steps .guide-step:not([hidden])")!.dataset.step;
/** Clicks « Suivant » until the last step (its button then closes the guide). */
const toLast = () => {
  for (let i = 0; i < 20 && !count().match(/^Étape (\d+) \/ \1$/); i++) click("tour-next");
};

it("opens by itself on the very first use, at its first step, over the monster list", () => {
  expect(view().hidden).toBe(false);
  expect(document.getElementById("view-main")!.hidden).toBe(true);
  expect(card()).toBe("reads");
  expect(plain(document.getElementById("guide-shortcut")!.textContent)).toBe("Ctrl + Maj + D affiche ou masque Dofight, même depuis le jeu.");
  expect(localStorage.getItem("dofight.guide")).toBe("0"); // opened by itself, not seen until the player closes it
  expect(document.activeElement).toBe(document.getElementById("tour-next")); // not the back arrow, which closes it
});

it("shows ✓ once the coordinates and the icon bar are seen in the game, not before", async () => {
  expect(document.getElementById("guide-coords-seen")!.hidden).toBe(true);
  expect(document.getElementById("guide-bar-seen")!.hidden).toBe(true);
  await handler("screen:tick")({ payload: { front: true, lines: HEADER, error: null, bar: "calm" } });
  expect(document.getElementById("guide-coords-seen")!.hidden).toBe(false);
  expect(document.getElementById("guide-bar-seen")!.hidden).toBe(false);
});

it("goes step by step: the setup in the game's corner, then the panel's tour, « C'est parti » at the end", async () => {
  await vi.waitFor(() => expect(count()).toBe("Étape 1 / 16")); // 4 setup steps, 12 for the panel (Torkélonia has them all)
  expect((document.getElementById("tour-prev") as HTMLButtonElement).disabled).toBe(true);
  expect(document.getElementById("guide-top")!.hidden).toBe(false); // the language and the intro: step 1 only
  expect(last().sel).toBe('.corner-part[data-part="all"]');
  expect(last().html).toContain("/guide/corner-fr.png");
  const corner = last().html;
  click("tour-next");
  expect(card()).toBe("coords");
  expect(document.getElementById("guide-top")!.hidden).toBe(true);
  expect(last().sel).toBe('.corner-part[data-part="coords"]');
  expect(last().html).toBe(corner); // the same picture: it loads once
  click("tour-next");
  expect(card()).toBe("bar");
  expect(last().sel).toBe('.corner-part[data-part="bar"]');
  click("tour-next");
  expect(card()).toBe("shortcut");
  expect(last().sel).toBe(".tour-bar");
  expect(plain(last().text)).toBe("Tout le panneau se masque, puis revient avec le même raccourci.");
  click("tour-next");
  expect(card()).toBe("tour");
  expect(last().sel).toBe(".tour-search");
  click("tour-next");
  expect(last().sel).toBe(".tour-filter"); // right after the search, just under it (owner, 2026-11-28)
  for (let i = 0; i < 3; i++) click("tour-next");
  expect(count()).toBe("Étape 9 / 16");
  expect(last().sel).toBe(".roomhead .mech");
  expect(last().html).toContain('class="mech"');
  expect(plain(document.getElementById("tour-text")!.textContent)).toBe(plain(last().text)); // the same text in the panel
  // the open card from its top down, as it is drawn (owner, 2026-11-28): level, HP, AP, MP and resistances together,
  // its states (none on the sample's boss: no step), its badges, then its spells
  click("tour-next");
  expect(last().sel).toContain(".stats");
  expect(last().sel).toContain(".resrow");
  click("tour-next");
  expect(last().sel).toContain(".tags");
  click("tour-next");
  expect(last().sel).toContain(".spells");
  expect(document.getElementById("guide-skip")!.hidden).toBe(false);
  toLast();
  expect(count()).toBe("Étape 16 / 16");
  expect(last().sel).toBe(".tour-menu"); // last: where to find the guide again
  expect(document.getElementById("guide-skip")!.hidden).toBe(true);
  expect(plain(document.getElementById("tour-next")!.textContent)).toBe("C'est parti");
  click("tour-prev");
  expect(count()).toBe("Étape 15 / 16");
  expect(last().sel).toBe(".tour-lock"); // the step before: the padlock
  click("tour-prev");
  expect(last().sel).toBe(".tour-gear"); // and before it the gear, the settings
  click("tour-prev");
  expect(last().sel).toBe('.mob[data-open="false"] .mh'); // and the folded monsters before them
  click("tour-next");
  click("tour-next");
  expect(plain(document.getElementById("tour-next")!.textContent)).toBe("Suivant");
});

it("goes to a setting and comes back to the guide, at the same step, with the settings' back arrow", () => {
  click("guide-to-shortcut");
  expect(document.getElementById("view-settings")!.hidden).toBe(false);
  expect(document.getElementById("card-window")!.hidden).toBe(false);
  expect(document.activeElement).toBe(document.getElementById("shortcut"));
  click("back");
  expect(view().hidden).toBe(false);
  expect(count()).toBe("Étape 15 / 16"); // at the same step
  expect(document.activeElement).toBe(document.getElementById("guide-to-shortcut")); // back on the link it left by
});

it("switches language from the guide itself, staying at its step; the game's corner follows", () => {
  (document.querySelector('#guide-lang .lang[data-lang="en"]') as HTMLButtonElement).click();
  expect(plain(document.getElementById("guide-title")!.textContent)).toBe("Getting started");
  expect(document.querySelector('#guide-lang .lang[data-lang="en"]')!.getAttribute("aria-checked")).toBe("true");
  expect(document.querySelector('#guide-lang .lang[data-lang="fr"]')!.getAttribute("aria-checked")).toBe("false");
  expect(count()).toBe("Step 15 of 16");
  for (let i = 0; i < 15; i++) click("tour-prev");
  expect(last().html).toContain("/guide/corner-en.png");
  (document.querySelector('#guide-lang .lang[data-lang="fr"]') as HTMLButtonElement).click();
  expect(plain(document.getElementById("guide-title")!.textContent)).toBe("Bien démarrer");
  expect(last().html).toContain("/guide/corner-fr.png");
});

it("a fight closes it without marking it seen", async () => {
  // straight from the icon bar: the heart (a fight)
  await handler("screen:tick")({ payload: { front: true, lines: HEADER, error: null, bar: "fight" } });
  await vi.waitFor(() => expect(view().hidden).toBe(true));
  expect(localStorage.getItem("dofight.guide")).toBe("0"); // not closed by the player: it opens again next launch
  await handler("screen:tick")({ payload: { front: true, lines: HEADER, error: null, bar: "calm" } });
});

it("hiding the panel (the shortcut, « – ») leaves the guide where it is", async () => {
  click("guide-open");
  const toggle = handler("panel:toggle");
  await toggle({ payload: null });
  await toggle({ payload: null });
  expect(view().hidden).toBe(false);
  expect(document.getElementById("view-main")!.hidden).toBe(true);
});

it("the settings left another way than their back arrow no longer lead back to the guide", () => {
  click("guide-open");
  click("guide-to-reading");
  click("gear"); // the gear closes the settings too: to the list
  expect(view().hidden).toBe(true);
  click("gear"); // later, the settings opened as usual: their back arrow goes to the list
  click("back");
  expect(view().hidden).toBe(true);
  expect(document.getElementById("view-main")!.hidden).toBe(false);
});

it("says when Windows has no French (the zone line saying it is under the guide)", async () => {
  await handler("screen:tick")({ payload: { front: true, lines: [], error: "no-ocr", bar: null } });
  expect(document.getElementById("guide-ocr")!.hidden).toBe(false);
});

it("reopens from the menu at its first step, « J'ai compris » at the end; it, back and Escape close it and mark it seen", () => {
  for (const close of ["done", "guide-skip", "guide-back", "escape"]) {
    localStorage.removeItem("dofight.guide");
    click("menu-btn");
    (document.querySelector('#menu [data-go="guide-open"]') as HTMLButtonElement).click();
    expect(view().hidden).toBe(false);
    expect(card()).toBe("reads");
    if (close === "escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    else if (close === "done") {
      toLast();
      expect(plain(document.getElementById("tour-next")!.textContent)).toBe("J'ai compris");
      click("tour-next");
    } else click(close);
    expect(view().hidden).toBe(true);
    expect(document.getElementById("view-main")!.hidden).toBe(false);
    expect(localStorage.getItem("dofight.guide")).toBe("1");
  }
});

it("Dofus closed: the two settings in Dofus say « later », until the game shows them (then ✓)", async () => {
  await handler("screen:tick")({ payload: { front: false, lines: [], error: "no-dofus", bar: null } });
  click("guide-open");
  click("tour-next"); // the coordinates
  const later = () => document.querySelector<HTMLElement>('#guide-steps .guide-step[data-step="coords"] .later')!;
  // already seen in an earlier test this session: the ✓ stays and « later » does not show
  expect(later().hidden).toBe(!document.getElementById("guide-coords-seen")!.hidden);
  click("guide-back");
});
