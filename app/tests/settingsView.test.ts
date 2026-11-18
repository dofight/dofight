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
  localStorage.setItem("dofight.guide", "1"); // the guide (guide.test.ts) stays out of these tests
  await import("../src/main");
  await vi.waitFor(() => expect(document.getElementById("status")!.textContent).toBe(""), { timeout: 5000 });
});

/** The handler main.ts gave to `listen(event)` (the Rust side's events, called by hand here). */
function handler(event: string): (e: { payload: unknown }) => unknown {
  return listeners.get(event)!;
}

it("explains the empty first screen, and says when Dofus is not open", async () => {
  expect(plain(document.getElementById("room")!.textContent)).toContain("Dofight affiche ici les monstres de ta sous-zone");
  const tick = handler("screen:tick");
  await tick({ payload: { front: false, lines: [], error: "no-dofus", bar: null } });
  expect(plain(document.getElementById("room")!.textContent)).toContain("Dofus n'est pas ouvert.");
  expect(plain(document.getElementById("room")!.textContent)).toContain("chercher un monstre");
});

it("draws the settings button as a stroked gear, like the other title bar icons", () => {
  expect(document.querySelector("#gear svg.ic-gear")).not.toBeNull();
  expect(document.getElementById("gear")!.textContent).toBe("");
});

