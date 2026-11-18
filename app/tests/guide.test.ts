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
    show: vi.fn(), hide: vi.fn(), isVisible: vi.fn(async () => true), setSize: vi.fn(), setPosition: vi.fn(),
    startDragging: vi.fn(), onResized: vi.fn(async () => () => {}), onMoved: vi.fn(async () => () => {}), onCloseRequested: vi.fn(async () => () => {}), isMinimized: vi.fn(async () => false),
    outerPosition: vi.fn(async () => ({ x: 1590, y: 40 })), outerSize: vi.fn(async () => ({ width: 320, height: 1000 })),
    innerPosition: vi.fn(async () => ({ x: 1590, y: 40 })), innerSize: vi.fn(async () => ({ width: 320, height: 1000 })),
  };
  const monitor = { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 };
  return {
    getCurrentWindow: () => win, currentMonitor: vi.fn(async () => monitor), LogicalSize: class {}, LogicalPosition: class {}, PhysicalSize: class {}, PhysicalPosition: class {},
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

it("opens by itself on the very first use, over the monster list, with the player's shortcut", () => {
  expect(view().hidden).toBe(false);
  expect(document.getElementById("view-main")!.hidden).toBe(true);
  expect(plain(document.getElementById("guide-shortcut")!.textContent)).toBe("Ctrl + Maj + D affiche ou masque Dofight, même depuis le jeu.");
  expect(localStorage.getItem("dofight.guide")).toBeNull(); // not seen until the player closes it
  expect(plain(document.getElementById("guide-done")!.textContent)).toBe("C'est parti");
  expect(document.getElementById("guide-skip")).toBeNull(); // the back arrow and Escape skip
});

it("shows ✓ once the coordinates and the icon bar are seen in the game, not before", async () => {
  expect(document.getElementById("guide-coords-seen")!.hidden).toBe(true);
  expect(document.getElementById("guide-bar-seen")!.hidden).toBe(true);
  await handler("screen:tick")({ payload: { front: true, lines: HEADER, error: null, bar: "calm" } });
  expect(document.getElementById("guide-coords-seen")!.hidden).toBe(false);
  expect(document.getElementById("guide-bar-seen")!.hidden).toBe(false);
});

it("goes to a setting and comes back to the guide with the settings' back arrow", () => {
  click("guide-to-shortcut");
  expect(document.getElementById("view-settings")!.hidden).toBe(false);
  expect(document.getElementById("card-window")!.hidden).toBe(false);
  expect(document.activeElement).toBe(document.getElementById("shortcut"));
  click("back");
  expect(view().hidden).toBe(false);
});

it("switches language from the guide itself", () => {
  (document.querySelector('#guide-lang .lang[data-lang="en"]') as HTMLButtonElement).click();
  expect(plain(document.getElementById("guide-title")!.textContent)).toBe("Getting started");
  expect(plain(document.getElementById("guide-shortcut")!.textContent)).toContain("shows or hides Dofight");
  // the chosen button and the picture follow at once
  expect(document.querySelector('#guide-lang .lang[data-lang="en"]')!.getAttribute("aria-checked")).toBe("true");
  expect(document.querySelector('#guide-lang .lang[data-lang="fr"]')!.getAttribute("aria-checked")).toBe("false");
  expect((document.getElementById("guide-corner") as HTMLImageElement).getAttribute("src")).toBe("/guide/corner-en.png");
  (document.querySelector('#guide-lang .lang[data-lang="fr"]') as HTMLButtonElement).click();
  expect(plain(document.getElementById("guide-title")!.textContent)).toBe("Bien démarrer");
  expect((document.getElementById("guide-corner") as HTMLImageElement).getAttribute("src")).toBe("/guide/corner-fr.png");
});

it("a fight closes it without marking it seen", async () => {
  // straight from the icon bar: the heart (a fight)
  await handler("screen:tick")({ payload: { front: true, lines: HEADER, error: null, bar: "fight" } });
  await vi.waitFor(() => expect(view().hidden).toBe(true));
  expect(localStorage.getItem("dofight.guide")).toBeNull();
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

it("reopens from the menu with « J'ai compris »; it, back and Escape close it and mark it seen", () => {
  for (const close of ["guide-done", "guide-back", "escape"]) {
    localStorage.removeItem("dofight.guide");
    click("menu-btn");
    (document.querySelector('#menu [data-go="guide-open"]') as HTMLButtonElement).click();
    expect(view().hidden).toBe(false);
    expect(plain(document.getElementById("guide-done")!.textContent)).toBe("J'ai compris");
    if (close === "escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    else click(close);
    expect(view().hidden).toBe(true);
    expect(document.getElementById("view-main")!.hidden).toBe(false);
    expect(localStorage.getItem("dofight.guide")).toBe("1");
  }
});