it("opens the settings view quickly, with the example shown by default; the player can turn it off", () => {
  const started = performance.now();
  (document.getElementById("gear") as HTMLButtonElement).click();
  const elapsed = performance.now() - started;
  expect(document.getElementById("view-settings")!.hidden).toBe(false);
  // on by default
  expect(emitted.filter((e) => e.event === "preview:render").length).toBeGreaterThan(0);
  expect(document.getElementById("eye")!.getAttribute("aria-pressed")).toBe("true");
  (document.getElementById("eye") as HTMLButtonElement).click();
  expect(JSON.parse(localStorage.getItem("dofight.settings")!).preview).toBe(false); // the player's choice is kept
  (document.getElementById("eye") as HTMLButtonElement).click();
  expect(JSON.parse(localStorage.getItem("dofight.settings")!).preview).toBe(true);
  const last = emitted.filter((e) => e.event === "preview:render").at(-1)!;
  expect(plain(last.payload.label)).toBe("Exemple : Tertre du long sommeil");
  expect(last.payload.html.match(/class="mob/g)).toHaveLength(6);
  // « Afficher le détail des monstres dans les résultats » off by default: the boss is open (to show the other options), the rest folded
  expect(last.payload.html.match(/data-open="true"/g)).toHaveLength(1);
  expect(last.payload.html).toContain('class="mob boss" data-monster="107" data-open="true"');
  expect(elapsed).toBeLessThan(500);
});

it("toggles a switch quickly", () => {
  const input = document.querySelector<HTMLInputElement>('#view-settings input[data-key="spells"]')!;
  const started = performance.now();
  input.click();
  expect(performance.now() - started).toBeLessThan(500);
  const last = emitted.filter((e) => e.event === "preview:render").at(-1)!;
  expect(last.payload.html).not.toContain('class="spells"');
});

it("moves the opacity slider quickly", () => {
  const slider = document.getElementById("opacity") as HTMLInputElement;
  const started = performance.now();
  for (let i = 0; i < 20; i++) {
    slider.value = String(0.3 + i * 0.03);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }
  expect(performance.now() - started).toBeLessThan(2000);
});

it("groups the window options in their own card; Apparence keeps language, theme and text size", () => {
  const card = (title: string) => [...document.querySelectorAll("#view-settings .card")].find((c) => plain(c.querySelector("h2")?.textContent) === title)!;
  const names = (c: Element) => [...c.querySelectorAll(".switch .optname label")].map((s) => plain(s.textContent));
  const win = card("Fenêtre");
  expect(names(win)).toEqual([]);
  expect(win.querySelector("#shortcut")).not.toBeNull();
  expect(win.querySelector("#opacity")).not.toBeNull();
  // everything that looks at the game sits under the screen reading's own switch (owner, 2026-11-18)
  const reading = card("Lecture de l'écran");
  expect(names(reading)).toEqual(["Suivre ta sous-zone automatiquement", "Ouvrir automatiquement en combat", "Mode Songe automatique", "Masquer hors du jeu"]);
  expect(reading.querySelector('.switch:has([data-key="hideWhenAway"]) .info')).not.toBeNull();
  expect(reading.querySelector(".cardtitle #opt-reading")).not.toBeNull(); // the card's own switch, in its title
  const look = card("Apparence");
  expect(look.querySelector("#lang")).not.toBeNull();
  expect(look.querySelector("#themes")).not.toBeNull();
  expect(look.querySelector("#text-size")).not.toBeNull();
  expect(card("Accessibilité")).toBeUndefined();
  expect([...document.querySelectorAll("#opts-kinds .optname")].map((s) => plain(s.textContent))).toEqual(["Monstres de la sous-zone ou du donjon", "Archimonstres", "Avis de recherche", "Monstres spéciaux", "Monstres d'événement"]);
  expect(plain(document.querySelector('.switch:has([data-key="expandAll"]) .optname')!.textContent)).toBe("Déplier tous les monstres");
  expect(plain(document.querySelector('.switch:has([data-key="thumbnails"]) .optname')!.textContent)).toBe("Image du monstre");
});

it("shows both languages, with their flags, right on the Langue row", () => {
  const langs = document.getElementById("lang")!;
  expect(langs.hidden).toBe(false);
  expect(langs.querySelectorAll(".lang .flag")).toHaveLength(2);
  expect(document.getElementById("lang-current")).toBeNull();
  expect(langs.closest(".theme-row")).not.toBeNull();
});

it("toggles an option by its name too; its « i » does not", () => {
  const input = document.querySelector<HTMLInputElement>('#view-settings input[data-key="thumbnails"]')!;
  const was = input.checked;
  input.closest(".switch")!.querySelector<HTMLElement>("label")!.click();
  expect(input.checked).toBe(!was);
  expect(JSON.parse(localStorage.getItem("dofight.settings")!).thumbnails).toBe(!was);
  input.closest(".switch")!.querySelector<HTMLElement>("label")!.click();
  expect(input.checked).toBe(was);
  const hide = document.querySelector<HTMLInputElement>('#view-settings input[data-key="hideWhenAway"]')!;
  const before = hide.checked;
  hide.closest(".switch")!.querySelector<HTMLElement>(".info")!.click();
  expect(hide.checked).toBe(before);
});

it("sets the text size (90 to 110 %) on the panel, remembered for the other windows", () => {
  const pick = (size: number) => document.querySelector<HTMLElement>(`#text-size [data-size="${size}"]`)!;
  expect(pick(100).getAttribute("aria-checked")).toBe("true");
  pick(110).click();
  expect(document.documentElement.style.getPropertyValue("--zoom")).toBe("1.1");
  expect(JSON.parse(localStorage.getItem("dofight.settings")!).textSize).toBe(110);
  expect(pick(110).getAttribute("aria-checked")).toBe("true");
  pick(100).click();
  expect(document.documentElement.style.getPropertyValue("--zoom")).toBe("1");
});

it("lists the three badges under one card", () => {
  const labels = [...document.querySelectorAll("#opts-badges .switch .optname")].map((s) => s.textContent);
  expect(labels).toEqual(["Danger", "Conseil", "Mécanique"]);
});

it("opens a monster row on click", async () => {
  (document.getElementById("back") as HTMLButtonElement).click();
  const q = document.getElementById("q") as HTMLInputElement;
  q.value = "Royalmouth";
  q.dispatchEvent(new Event("input"));
  (document.querySelector(".res-item") as HTMLElement).click();
  // the first folded monster (the boss is open by default)
  const id = document.querySelector<HTMLElement>('#room .mob[data-open="false"]')!.dataset.monster;
  const head = () => document.querySelector<HTMLElement>(`#room .mob[data-monster="${id}"] .mh`)!;
  const card = () => head().closest<HTMLElement>(".mob")!;
  expect(head().getAttribute("aria-expanded")).toBe("false");
  head().querySelector<HTMLElement>(".mname")!.click();
  expect(head().getAttribute("aria-expanded")).toBe("true");
  expect(card().querySelector(".resrow, .spells")).not.toBeNull();
});

it("shows badges for zone monsters (spell-derived) and a zone summary", async () => {
  const q = document.getElementById("q") as HTMLInputElement;
  q.value = "Solfataré";
  q.dispatchEvent(new Event("input"));
  const res = [...document.querySelectorAll<HTMLElement>(".res-item")];
  res[0].click();
  const card = document.querySelector<HTMLElement>('#room .mob[data-open="false"]')!;
  card.querySelector<HTMLElement>(".mh")!.click();
  expect(document.querySelector("#room .mob .tag")).not.toBeNull();
});

it("moves through the search results with the arrows and opens one with Enter", () => {
  const q = document.getElementById("q") as HTMLInputElement;
  q.value = "Bouftou";
  q.dispatchEvent(new Event("input"));
  const selected = () => document.querySelector("#results [aria-selected='true']")?.id;
  expect(selected()).toBe("res-0");
  q.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
  expect(selected()).toBe("res-1");
  expect(q.getAttribute("aria-activedescendant")).toBe("res-1");
  q.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
  q.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
  expect(selected()).toBe(`res-${document.querySelectorAll("#results .res-item").length - 1}`); // wraps around
  q.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(q.value).toBe("");
  expect(document.querySelector("#room .mob")).not.toBeNull();
});

it("switches the whole interface to English and back from the settings", () => {
  (document.getElementById("gear") as HTMLButtonElement).click();
  const pick = (l: string) => document.querySelector<HTMLElement>(`#lang .lang[data-lang="${l}"]`)!;
  expect(pick("fr").getAttribute("aria-checked")).toBe("true");
  pick("en").click();
  expect(pick("en").getAttribute("aria-checked")).toBe("true");
  expect(JSON.parse(localStorage.getItem("dofight.settings")!).lang).toBe("en");
  expect(document.documentElement.lang).toBe("en");
  expect(document.querySelector("#view-settings .back b")!.textContent).toBe("Settings");
  expect(document.getElementById("q")!.getAttribute("placeholder")).toBe("Monster, subarea or dungeon…");
  const badges = [...document.querySelectorAll("#opts-badges .switch .optname")].map((s) => s.textContent);
  expect(badges).toEqual(["Danger", "Tip", "Mechanic"]);
  // the switches keep their state when they are written again
  const spells = document.querySelector<HTMLInputElement>('#view-settings input[data-key="spells"]')!;
  expect(spells.checked).toBe(JSON.parse(localStorage.getItem("dofight.settings")!).spells);
  const last = emitted.filter((e) => e.event === "preview:render").at(-1)!;
  expect(last.payload.label).toBe("Example: Tertre du long sommeil");
  expect(document.getElementById("theme-current")!.textContent).toContain("Default");
  expect([...document.querySelectorAll("#report-kind option")].map((o) => o.textContent)).toContain("Dofight bug");
  pick("fr").click();
  expect(document.querySelector("#view-settings .back b")!.textContent).toBe("Paramètres");
  expect(plain(emitted.filter((e) => e.event === "preview:render").at(-1)!.payload.label)).toBe("Exemple : Tertre du long sommeil");
});

it("empties the list when Songe mode is turned on, and waits for a hovered group", () => {
  const q = document.getElementById("q") as HTMLInputElement;
  q.value = "Royalmouth";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector<HTMLElement>("#results .res-item")!.click();
  expect(document.querySelectorAll("#room .mob").length).toBeGreaterThan(0);
  const before = document.querySelector("#room .roomhead b")!.textContent;
  const songe = document.getElementById("songe") as HTMLButtonElement;
  songe.click();
  expect(document.querySelectorAll("#room .mob")).toHaveLength(0);
  expect(document.querySelector("#room .songe-wait")?.textContent).toContain("Survole un groupe");
  expect(document.getElementById("songe-reset")!.hidden).toBe(true);
  songe.click(); // off again: no zone was read meanwhile, so the room shown before comes back
  expect(document.querySelector("#room .songe-wait")).toBeNull();
  expect(document.querySelector("#room .roomhead b")!.textContent).toBe(before);
});

it("opens the suggestion from the bottom of the results, about the room shown; the subject can be searched", () => {
  if (!document.getElementById("view-settings")!.hidden) (document.getElementById("back") as HTMLButtonElement).click();
  const q = document.getElementById("q") as HTMLInputElement;
  q.value = "Korriandre";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector<HTMLElement>("#results .res-item")!.click();
  const shown = document.querySelector("#room .roomhead b, #room .roomhead h2")?.textContent ?? "";
  document.querySelector<HTMLElement>("#room .suggest")!.click();
  expect(document.getElementById("view-report")!.hidden).toBe(false);
  const subject = document.getElementById("report-subject") as HTMLInputElement;
  expect(subject.value).not.toBe("");
  expect(shown).toContain(subject.value);
  // the title never names the subject (its field does)
  expect(document.getElementById("report-title")!.textContent).toBe("Suggestion");
  expect(plain(document.querySelector('label[for="report-subject"]')!.textContent)).toBe("Sujet (facultatif)");
  expect(plain(document.getElementById("report-hint")!.textContent)).toContain("Envoyé anonymement");
  // a counter once the text nears its 1000 characters
  const text = document.getElementById("report-text") as HTMLTextAreaElement;
  text.value = "x".repeat(500);
  text.dispatchEvent(new Event("input", { bubbles: true }));
  expect(document.getElementById("report-count")!.textContent).toBe("");
  text.value = "x".repeat(850);
  text.dispatchEvent(new Event("input", { bubbles: true }));
  expect(plain(document.getElementById("report-count")!.textContent)).toContain("850 / 1000");
  text.value = "";
  text.dispatchEvent(new Event("input", { bubbles: true }));
  // another subject, from the search
  subject.value = "Tofu Royal";
  subject.dispatchEvent(new Event("input", { bubbles: true }));
  const pick = [...document.querySelectorAll<HTMLElement>("#report-subject-list button")].find((b) => b.textContent!.includes("Tofu Royal"))!;
  pick.click();
  expect(subject.value).toBe("Tofu Royal");
  expect(document.getElementById("report-subject-list")!.hidden).toBe(true);
  // no subject: a general suggestion
  subject.value = "";
  subject.dispatchEvent(new Event("input", { bubbles: true }));
  expect(document.getElementById("report-title")!.textContent).toBe("Suggestion");
  (document.getElementById("report-cancel") as HTMLButtonElement).click();
  expect(document.getElementById("view-main")!.hidden).toBe(false);
});

it("closes the suggestion page with Escape, like the settings, but never drops a typed text", () => {
  (document.getElementById("report-app") as HTMLButtonElement).click();
  expect(document.getElementById("view-report")!.hidden).toBe(false);
  const text = document.getElementById("report-text") as HTMLTextAreaElement;
  text.value = "Le boss retire aussi des PM";
  text.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(document.getElementById("view-report")!.hidden).toBe(false);
  text.value = "";
  text.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(document.getElementById("view-report")!.hidden).toBe(true);
  if (!document.getElementById("view-settings")!.hidden) (document.getElementById("back") as HTMLButtonElement).click();
});

it("says a failed sending in words; the raw error goes to the diagnostic log only", async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  (document.getElementById("report-app") as HTMLButtonElement).click();
  const text = document.getElementById("report-text") as HTMLTextAreaElement;
  text.value = "Un message assez long";
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd === "send_report") throw "http-500";
    return [];
  });
  (document.getElementById("report-send") as HTMLButtonElement).click();
  await vi.waitFor(() => expect(plain(document.getElementById("report-status")!.textContent)).toBe("Envoi impossible. Réessaie plus tard."));
  vi.mocked(invoke).mockImplementation(async () => []);
  (document.getElementById("report-cancel") as HTMLButtonElement).click();
  if (!document.getElementById("view-settings")!.hidden) (document.getElementById("back") as HTMLButtonElement).click();
});

it("copies the travel command and says where to paste it, for 2 s", async () => {
  if (!document.getElementById("view-settings")!.hidden) (document.getElementById("back") as HTMLButtonElement).click();
  const copied: string[] = [];
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: async (text: string) => void copied.push(text) } });
  const q = document.getElementById("q") as HTMLInputElement;
  q.value = "Antre du Korriandre";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector<HTMLElement>("#results .res-item")!.click();
  vi.useFakeTimers();
  document.querySelector<HTMLElement>("#room .travel")!.click();
  await vi.waitFor(() => expect(plain(document.querySelector("#room .tripmsg")!.textContent)).toBe("Copié : colle dans le chat (Ctrl+V)"));
  expect(copied[0].startsWith("/travel ")).toBe(true);
  vi.advanceTimersByTime(2000);
  expect(document.querySelector("#room .tripmsg")!.textContent).toBe("");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("announces « Aucun résultat » in the status line, not inside the list", () => {
  if (!document.getElementById("view-settings")!.hidden) (document.getElementById("back") as HTMLButtonElement).click();
  const q = document.getElementById("q") as HTMLInputElement;
  q.value = "zzzzqqq";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  expect(document.getElementById("results")!.innerHTML).toBe("");
  expect(plain(document.getElementById("status")!.textContent)).toBe("Aucun résultat pour « zzzzqqq »");
  q.value = "";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  expect(document.getElementById("status")!.textContent).toBe("");
});

it("quits at once on the × of the title bar, with no confirmation", async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  vi.mocked(invoke).mockClear();
  (document.getElementById("quit") as HTMLButtonElement).click();
  expect(invoke).toHaveBeenCalledWith("quit");
  expect(document.getElementById("quit-confirm")).toBeNull();
});

it("pins a mechanic's sheet on a click, with its guide link; a second click or Escape closes it", () => {
  if (!document.getElementById("view-settings")!.hidden) (document.getElementById("back") as HTMLButtonElement).click();
  const q = document.getElementById("q") as HTMLInputElement;
  q.value = "Torkélonia";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector<HTMLElement>("#results .res-item")!.click();
  const chip = document.querySelector<HTMLButtonElement>("#room .mech")!;
  expect(chip).not.toBeNull();
  vi.useFakeTimers();
  chip.click();
  vi.runAllTimers();
  vi.useRealTimers();
  expect(chip.getAttribute("aria-expanded")).toBe("true");
  const sheet = emitted.filter((e) => e.event === "peek:render").at(-1)!;
  expect(sheet.payload.html).toContain('class="guide"');
  chip.click();
  expect(chip.getAttribute("aria-expanded")).toBe("false");
  chip.click();
  expect(chip.getAttribute("aria-expanded")).toBe("true");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(chip.getAttribute("aria-expanded")).toBe("false");
});

it("opens the boss of a dungeon by default, like the settings' example; the others stay folded", () => {
  if (!document.getElementById("view-settings")!.hidden) (document.getElementById("back") as HTMLButtonElement).click();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const q = document.getElementById("q") as HTMLInputElement;
  q.value = "Antre du Korriandre";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector<HTMLElement>("#results .res-item")!.click();
  const open = [...document.querySelectorAll<HTMLElement>('#room .mob[data-open="true"]')];
  expect(open.map((m) => m.classList.contains("boss"))).toEqual([true]);
  expect(document.querySelectorAll('#room .mob[data-open="false"]').length).toBeGreaterThan(0);
});

it("« Lecture de l'écran » off: the options go off and grey, Rust stops capturing, Songe says why", async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  if (document.getElementById("view-settings")!.hidden) (document.getElementById("gear") as HTMLButtonElement).click();
  const reading = document.getElementById("opt-reading") as HTMLInputElement;
  const saved = () => JSON.parse(localStorage.getItem("dofight.settings")!);
  const options = ["fromHeader", "autoFight", "autoSonge", "hideWhenAway"].map((k) => document.getElementById(`opt-${k}`) as HTMLInputElement);
  expect(reading.checked).toBe(true);
  vi.mocked(invoke).mockClear();
  reading.checked = false;
  reading.dispatchEvent(new Event("change", { bubbles: true }));
  expect(invoke).toHaveBeenCalledWith("set_reading", { on: false });
  expect(saved()).toMatchObject({ reading: false, fromHeader: false, autoSonge: false, autoFight: false, songe: false });
  for (const input of options) {
    expect(input.checked).toBe(false);
    expect(input.disabled).toBe(true);
    expect(plain(input.closest(".switch")!.getAttribute("title"))).toBe("Active « Lecture de l'écran » pour changer cette option.");
  }
  expect((document.getElementById("reference") as HTMLSelectElement).disabled).toBe(true);
  expect(plain(document.getElementById("zone")!.textContent)).toBe("Lecture de l'écran coupée (Paramètres)");
  await handler("screen:tick")({ payload: { front: true, lines: [], error: "off", bar: null } });
  (document.getElementById("back") as HTMLButtonElement).click();
  // Songe: dimmed, and a click leaves it off with the reason and a way to the switch
  const songe = document.getElementById("songe") as HTMLButtonElement;
  expect(songe.classList.contains("off")).toBe(true);
  vi.mocked(invoke).mockClear();
  songe.click();
  expect(saved().songe).toBe(false);
  expect(songe.getAttribute("aria-pressed")).toBe("false");
  expect(invoke).not.toHaveBeenCalledWith("set_songe", expect.anything());
  expect(invoke).not.toHaveBeenCalledWith("set_reading", expect.anything());
  expect(document.getElementById("songe-off")!.hidden).toBe(false);
  (document.getElementById("songe-off-go") as HTMLButtonElement).click();
  expect(document.getElementById("view-settings")!.hidden).toBe(false);
  expect(document.activeElement).toBe(reading);
  // on again: exactly the options that were on come back, Songe stays off
  vi.mocked(invoke).mockClear();
  reading.checked = true;
  reading.dispatchEvent(new Event("change", { bubbles: true }));
  expect(invoke).toHaveBeenCalledWith("set_reading", { on: true });
  expect(saved()).toMatchObject({ reading: true, fromHeader: true, autoSonge: true, autoFight: true, hideWhenAway: false, songe: false, readingBefore: [] });
  for (const input of options) expect(input.disabled).toBe(false);
  expect(songe.classList.contains("off")).toBe(false);
  expect(plain(document.getElementById("zone")!.textContent)).toBe("");
  (document.getElementById("back") as HTMLButtonElement).click();
});

it("the four options off one by one: the switch stays on, the capture stops quietly, Songe still works", async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  if (document.getElementById("view-settings")!.hidden) (document.getElementById("gear") as HTMLButtonElement).click();
  const reading = document.getElementById("opt-reading") as HTMLInputElement;
  const flip = (key: string, on: boolean) => {
    const input = document.getElementById(`opt-${key}`) as HTMLInputElement;
    input.checked = on;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  vi.mocked(invoke).mockClear();
  for (const key of ["fromHeader", "autoSonge", "autoFight", "hideWhenAway"]) flip(key, false);
  expect(reading.checked).toBe(true);
  expect(invoke).toHaveBeenCalledWith("set_reading", { on: false }); // nothing uses the capture
  await handler("screen:tick")({ payload: { front: true, lines: [], error: "off", bar: null } });
  expect(plain(document.getElementById("zone")!.textContent)).toBe(""); // the switch is on: nothing is « coupée »
  (document.getElementById("back") as HTMLButtonElement).click();
  const songe = document.getElementById("songe") as HTMLButtonElement;
  expect(songe.classList.contains("off")).toBe(false);
  vi.mocked(invoke).mockClear();
  songe.click();
  expect(songe.getAttribute("aria-pressed")).toBe("true");
  expect(invoke).toHaveBeenCalledWith("set_songe", { on: true });
  expect(invoke).toHaveBeenCalledWith("set_reading", { on: true });
  songe.click();
  (document.getElementById("gear") as HTMLButtonElement).click();
  for (const key of ["fromHeader", "autoSonge", "autoFight"]) flip(key, true);
  (document.getElementById("back") as HTMLButtonElement).click();
});

it("« Lecture de l'écran » turned off with only Songe on: one click is enough", async () => {
  const saved = () => JSON.parse(localStorage.getItem("dofight.settings")!);
  if (document.getElementById("view-settings")!.hidden) (document.getElementById("gear") as HTMLButtonElement).click();
  const flip = (id: string, on: boolean) => {
    const input = document.getElementById(id) as HTMLInputElement;
    input.checked = on;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  for (const key of ["fromHeader", "autoSonge", "autoFight", "hideWhenAway"]) flip(`opt-${key}`, false);
  (document.getElementById("back") as HTMLButtonElement).click();
  (document.getElementById("songe") as HTMLButtonElement).click();
  expect(saved().songe).toBe(true);
  (document.getElementById("gear") as HTMLButtonElement).click();
  flip("opt-reading", false);
  expect(saved()).toMatchObject({ reading: false, songe: false });
  expect((document.getElementById("opt-reading") as HTMLInputElement).checked).toBe(false);
  flip("opt-reading", true);
  for (const key of ["fromHeader", "autoSonge", "autoFight"]) flip(`opt-${key}`, true);
  (document.getElementById("back") as HTMLButtonElement).click();
});

it("settings cards fold: folded at first, a click on a title unfolds it (remembered), the switch keeps its click", () => {
  if (document.getElementById("view-settings")!.hidden) (document.getElementById("gear") as HTMLButtonElement).click();
  const cards = ["reading", "display", "window", "look", "diagnostic"];
  // localStorage was empty at launch: every card started folded
  for (const card of cards) expect(document.querySelector(`.card[data-card="${card}"] .fold`)!.getAttribute("aria-expanded")).toBe(localStorage.getItem("dofight.cards")?.includes(`"${card}":true`) ? "true" : "false");
  const head = document.querySelector<HTMLElement>('.card[data-card="window"] h2')!;
  const body = document.getElementById("card-window")!;
  const was = body.hidden;
  head.click();
  expect(body.hidden).toBe(!was);
  expect(JSON.parse(localStorage.getItem("dofight.cards")!).window).toBe(was);
  (document.querySelector('.card[data-card="window"] .fold') as HTMLButtonElement).click();
  expect(body.hidden).toBe(was);
  // the reading switch in a title: it switches, it does not fold
  const reading = document.getElementById("card-reading")!;
  const folded = reading.hidden;
  (document.getElementById("opt-reading") as HTMLInputElement).click();
  expect(reading.hidden).toBe(folded);
  (document.getElementById("opt-reading") as HTMLInputElement).click();
  expect((document.getElementById("opt-reading") as HTMLInputElement).checked).toBe(true);
  // the last card (suggestion, Discord, support) has no title and never folds
  expect(document.getElementById("report-app")!.closest(".cardbody")).toBeNull();
  (document.getElementById("back") as HTMLButtonElement).click();
});

it("× does nothing while an update downloads or installs", async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  document.getElementById("update")!.hidden = false;
  document.getElementById("update-bar")!.hidden = false;
  vi.mocked(invoke).mockClear();
  (document.getElementById("quit") as HTMLButtonElement).click();
  expect(invoke).not.toHaveBeenCalledWith("quit");
  document.getElementById("update")!.hidden = true;
});
