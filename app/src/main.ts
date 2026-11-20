import { emit, listen } from "@tauri-apps/api/event";
import { Channel, invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { buildReport, cooldownLeft, KINDS, type Reading, type ReportKind } from "./report";
import { applyI18n, hasKey, setLang, t, type Key, type Lang } from "./i18n";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { autoUpdate, portableCheck, type DownloadEvent } from "./update";
import { diag, diagOnChange, loggableSettings } from "./diag";
import { applyTextSize, applyTheme, THEMES, themeById, themeName } from "./theme";
import { fromKeyEvent, shortcutLabel } from "./shortcut";
import { initialState, step, type Action, type DirectorState } from "./screen/director";
import { readFight, type BarState } from "./screen/fight";
import { parseHeader } from "./screen/header";
import { locate } from "./screen/locate";
import { nameIndex, readGroups } from "./screen/songe";
import { inDream } from "./screen/dream";
import { initialStatus, statusText, statusWarns, steadyStatus, type StatusKind } from "./screen/status";
import type { OcrLine } from "./screen/ocr";
import { currentMonitor, getCurrentWindow, LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize, Window } from "@tauri-apps/api/window";
import { GAP, previewRect } from "./previewSide";
import { openUrl } from "@tauri-apps/plugin-opener";
import { saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";
import logo from "./assets/icon-app.png";
import { enableDragAnywhere } from "./drag";
import { fetchFromApp, loadSnapshot } from "./load";
import { renderTrip, showCopied, tripTo, type Trip } from "./travel";
import { accessOf, isSpecial, type PlaceAccess } from "./access";
import { renderAccessSheet } from "./render/accessSheet";
import { englishReading, englishView, frenchRoom, loadEnglish, zoneName, type English } from "./english";
import { esc } from "./render/html";
import { applyIcons, icon } from "./render/icons";
import { highlight, matches, monsterText, spellsMatching } from "./findInList";
import { renderPeek } from "./render/monster";
import { renderRoom } from "./render/panel";
import { renderSpellSheet } from "./render/spellSheet";
import { renderMechanicSheet } from "./render/mechanic";
import { iconResolver, restoreRoom, roomFor, saveRoom, type Room } from "./room";
import { SEARCH_EVERY_MS, searchState, type SearchState } from "./screen/fightSearch";
import { scanOutcome } from "./screen/scan";
import { search, type Result } from "./search";
import { DEFAULTS, loadSettings, TEXT_SIZES, updateSettings, type Settings } from "./settings";
import { capturing as capturingGame, READING, readingPatch } from "./reading";
import { exportSettings, importSettings } from "./settingsTransfer";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Monster, RoomSummary, Snapshot } from "./types";

type Flag = { [K in keyof Settings]-?: Settings[K] extends boolean ? K : never }[keyof Settings];

// each switch's label is the text `opt.<flag>` of i18n.ts
// what makes Dofight read the screen, together (its card says what is read and where)
// (all of them go off with the card's own switch, see reading.ts; owner, 2026-11-18)
const COMBAT: Flag[] = READING;
// display options in a logical order: which monsters are listed and how the list behaves, then a monster card from
// top to bottom (its badges have their own group)
const DISPLAY: Flag[] = ["roomSummary", "expandAll", "hoverPeek"];
const KINDS_SHOWN: Flag[] = ["showArch", "showWanted", "showSpecial", "showEvent"];
const CARD: Flag[] = ["thumbnails", "details", "resistances"];
const CARD_AFTER_BADGES: Flag[] = ["spells", "spellBadges"];
const BADGES: Flag[] = ["tagsDanger", "tagsTip", "tagsMechanic"];
const BADGE_COLOUR: Partial<Record<Flag, string>> = { tagsDanger: "danger", tagsTip: "tip", tagsMechanic: "mechanic" };
const PREVIEW_DUNGEON = "Tertre du long sommeil"; // the preview always shows this one dungeon as its example
const TOUR_DUNGEON = 114; // the guide's tour: Sanctuaire de Torkélonia, a boss with badges and a mechanic chip
const PLACED = "dofight.placed";
const FOLDS = "dofight.cards"; // which settings cards are unfolded, by their data-card
const GUIDE = "dofight.guide"; // the getting-started guide was closed once
/** The very first use of Dofight (read before placeOnce writes PLACED): the guide opens by itself. */
// (« 0 »: it opened by itself and was not finished, a fight or a quit cut it: it opens again; « 1 »: closed by the player)
const firstUse = (!localStorage.getItem(PLACED) && localStorage.getItem(GUIDE) === null) || localStorage.getItem(GUIDE) === "0";
/** The settings were opened from the guide: their back arrow returns to it (and the keyboard to this link). */
let guideReturn = false;
let guideReturnFocus = "";
/** The game data could not load: the guide keeps its setup steps only. */
let dataFailed = false;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const win = getCurrentWindow();
let settings: Settings = loadSettings(localStorage);
setLang(settings.lang);
applyI18n(document);
applyIcons(document);
document.body.classList.remove("i18n-pending");
$("status").textContent = t("main.loading");
let snap: Snapshot | null = null;
// what the panel shows: the French snapshot, or its English view in the English interface (the game itself is read
// with the French one: zone and monster names on screen come from a French client)
let view: Snapshot | null = null;
// the same view with the zones' English names, for searching in English
let searchView: Snapshot | null = null;
let english: English | null = null;

/** Builds the shown data for the interface language (the English data is fetched the first time it is needed). */
// the game read on an English client: the same rooms, found by their English names (loaded in the background,
// whatever the interface language: the game's language is the player's choice, not Dofight's)
let readEnglish: Snapshot | null = null;

let englishLoading: Promise<English | null> | null = null;

async function ensureEnglish(): Promise<void> {
  if (english || !snap) return;
  // one load at a time (the start, a language change and a reading may all ask at once)
  englishLoading ??= loadEnglish(fetchFromApp, snap).catch((err) => {
    diag("data", `English data not loaded: ${String(err)}`);
    return null;
  });
  english = await englishLoading;
  englishLoading = null;
  if (english) {
    readEnglish = englishReading(snap, english);
    songeIndex = null; // built again with the English names too
  }
}

async function refreshView(): Promise<void> {
  if (!snap) return;
  if (settings.lang === "en") await ensureEnglish();
  view = settings.lang === "en" && english ? englishView(snap, english) : snap;
  searchView = view === snap || !english ? view : {
    ...view,
    monsters: new Map([...view.monsters].map(([id, m]) => [id, { ...m, subareas: m.subareas.map((z) => zoneName(english, z)) }])),
    // each zone's area, by the zone's English name
    ...(readEnglish?.areas ? { areas: readEnglish.areas } : {}),
  };
}

/** A room as the panel shows it: its dungeon, monsters and title in the interface language. */
function shown(r: Room): Room {
  if (!view || view === snap) return r;
  const dungeon = r.dungeon ? view.dungeons.get(r.dungeon.id) ?? r.dungeon : null;
  const title = r.dungeon ? dungeon!.name : zoneName(english, r.title);
  return { ...r, dungeon, title, monsters: r.monsters.map((m) => view!.monsters.get(m.id) ?? m) };
}
let room: Room | null = null;
let results: Result[] = [];
// rows whose open/closed state differs from the "Détails" button (cleared when the button is used)
const flipped = new Set<number>();
// a monster is open by default when « Déplier tous les monstres » is on, and a boss always is (like the settings'
// example); a click flips that, one row at a time
// (while « Chercher dans la liste » filters it, the monsters that match are open: the match shows)
const isOpen = (id: number) => (settings.expandAll || !!finding.trim() || !!snap?.monsters.get(id)?.boss) !== flipped.has(id);
/** « Filtrer les résultats »: the text typed in the bar above the list (findInList.ts), "" for none. */
let finding = "";
// the row the player just folded or unfolded: its chevron turns on the next render (the rows are drawn again)
let turned: number | null = null;

// the hover preview (see « hover preview » below), declared early: showRoom hides it
const PEEK_DELAY = 250; // ms on a row before its preview shows (moving along the list shows nothing)
let peekTimer: number | undefined;
let peekRow: HTMLElement | null = null;
let peekToken = 0;
let peekShown = false;

const saveGeometry = () => void saveWindowState(StateFlags.ALL & ~StateFlags.VISIBLE);

/** First launch only: right side of the screen, almost full height. Afterwards the saved geometry is kept. */
async function placeOnce(): Promise<void> {
  if (localStorage.getItem(PLACED)) return;
  const monitor = await currentMonitor();
  if (!monitor) return;
  const scale = monitor.scaleFactor;
  const screenW = monitor.size.width / scale;
  const screenH = monitor.size.height / scale;
  await win.setSize(new LogicalSize(320, Math.max(300, screenH - 80)));
  await win.setPosition(new LogicalPosition(monitor.position.x / scale + screenW - 328, monitor.position.y / scale + 40));
  localStorage.setItem(PLACED, "1");
  saveGeometry();
}

/** The panel is open (shown and not reduced to its taskbar button). */
async function panelOpen(): Promise<boolean> {
  return (await win.isVisible()) && !(await win.isMinimized());
}

/** Closing the overlay leaves its taskbar button (« Dofight »); it never takes or gives the focus. */
async function foldAway(): Promise<void> {
  await invoke("panel_show", { mode: "min" });
}

async function showOverlay(): Promise<void> {
  await placeOnce();
  await invoke("panel_show", { mode: "open" }); // never takes the focus from the game
}

/** Folds the panel away (settings and preview closed). Hidden by the player in a fight: it stays hidden until the
 * next fight, and a fight's end never reopens it. */
async function hidePanel(byPlayer: boolean): Promise<void> {
  openSettings(false); // hides the preview too
  hidePeek();
  await foldAway();
  if (byPlayer) director = { ...director, hiddenByPlayer: director.inFight, openedByPlayer: false };
}

/** The player opened the panel: a fight's end never closes it. */
async function openByPlayer(): Promise<void> {
  director = { ...director, openedByPlayer: true, hiddenByPlayer: false };
  await showOverlay();
}

function applyLook(): void {
  // opacity applies to the overlay's background only, never to its text and icons
  document.documentElement.style.setProperty("--alpha", String(settings.opacity));
  applyTheme(document.documentElement, settings.theme);
  applyTextSize(document.documentElement, settings.textSize);
}

/** The written summary of a room: its dungeon's, or a zone's (guild expeditions). */
// (keyed by dungeon id or by the French zone name: call it with the room itself, not its shown copy)
const summaryOf = (r: Room) => (r.dungeon ? (view ?? snap)!.summaries.get(r.dungeon.id) : (view ?? snap)!.zoneSummaries?.get(r.title));

/** The place whose « Comment y aller » button is in the header (set by roomHtml), for its sheet. */
let accessShown: { title: string; pa: PlaceAccess | null; trip: Trip | null } | null = null;

function roomHtml(r: Room): string {
  if (!snap || !view) return "";
  // the hidden kinds (special, archmonster, wanted poster, event) are hidden only in the zone read on screen: a search result
  // or a hovered group (Songe) shows every monster it holds
  const show = r !== zoneRoom ? { ...settings, showSpecial: true, showArch: true, showWanted: true, showEvent: true } : settings;
  const all = shown(r);
  // « Chercher dans la liste »: only the monsters that match (from what their cards say, in the language shown)
  const q = finding.trim();
  const summary = summaryOf(r);
  const v = !q ? all : { ...all, monsters: all.monsters.filter((m) => matches(monsterText(m, summary?.monsters[String(m.id)] ?? view!.monsterSummaries?.get(m.id), view!.spells, view!.vocabulary), q)) };
  // how to get there: for a searched dungeon, zone or monster (not where the player stands, nor a hovered group)
  // and « Comment y aller » when there is something to know first (the sheet beside the panel, main.ts showAccess)
  accessShown = null;
  let trip = "";
  if (r !== zoneRoom && !r.counts) {
    const to = tripTo(snap.travel, r.dungeon?.id ?? null, r.title);
    const pa = accessOf(snap.access, snap.areas, r.dungeon?.id ?? null, r.title);
    const special = isSpecial(pa, to?.to ?? null);
    if (special) accessShown = { title: v.title, pa, trip: to };
    trip = renderTrip(to, { special });
  }
  return renderRoom(v.dungeon, v.monsters, summaryOf(r), view, show, iconResolver(view), v.title, isOpen, v.pinned, v.counts, trip);
}

/* ---------- « Songe » mode: the monster groups hovered on the map ---------- */

let songeRoom: Room | null = null;
/** Songe was just turned off: the next zone read on screen fills the list, even in a fight. */
let zoneAsked = false;
/** Where « Réinitialiser » waits while it is not shown (it moves into the hovered group's header card). */
const resetHome = document.getElementById("backzone")!;
let songeIndex: ReturnType<typeof nameIndex> | null = null;
/** The room shown when Songe was turned on: it comes back when Songe goes off, unless a zone was read meanwhile. */
let beforeSonge: Room | null = null;
let zoneReadInSonge = false;
let songeSignature = "";

function showSongeState(): void {
  $("songe").setAttribute("aria-pressed", String(settings.songe));
  // « Lecture de l'écran » off: the button stays clickable (to say why), dimmed, its tooltip saying why
  const off = !settings.reading;
  $("songe").classList.toggle("off", off);
  $("songe").title = t(off ? "songe.needsReading" : "songe.hint");
  if (!off) $("songe-off").hidden = true;
}

/** Shows the groups read on this frame; the last group stays until another one is hovered. */
function songeTick(lines: OcrLine[]): void {
  if (!snap || !settings.songe || !lines.length) return;
  // a French or an English client: the monster names of both (the English ones point to the same monsters)
  songeIndex ??= nameIndex(readEnglish ? [...snap.monsters.values(), ...readEnglish.monsters.values()] : snap.monsters.values());
  const groups = readGroups(lines, songeIndex);
  if (!groups.length) return;
  const counts = new Map<number, number>();
  const monsters = [] as Room["monsters"];
  for (const g of groups) for (const { monster, count } of g.monsters) {
    if (!counts.has(monster.id)) monsters.push(snap.monsters.get(monster.id) ?? monster); // the French entry, shown in the interface language
    counts.set(monster.id, (counts.get(monster.id) ?? 0) + count);
  }
  const signature = monsters.map((m) => `${m.id}x${counts.get(m.id)}`).join(",");
  if (signature === songeSignature && room === songeRoom) return;
  songeSignature = signature;
  const title = groups.length > 1 ? t("songe.titleMany") : groups[0].level !== null ? t("songe.title", { level: groups[0].level }) : t("songe.titleNoLevel");
  songeRoom = { dungeon: null, title, monsters, counts };
  diag("songe", `${groups.map((g) => `level ${g.level ?? "?"}`).join(" + ")}: ${monsters.map((m) => `${m.name}×${counts.get(m.id)}`).join(", ")}`);
  room = songeRoom;
  flipped.clear();
  showRoom();
}

let wasDreaming = false;
/** The Songe header went away: the next map with coordinates means the player has left the Songe. */
let leftDream = false;
/** Readings in a row that found no zone (see read_again). */
let missedReads = 0;
let missedTitle = "";

/** Songe mode turned on or off by the player (its button), or by Dofight on entering or leaving a Songe. */
function setSonge(on: boolean, by: "player" | "dofight"): void {
  if (on === settings.songe) return;
  update({ songe: on });
  void invoke("set_songe", { on: settings.songe });
  diag("songe", `${settings.songe ? "on" : "off"}${by === "dofight" ? " (entered or left a Songe)" : ""}`);
  if (settings.songe) {
    // Songe on: the list empties and waits for a hovered group; Dofus comes back in front when the player clicked
    // « Songe » (the game shows a group's tooltip on hover only when it has the focus, and the click took it)
    if (by === "player") void invoke("focus_dofus");
    beforeSonge = room;
    zoneReadInSonge = false;
    room = null;
    flipped.clear();
  } else if (room === songeRoom || room === null) {
    // Songe off: the zone read last shows at once (the header can be hidden in a fight), and the screen is read again
    // at once (set_songe asks the reader): a changed zone replaces it
    room = !zoneReadInSonge && beforeSonge ? beforeSonge : zoneRoom;
    zoneAsked = settings.fromHeader;
    flipped.clear();
  }
  if (!settings.songe) beforeSonge = null;
  songeRoom = null;
  songeSignature = "";
  showSongeState();
  showRoom();
}
let songeOffTimer: number | undefined;
$("songe").addEventListener("click", () => {
  // never turns the reading on (owner, 2026-11-18): it says why, and where
  if (!settings.reading) {
    $("songe-off").hidden = false;
    clearTimeout(songeOffTimer);
    const hideLater = () => {
      // not while the pointer or the keyboard is on it (its button is the way to the setting)
      songeOffTimer = window.setTimeout(() => ($("songe-off").matches(":hover, :focus-within") ? hideLater() : ($("songe-off").hidden = true)), 10_000);
    };
    hideLater();
    return;
  }
  setSonge(!settings.songe, "player");
});
$("songe-off-go").addEventListener("click", () => {
  $("songe-off").hidden = true;
  openSettings(true);
  $("opt-reading").focus({ preventScroll: true });
  $("opt-reading").scrollIntoView?.({ block: "center" }); // (not in the tests' jsdom)
  // a halo for a moment: a mouse click leaves no focus ring to show where the switch is
  $("opt-reading").classList.add("flash");
  window.setTimeout(() => $("opt-reading").classList.remove("flash"), 1800);
});

// the zone the player is in (read on screen); after a search, a button brings its monsters back
let zoneRoom: Room | null = null;
/** Kept across a reload of the page (Ctrl+R), so a reload mid-fight does not empty the list. */
const ZONE_KEY = "dofight.zone";
function keepZone(r: Room): void {
  try {
    sessionStorage.setItem(ZONE_KEY, saveRoom(r));
  } catch {
    // no storage: a reload mid-fight searches the zone again
  }
}
function keptZone(): string | null {
  try {
    return sessionStorage.getItem(ZONE_KEY);
  } catch {
    return null;
  }
}

/** Opened or reloaded mid-fight with no zone known: the corner is read every SEARCH_EVERY_MS until it is found. */
let zoneSearch: SearchState = "idle";
let searchSince = 0;
/** A map header was read during this search: when missed, the fight is to blame, not the coordinates option. */
let searchSawHeader = false;
function updateSearch(): void {
  const following = settings.reading && settings.fromHeader && !settings.songe;
  const known = zoneRoom !== null;
  if (zoneSearch === "idle") {
    searchSince = Date.now();
    searchSawHeader = false;
  }
  const next = searchState({ inFight: director.inFight, zoneKnown: known, following, since: searchSince, now: Date.now() });
  if (next !== zoneSearch) {
    if (zoneSearch === "idle") diag("zone", "fight with no zone known: reading the corner until it is found");
    else if (next === "missed") diag("zone", "zone still not found in this fight: the list points to the search");
    else if (next === "idle") diag("zone", known ? "zone found during the fight" : "zone search stopped");
    zoneSearch = next;
    if (next === "idle" && status.shown?.kind === "searching") zoneStatus("found", "");
    if (!room && snap) showRoom();
  }
  if (zoneSearch !== "idle") void invoke("read_again");
}
window.setInterval(updateSearch, SEARCH_EVERY_MS);

/** The last reading found no Dofus window: the empty list says so. */
let dofusClosed = false;

/** What the list says when it has nothing to show: waiting for a hovered group (Songe), or what Dofight will show
 * here and that the search works too. */
function emptyHtml(): string {
  if (settings.songe) return `<p class="empty songe-wait">${esc(t("songe.waiting"))}</p>`;
  // the zone not followed (the option off, the reading on): the search is the way, said in one sentence
  if (!dofusClosed && settings.reading && !settings.fromHeader) return `<p class="empty intro">${esc(t("main.emptyNoFollow"))}</p>`;
  // opened mid-fight with no zone known: Dofight is looking for it, or could not find it (fightSearch.ts)
  if (!dofusClosed && zoneSearch === "missed") return `<p class="empty intro">${esc(t("main.emptyFightMissed"))}</p>`;
  if (!dofusClosed && zoneSearch === "searching") return `<p class="empty intro">${esc(t("main.emptyFight"))} ${esc(t("main.emptySearch"))}</p>`;
  if (!dofusClosed && !settings.reading) return `<p class="empty intro">${esc(t("main.emptyOff"))}</p>`;
  const first = dofusClosed ? t("status.noDofus") : t("main.empty");
  return `<p class="empty intro">${esc(first)} ${esc(t("main.emptySearch"))}</p>`;
}

function showRoom(): void {
  showScan();
  hidePeek(); // the rows are drawn again
  // « Réinitialiser » sits in the hovered group's header card: take it out before the list is drawn again
  const reset = $("songe-reset");
  resetHome.after(reset);
  $("room").innerHTML = room ? roomHtml(room) : emptyHtml();
  showFind();
  if (turned !== null) {
    document.querySelector(`#room .mob[data-monster="${turned}"] .chev`)?.classList.add("turn");
    turned = null;
  }
  // in Songe mode the list follows the hovered groups: no way back to the zone from there (turning Songe off does it)
  const away = !settings.songe && !!zoneRoom && room?.title !== zoneRoom.title;
  $("backzone").hidden = !away;
  if (away) $("backzone-name").textContent = zoneRoom!.title;
  // in Songe mode, « Réinitialiser » clears the hovered group in its place
  reset.hidden = !(settings.songe && room !== null && room === songeRoom);
  if (!reset.hidden) document.querySelector("#room .roomhead .dj")?.append(reset);
}

/* ---------- « Filtrer les résultats »: the list keeps the monsters whose card holds the text ---------- */

/** The bar, its count, the matches highlighted and the spells that hold the text marked (after each drawing). */
function showFind(): void {
  // always there above a list of monsters (none to filter on an empty list)
  $("find").hidden = !room;
  const q = finding.trim();
  $("find-close").hidden = !finding;
  if ($("find").hidden || !q || !view) {
    $("find-count").textContent = "";
    return;
  }
  const rows = [...document.querySelectorAll<HTMLElement>("#room .mob")];
  $("find-count").textContent = t("find.count", { n: rows.length });
  if (!rows.length) document.querySelector("#room .room")?.insertAdjacentHTML("beforeend", `<p class="empty">${esc(t("find.none"))}</p>`);
  for (const row of rows) {
    highlight(row, q);
    const m = view.monsters.get(Number(row.dataset.monster));
    if (m) for (const id of spellsMatching(m, view.spells, q)) row.querySelector(`.sp[data-spell="${id}"]`)?.classList.add("hit");
  }
}
function openFind(): void {
  if (!room) return;
  const input = $<HTMLInputElement>("find-q");
  input.focus();
  input.select();
}
function clearFind(): void {
  if (!finding) return;
  finding = "";
  $<HTMLInputElement>("find-q").value = "";
  flipped.clear();
  showRoom();
}
$("find-close").addEventListener("click", () => {
  clearFind();
  $("find-q").focus();
});
$("find-q").addEventListener("input", (e) => {
  finding = (e.target as HTMLInputElement).value;
  flipped.clear();
  showRoom();
});
$("find-q").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.stopPropagation();
    if (finding) clearFind();
    else (e.target as HTMLInputElement).blur();
  }
});
// Ctrl+F on the monster list (the panel has the focus once clicked): into the bar, not the webview's own find
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && !$("view-main").hidden) {
    e.preventDefault();
    openFind();
  }
});

// the highlighted result (arrows move it, Enter opens it); the first one by default
let active = 0;

const resultKind = (r: Result) => t(r.kind === "dungeon" ? "main.kindDungeon" : r.kind === "subarea" ? "main.kindZone" : "main.kindMonster");

/** A result's info (level, dungeon, area…); none at all when there is nothing to say: the label takes the row. */
const resultInfo = (r: Result) => (r.info ? `<small>${esc(r.info)}</small>` : "");

function showResults(): void {
  const q = $<HTMLInputElement>("q").value;
  results = searchView ? search(searchView, q) : [];
  active = 0;
  $("results").innerHTML = results
    .map((r, i) => `<button class="res-item" id="res-${i}" role="option" aria-selected="false" tabindex="-1" data-i="${i}"><span><span class="kind">${resultKind(r)}</span>${esc(r.label)}</span>${resultInfo(r)}</button>`)
    .join("");
  // « Aucun résultat » goes to the status line, which screen readers announce (a listbox holds only options); the
  // line keeps its loading or missing-data message until the data is there
  if (searchView) $("status").textContent = !results.length && q.trim() ? t("main.noResult", { query: q }) : "";
  markActive();
}

/** Highlights the active result for the eye and for screen readers (the focus stays in the search field). */
function markActive(): void {
  const input = $<HTMLInputElement>("q");
  input.setAttribute("aria-expanded", String(results.length > 0));
  document.querySelectorAll<HTMLElement>("#results .res-item").forEach((b, i) => b.setAttribute("aria-selected", String(i === active)));
  if (results.length) {
    input.setAttribute("aria-activedescendant", `res-${active}`);
    document.getElementById(`res-${active}`)?.scrollIntoView?.({ block: "nearest" });
  } else input.removeAttribute("aria-activedescendant");
}

/* ---------- settings view (inside the overlay, like Ganymède) ---------- */

function switches(container: string, flags: Flag[]): void {
  $(container).innerHTML = flags
    // the name is the switch's <label>: clicking it toggles the switch (the « i » beside it does not)
    .map((key) => {
      const label = t(`opt.${key}` as Key);
      // some options need something set in the game: an « i » explains why (on hover or keyboard focus)
      const infoKey = `opt.${key}.info`;
      const info = hasKey(infoKey) ? t(infoKey) : null;
      const tip = info
        ? `<button type="button" class="info" aria-label="${esc(t("opt.info"))}" aria-describedby="tip-${key}">${icon("info")}</button><span class="bubble" role="tooltip" id="tip-${key}">${esc(info)}</span>`
        : "";
      const described = info ? ` aria-describedby="tip-${key}"` : "";
      // a badge kind is shown in its own colour, as a reminder of what it looks like in the list
      const kind = BADGE_COLOUR[key];
      const name = kind ? `<span class="tag ${kind}">${esc(label)}</span>` : esc(label);
      return `<div class="switch"><span class="optname"><label for="opt-${key}">${name}</label>${tip}</span><input id="opt-${key}" type="checkbox" role="switch"${described} data-key="${key}"></div>`;
    })
    .join("");
}

// Escape closes an option's explanation (until the pointer or the focus leaves its « i »)
document.addEventListener("keydown", (e) => {
  const row = (document.activeElement as HTMLElement | null)?.closest(".switch") ?? document.querySelector(".switch:has(.info:hover)");
  if (e.key === "Escape" && row?.querySelector(".bubble")) row.classList.add("tip-closed");
});
document.addEventListener("pointerover", (e) => {
  if (!(e.target as HTMLElement).closest?.(".info")) document.querySelectorAll(".switch.tip-closed").forEach((r) => r.classList.remove("tip-closed"));
});
document.addEventListener("focusin", () => document.querySelectorAll(".switch.tip-closed").forEach((r) => r.classList.remove("tip-closed")));

/* ---------- the settings as text: copy them, paste them (another PC, sharing) ---------- */

$("settings-export").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(exportSettings(settings));
    $("backup-status").textContent = t("settings.exported");
  } catch (err) {
    diag("settings", `export failed: ${String(err)}`);
    $("backup-status").textContent = t("settings.backupFailed");
  }
});
$("settings-import").addEventListener("click", async () => {
  let text: string;
  try {
    text = (await readText()) ?? "";
  } catch (err) {
    diag("settings", `import: clipboard not read: ${String(err)}`);
    $("backup-status").textContent = t("settings.importNone"); // an empty clipboard is reported as an error
    return;
  }
  const out = importSettings(text, settings);
  if (!out.ok) {
    $("backup-status").textContent = t("settings.importNone");
    return;
  }
  const next = out.settings;
  const { lang, shortcut, ...rest } = next;
  // the shortcut is registered first: a taken one keeps the current shortcut
  const shortcutOk = shortcut === settings.shortcut || (await applyShortcut(shortcut));
  if (!shortcutOk) await applyShortcut(settings.shortcut); // keep the current one
  update({ ...rest, ...(shortcutOk ? { shortcut } : {}) });
  if (lang !== settings.lang) changeLang(lang);
  buildControls();
  syncSettingsView();
  diag("settings", "imported from the clipboard");
  $("backup-status").textContent = shortcutOk ? t("settings.imported") : t("settings.importedShortcutTaken", { keys: shortcutLabel(shortcut) });
});

/* ---------- diagnostic: copy the recent log, open its folder ---------- */

$("log-copy").addEventListener("click", async () => {
  try {
    const text = await invoke<string>("diagnostic_text");
    if (!text) {
      $("log-status").textContent = t("settings.logEmpty");
      return;
    }
    await navigator.clipboard.writeText(text);
    $("log-status").textContent = t("settings.logCopied");
  } catch (err) {
    diag("log", `copy failed: ${String(err)}`); // the player reads words, the log keeps the error
    $("log-status").textContent = t("settings.logFailed");
  }
});
$("log-open").addEventListener("click", () => {
  invoke("open_log_folder").catch((err) => {
    diag("log", `folder not opened: ${String(err)}`);
    $("log-status").textContent = t("settings.logOpenFailed");
  });
});

function syncSettingsView(): void {
  document.querySelectorAll<HTMLInputElement>("#view-settings input[data-key]").forEach((input) => {
    input.checked = settings[input.dataset.key as Flag];
  });
  $<HTMLInputElement>("opt-reading").checked = settings.reading;
  // the switch off: the options under it are off, greyed, and say how to change them; the window to read stays
  // usable (« Scanner ma sous-zone » reads that window, and brings it in front)
  for (const id of READING.map((f) => `opt-${f}`)) {
    const input = $<HTMLInputElement>(id);
    input.disabled = !settings.reading;
    const row = input.closest(".switch") ?? input;
    row.classList.toggle("idle", !settings.reading);
    if (settings.reading) row.removeAttribute("title");
    else row.setAttribute("title", t("opt.needsReading"));
  }
  $<HTMLInputElement>("opacity").value = String(settings.opacity);
  $("opacity-value").textContent = t("settings.opacityValue", { value: Math.round(settings.opacity * 100) });
  document.querySelectorAll<HTMLElement>("#lang .lang").forEach((btn) => {
    const chosen = btn.dataset.lang === settings.lang;
    btn.setAttribute("aria-checked", String(chosen));
    btn.tabIndex = chosen ? 0 : -1;
  });
  document.querySelectorAll<HTMLElement>("#text-size .lang").forEach((btn) => {
    const chosen = Number(btn.dataset.size) === settings.textSize;
    btn.setAttribute("aria-checked", String(chosen));
    btn.tabIndex = chosen ? 0 : -1;
  });
  if (!capturing) $("shortcut").textContent = shortcutLabel(settings.shortcut);
  // a radio group: only the chosen theme is in the Tab order, the arrows move between themes
  document.querySelectorAll<HTMLElement>("#themes .theme").forEach((b) => {
    const chosen = b.dataset.theme === settings.theme;
    b.setAttribute("aria-checked", String(chosen));
    b.tabIndex = chosen ? 0 : -1;
  });
  const current = themeById(settings.theme);
  const button = $("theme-current");
  button.style.setProperty("--tb", current.base);
  button.style.setProperty("--ta", current.accent);
  button.querySelector("span")!.textContent = themeName(current);
  $("eye").setAttribute("aria-pressed", String(settings.preview));
  renderPreview();
}

/** One example dungeon (Royalmouth, all rows open), sent to the preview window. */
function renderPreview(): void {
  if (!snap || $("view-settings").hidden || !settings.preview) return;
  const d = [...snap.dungeons.values()].find((x) => x.name === PREVIEW_DUNGEON) ?? null;
  const monsters = d ? d.monsterIds.map((id) => snap!.monsters.get(id)).filter((m): m is Monster => !!m) : [];
  const r: Room | null = d ? { dungeon: d, title: d.name, monsters } : null;
  const v = r ? shown(r) : null;
  const label = t("settings.example", { name: v?.title ?? PREVIEW_DUNGEON });
  const html = r && v && view
    ? renderRoom(v.dungeon, v.monsters, summaryOf(r), view, { ...settings, suggest: false }, iconResolver(view), v.title, (id) => settings.expandAll || id === r!.monsters.find((m) => m.boss)?.id)
    : `<p class="empty">${t("settings.noMonster")}</p>`;
  void emit("preview:render", { label, html });
}

/** Shows the preview window beside the overlay (side with more room) while the settings are open, if wanted. */
let dofusAway = false; // Dofus not in front: the preview hides with the overlay

/** `render`: draw the example again too (not needed when the panel only moved or was resized). */
async function placePreview(render = true): Promise<void> {
  const preview = await Window.getByLabel("preview");
  if (!preview) return;
  const touring = !$("view-guide").hidden;
  if ((!touring && ($("view-settings").hidden || !settings.preview)) || dofusAway || !(await panelOpen())) {
    await preview.hide();
    return;
  }
  const monitor = await currentMonitor();
  if (!monitor) return;
  // the panel's inside (what is drawn): setSize sets a window's inside, and the panel's outside also counts the
  // invisible resize border Windows gives it, which made the example wider than the panel
  const pos = await win.innerPosition();
  const size = await win.innerSize();
  const r = previewRect(
    { x: pos.x, y: pos.y, width: size.width, height: size.height },
    { x: monitor.position.x, y: monitor.position.y, width: monitor.size.width, height: monitor.size.height },
    Math.round(GAP * monitor.scaleFactor),
  );
  if (touring) {
    // the guide's window never covers the panel (its « Suivant »): as wide as the room beside it, 240 at least
    const gap = Math.round(GAP * monitor.scaleFactor);
    const room = Math.max(pos.x - monitor.position.x, monitor.position.x + monitor.size.width - (pos.x + size.width)) - gap;
    r.width = Math.min(r.width, Math.max(Math.round(240 * monitor.scaleFactor), room));
    if (r.x > pos.x) r.x = pos.x + size.width + gap;
    else r.x = pos.x - gap - r.width;
  }
  // positions, sizes and the monitor are physical pixels: stay in physical units (mixed-DPI setups)
  await preview.setSize(new PhysicalSize(r.width, r.height));
  await preview.setPosition(new PhysicalPosition(r.x, r.y));
  await preview.show(); // no focus
  if (render) {
    if (touring) showGuideStep();
    else renderPreview();
  }
}

/* ---------- hover preview: a folded monster's badges and summary beside the panel ---------- */


// where the preview goes: beside which window (the panel, or the settings' example window), level with which row
let peekAnchor: { base: Window; top: number } | null = null;

// a mechanic's chip or a spell whose sheet a click pinned beside the panel: it stays (hovering elsewhere does not
// replace it) until a second click on it, a click elsewhere, Escape or a scroll
let pinned: HTMLElement | null = null;
const pressedAttr = (el: HTMLElement) => (el.classList.contains("sp") ? "aria-pressed" : "aria-expanded");
function setPinned(el: HTMLElement | null): void {
  if (pinned) pinned.setAttribute(pressedAttr(pinned), "false");
  pinned = el;
  el?.setAttribute(pressedAttr(el), "true");
}

function hidePeek(): void {
  if (pinned) setPinned(null);
  window.clearTimeout(peekTimer);
  peekRow = null;
  peekAnchor = null;
  peekToken++; // a preview still being measured is dropped
  if (!peekShown) return;
  peekShown = false;
  void Window.getByLabel("peek").then((w) => w?.hide());
}

function showPeek(row: HTMLElement): void {
  if (!snap || !room) return;
  peekAnchor = { base: win, top: row.getBoundingClientRect().top };
  renderPeekOf(Number(row.dataset.monster), summaryOf(room));
}

function renderPeekOf(id: number, roomSummary: RoomSummary | undefined): void {
  if (!snap) return;
  const v = view ?? snap;
  const m = v.monsters.get(id);
  const summary = roomSummary?.monsters[String(id)] ?? v.monsterSummaries?.get(id);
  const html = m ? renderPeek(m, summary, settings, iconResolver(v), v.vocabulary) : "";
  if (!html) return hidePeek();
  void emit("peek:render", { token: ++peekToken, html });
}

// the settings' example window: a folded row hovered there (or null when the pointer leaves) shows the same preview,
// on the far side of that window
void listen<{ id?: number; spell?: number; mechanic?: string; top: number } | null>("preview:peek", async ({ payload }) => {
  hidePeek();
  if (!payload || !snap || !settings.hoverPeek) return;
  const base = await Window.getByLabel("preview");
  if (!base) return;
  const d = [...snap.dungeons.values()].find((x) => x.name === PREVIEW_DUNGEON);
  peekAnchor = { base, top: payload.top };
  const sheet = payload.mechanic !== undefined ? (view ?? snap).mechanics?.get(payload.mechanic) : undefined;
  const spell = payload.spell !== undefined ? (view ?? snap).spells.get(payload.spell) : undefined;
  if (sheet) void emit("peek:render", { token: ++peekToken, html: renderMechanicSheet(sheet) });
  else if (spell) void emit("peek:render", { token: ++peekToken, html: renderSpellSheet(spell, iconResolver(snap)) });
  else if (payload.id !== undefined) renderPeekOf(payload.id, d ? (view ?? snap).summaries.get(d.id) : undefined);
});

// the preview window measured itself: size it and place it beside the panel, level with the hovered row
void listen<{ token: number; height: number }>("peek:size", async ({ payload }) => {
  const anchor = peekAnchor;
  if (payload.token !== peekToken || !anchor) return;
  const peek = await Window.getByLabel("peek");
  const monitor = await currentMonitor();
  if (!peek || !monitor) return;
  const scale = await anchor.base.scaleFactor();
  const pos = await anchor.base.innerPosition();
  const size = await anchor.base.innerSize();
  const screen = { x: monitor.position.x, y: monitor.position.y, width: monitor.size.width, height: monitor.size.height };
  const gap = Math.round(GAP * scale);
  let side = previewRect({ x: pos.x, y: pos.y, width: size.width, height: size.height }, screen, gap);
  if (anchor.base !== win) {
    // beside the example window, on the side away from the panel (kept on screen)
    const panel = await win.innerPosition();
    const x = panel.x < pos.x ? pos.x + size.width + gap : pos.x - size.width - gap;
    side = { ...side, x: Math.min(Math.max(x, screen.x), screen.x + screen.width - size.width) };
  }
  const height = Math.round(payload.height * scale);
  const top = pos.y + Math.round(anchor.top * scale);
  const y = Math.max(screen.y, Math.min(top, screen.y + screen.height - height));
  if (payload.token !== peekToken) return;
  peekShown = true; // from here a hidePeek() hides it, even while it is being placed
  await peek.setSize(new PhysicalSize(side.width, height));
  await peek.setPosition(new PhysicalPosition(side.x, y));
  if (payload.token !== peekToken) return; // hidden meanwhile (the pointer left, the list was drawn again)
  await peek.show(); // no focus (the window cannot take it)
});

// a mechanic's chip (room header or a monster's card): its sheet in the side preview, after `delay` ms; pinned by a
// click, the sheet stays and links to its guide section
function showMechanic(mech: HTMLElement, delay: number, pin = false): void {
  hidePeek();
  peekRow = mech;
  if (pin) setPinned(mech);
  peekTimer = window.setTimeout(() => {
    const sheet = (view ?? snap)?.mechanics?.get(mech.dataset.mechanic ?? "");
    if (!sheet) return;
    peekAnchor = { base: win, top: mech.getBoundingClientRect().top };
    void emit("peek:render", { token: ++peekToken, html: renderMechanicSheet(sheet, { link: pin }) });
  }, delay);
}

// « Comment y aller » (the header's button): the place's requirements and route, pinned beside the panel at once (no
// hover preview: it is read, not glanced at); a second click closes it
function showAccess(btn: HTMLElement): void {
  hidePeek();
  if (!accessShown) return;
  peekRow = btn;
  setPinned(btn);
  peekAnchor = { base: win, top: btn.getBoundingClientRect().top };
  void emit("peek:render", { token: ++peekToken, html: renderAccessSheet(accessShown.title, accessShown.pa, accessShown.trip) });
}

// a spell (an open card's spell button): its sheet in the side preview, after `delay` ms; pinned by a click (owner,
// 2026-11-19: the sheet sits beside the panel, as the hover preview does, not inside the card)
function showSpellAside(sp: HTMLElement, delay: number, pin = false): void {
  hidePeek();
  peekRow = sp;
  if (pin) setPinned(sp);
  peekTimer = window.setTimeout(() => {
    const spell = (view ?? snap)?.spells.get(Number(sp.dataset.spell));
    if (!spell || !snap) return;
    peekAnchor = { base: win, top: sp.getBoundingClientRect().top };
    void emit("peek:render", { token: ++peekToken, html: renderSpellSheet(spell, iconResolver(snap)) });
  }, delay);
}

$("room").addEventListener("pointerover", (e) => {
  if (pinned) return; // a pinned sheet stays while the pointer moves around
  const mech = (e.target as HTMLElement).closest<HTMLElement>(".mech");
  if (mech) {
    if (mech === peekRow) return;
    if (settings.hoverPeek) showMechanic(mech, PEEK_DELAY);
    else hidePeek();
    return;
  }
  // a spell of an open card: its sheet in the side preview (a click pins it there)
  const sp = (e.target as HTMLElement).closest<HTMLElement>(".sp");
  if (sp) {
    if (sp === peekRow) return;
    if (settings.hoverPeek) showSpellAside(sp, PEEK_DELAY);
    else hidePeek();
    return;
  }
  const row = (e.target as HTMLElement).closest<HTMLElement>('.mob[data-open="false"]');
  if (row === peekRow) return;
  hidePeek();
  if (!row || !settings.hoverPeek) return;
  peekRow = row;
  peekTimer = window.setTimeout(() => showPeek(row), PEEK_DELAY);
});
$("room").addEventListener("pointerleave", () => {
  if (!pinned) hidePeek(); // a pinned sheet can be reached with the pointer (its « Guide » link)
});
$("room").addEventListener("pointerdown", (e) => {
  if ((e.target as HTMLElement).closest(".mech, .sp, .access")) return; // the click below pins or unpins
  hidePeek(); // a click unfolds the row: the preview goes (a pinned sheet too)
});
// a click (or Enter) on a mechanic's chip or a spell pins its sheet beside the panel, even with the hover preview
// off; a second click closes it
$("room").addEventListener("click", (e) => {
  const access = (e.target as HTMLElement).closest<HTMLElement>("#room .access");
  if (access) {
    if (pinned === access) hidePeek();
    else showAccess(access);
    return;
  }
  const mech = (e.target as HTMLElement).closest<HTMLElement>(".mech");
  const sp = mech ? null : (e.target as HTMLElement).closest<HTMLElement>(".sp");
  const el = mech ?? sp;
  if (!el) return;
  if (pinned === el) hidePeek();
  else if (mech) showMechanic(mech, 0, true);
  else showSpellAside(sp!, 0, true);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pinned) hidePeek();
});
// a command copied from a pinned sheet (« Comment y aller »): the side window cannot take the focus, and once the
// player has clicked into the game the panel has lost it too, so the copy goes through the clipboard plugin (no focus
// needed); the sheet is told whether it worked before it says « Copié »
void listen<string>("peek:copy", async ({ payload }) => {
  if (!/^\/(travel|zaap) /.test(payload)) return;
  const ok = await writeText(payload).then(() => true, () => false);
  void emit("peek:copied", { command: payload, ok });
});
// the « Guide » link of a pinned sheet, clicked in the preview window (which can only talk to the panel)
void listen<string>("peek:open", ({ payload }) => {
  if (/^https:\/\//.test(payload)) void openUrl(payload);
  hidePeek();
});
$("view-main").addEventListener("scroll", hidePeek);

function update(patch: Partial<Settings>): void {
  const logged = loggableSettings(patch);
  if (logged) diag("settings", logged);
  if ("expandAll" in patch) flipped.clear(); // the option resets the rows opened or closed one by one
  const wasCapturing = capturingGame(settings);
  const wasReading = settings.reading;
  settings = updateSettings(localStorage, patch);
  // the window is captured only when something uses it (the switch on, an option or Songe on)
  if (capturingGame(settings) !== wasCapturing) {
    void invoke("set_reading", { on: capturingGame(settings) });
    diag("screen", `capture ${capturingGame(settings) ? "on" : "off"}`);
  }
  if (settings.reading !== wasReading) {
    diag("screen", `reading ${settings.reading ? "on" : "off"}`);
    // « Lecture de l'écran coupée » comes and goes at once, not with the next readings
    status = settings.reading ? initialStatus() : { shown: { kind: "off", text: t("status.readingOff") }, pending: null, count: 0 };
    $("zone").textContent = statusText(status.shown);
    $("zone").classList.remove("warn");
  }
  if ("reading" in patch || "songe" in patch) showSongeState();
  if ("locked" in patch) showLock();
  applyLook();
  showRoom();
  syncSettingsView();
}

function openSettings(open: boolean): void {
  hidePeek();
  if (open) $("view-guide").hidden = true;
  else guideReturn = false; // the settings left any way: their back arrow no longer leads to the guide
  $("view-settings").hidden = !open;
  $("view-main").hidden = open || !$("view-guide").hidden; // closing the settings keeps an open guide
  if (open) {
    syncSettingsView();
    void fillReferenceWindows();
  }
  void placePreview();
}

/** The settings controls whose texts are built in code (switches, theme cards, report kinds), in the current language. */
function buildControls(): void {
  switches("opts-combat", COMBAT);
  switches("opts-display", DISPLAY);
  switches("opts-kinds", KINDS_SHOWN);
  // the zone's and dungeon's own monsters are always listed: a switch that stays on, first of its group
  const always = esc(t("opt.zoneMonsters"));
  $("opts-kinds").insertAdjacentHTML("afterbegin", `<div class="switch always"><span class="optname">${always}</span><input type="checkbox" role="switch" aria-label="${always}" checked disabled></div>`);
  switches("opts-card", CARD);
  switches("opts-card2", CARD_AFTER_BADGES);
  switches("opts-badges", BADGES);
  // the Dofus interface themes, like Ganymède: a small card with the theme colour and its accent
  // the text sizes, side by side like the languages
  $("text-size").innerHTML = TEXT_SIZES.map((size) => `<button type="button" class="lang" role="radio" aria-checked="false" data-size="${size}">${esc(t("settings.opacityValue", { value: size }))}</button>`).join("");
  $("themes").innerHTML = THEMES.map((theme) => {
    const name = esc(themeName(theme));
    return `<button class="theme" role="radio" aria-checked="false" data-theme="${theme.id}" title="${name}" style="--tb:${theme.base};--ta:${theme.accent}"><i></i><span>${name}</span></button>`;
  }).join("");
  const kind = $<HTMLSelectElement>("report-kind");
  const chosen = kind.value;
  kind.innerHTML = KINDS.map((k) => `<option value="${k}">${esc(t(`report.kind.${k}` as Key))}</option>`).join("");
  if (chosen) kind.value = chosen;
}
buildControls();

/** The player picked another interface language: every text is written again in it. */
function changeLang(lang: Lang): void {
  setLang(lang);
  applyI18n(document);
  showSongeState(); // its tooltip depends on the reading, not only on the language
  buildControls();
  update({ lang }); // room, preview and the settings view (switch states, shortcut, theme name)
  showGuideTexts(); // after update: its chosen language and picture follow settings.lang
  if (!$("view-guide").hidden) startTour();
  showResults();
  // the game data and summaries in the new language (fetched the first time), then everything shown again
  void refreshView().then(() => {
    showResults();
    showRoom();
    renderPreview();
    if (!$("view-guide").hidden) startTour(); // the sample in the new language's names
  });
  if (!$("view-settings").hidden) void fillReferenceWindows();
}
// the language picker: two radio buttons with a small flag, right on the « Langue » row (arrows move between them)
const pickLang = (lang: string | undefined) => {
  const next: Lang = lang === "en" ? "en" : "fr";
  if (next !== settings.lang) changeLang(next);
  document.querySelector<HTMLElement>(`#lang .lang[data-lang="${next}"]`)?.focus();
};
$("lang").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(".lang");
  if (!btn) return;
  pickLang(btn.dataset.lang);
});
$("lang").addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
  e.preventDefault();
  pickLang(settings.lang === "fr" ? "en" : "fr");
});
// the text size: a radio group like the languages
const pickSize = (size: number) => {
  if (size !== settings.textSize) update({ textSize: size });
  document.querySelector<HTMLElement>(`#text-size .lang[data-size="${size}"]`)?.focus();
};
$("text-size").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(".lang");
  if (btn) pickSize(Number(btn.dataset.size));
});
$("text-size").addEventListener("keydown", (e) => {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const at = TEXT_SIZES.indexOf(settings.textSize);
  pickSize(TEXT_SIZES[(at + step + TEXT_SIZES.length) % TEXT_SIZES.length]);
});
// only the current theme shows; a click unfolds all of them (they stay open while trying them), the header folds them
function showThemes(open: boolean): void {
  $("themes").hidden = !open;
  $("theme-current").setAttribute("aria-expanded", String(open));
  if (open) document.querySelector<HTMLElement>('#themes .theme[aria-checked="true"]')?.focus();
}
$("theme-current").addEventListener("click", () => showThemes(($("themes") as HTMLElement).hidden === true));
$("themes").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>(".theme");
  if (!b) return;
  update({ theme: b.dataset.theme! }); // the list stays open to try others; its header (or Escape) folds it
});
$("themes").addEventListener("keydown", (e) => {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) {
    if (e.key === "Escape") {
      showThemes(false);
      $("theme-current").focus();
    }
    return;
  }
  e.preventDefault();
  const all = [...document.querySelectorAll<HTMLElement>("#themes .theme")];
  const at = all.findIndex((b) => b.dataset.theme === settings.theme);
  const next = all[(at + step + all.length) % all.length];
  update({ theme: next.dataset.theme! }); // like any radio group, moving selects (the picker stays open)
  next.focus();
});
$("eye").addEventListener("click", () => {
  update({ preview: !settings.preview });
  void placePreview();
});
$("view-settings").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id === "opt-reading") {
    const on = input.checked; // read first: turning Songe off redraws the settings, this switch included
    if (!on && settings.songe) setSonge(false, "player"); // the zone comes back, as with its button
    update(readingPatch(settings, on));
  } else if (input.dataset.key) update({ [input.dataset.key]: input.checked } as Partial<Settings>);
});
$("opacity").addEventListener("input", (e) => update({ opacity: Number((e.target as HTMLInputElement).value) }));

/* ---------- the getting-started guide (spec 2026-11-18, part 2): first use only, then from the menu ---------- */


/** The shortcut could not be registered (another application holds it). */
let shortcutTaken = false;

/** The texts built in code: the shortcut (the player's own keys) and the language buttons. */
function showGuideTexts(): void {
  const keys = shortcutLabel(settings.shortcut);
  $("guide-shortcut").textContent = t(shortcutTaken ? "guide.shortcut.taken" : "guide.shortcut.text", { keys });
  $("guide-nodofus").hidden = !dofusClosed;
  document.querySelectorAll<HTMLElement>("#guide-lang .lang").forEach((btn) => {
    const chosen = btn.dataset.lang === settings.lang;
    btn.setAttribute("aria-checked", String(chosen));
    btn.tabIndex = chosen ? 0 : -1;
  });
}

/** `first`: opened by itself on the first use (« C'est parti »); from the menu or the settings, « Retour ». */
function openGuide(first = false, restart = true): void {
  hidePeek();
  const back = guideReturnFocus;
  guideReturn = false;
  guideReturnFocus = "";
  guideFirst = first;
  if (first) {
    try {
      localStorage.setItem(GUIDE, "0"); // opened by itself: until the player closes it, it opens again
    } catch {
      // it may not open again
    }
  }
  for (const id of ["view-main", "view-settings", "view-report"]) $(id).hidden = true;
  showGuideTexts();
  $("view-guide").hidden = false;
  $("view-guide").querySelector(".pagebody")!.scrollTop = 0;
  startTour(restart);
  void placePreview();
  // the keyboard on « Suivant » (the back arrow would close it for good), or back on the link that left it
  $(back || "tour-next").focus({ preventScroll: true });
}

/** Closed by the player (seen: it never opens by itself again) or by a fight (not seen: it comes back next launch). */
function closeGuide(seen: boolean): void {
  if (seen) {
    try {
      localStorage.setItem(GUIDE, "1");
    } catch {
      // it may open again next launch
    }
  }
  $("view-guide").hidden = true;
  $("view-main").hidden = false;
  void emit("preview:render", { label: "", html: "" }); // the tour leaves the window beside, which may show again
  void placePreview(false); // the tour's window goes
  if (seen) $("menu-btn").focus({ preventScroll: true }); // where the guide says it can be found again
}

/** A game setting the guide asks for was seen in a reading: its card says so. */
function guideSeen(what: "coords" | "bar"): void {
  $(`guide-${what}-seen`).hidden = false;
  $(`guide-${what}-seen`).parentElement!.querySelector<HTMLElement>(".later")!.hidden = true;
}

/** From the guide to a setting: the settings open on its card, and their back arrow returns to the guide. */
function guideToSetting(card: string, focus: string, from: string): void {
  guideReturnFocus = from;
  openSettings(true);
  guideReturn = true; // (after openSettings, which clears it when it closes the settings)
  openCard(card);
  $(focus).focus({ preventScroll: true });
  $(focus).scrollIntoView?.({ block: "center" });
}

$("guide-open").addEventListener("click", () => openGuide());
$("guide-back").addEventListener("click", () => closeGuide(true));
$("guide-to-reading").addEventListener("click", () => guideToSetting("reading", "opt-reading", "guide-to-reading"));
$("guide-to-shortcut").addEventListener("click", () => guideToSetting("window", "shortcut", "guide-to-shortcut"));
$("guide-skip").addEventListener("click", () => closeGuide(true));
// the language buttons: a radio group, like the settings' (click, or the arrows)
const pickGuideLang = (lang: string | undefined) => {
  const next: Lang = lang === "en" ? "en" : "fr";
  if (next !== settings.lang) changeLang(next);
  document.querySelector<HTMLElement>(`#guide-lang .lang[data-lang="${next}"]`)?.focus();
};
$("guide-lang").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(".lang");
  if (btn) pickGuideLang(btn.dataset.lang);
});
$("guide-lang").addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
  e.preventDefault();
  pickGuideLang(settings.lang === "fr" ? "en" : "fr");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("view-guide").hidden && $("update").hidden) closeGuide(true);
});
/* the tour: one element of a sample panel lit up at a time, its bubble pointing at it (owner, 2026-11-18) */

/** Each step: what to light up in the sample, and what the bubble says. A step whose element is missing is skipped. */
const TOUR: { sel: string; key: Key }[] = [
  { sel: ".tour-search", key: "guide.tour.search" },
  { sel: ".tour-songe", key: "guide.tour.songe" },
  { sel: ".roomhead .dj", key: "guide.tour.head" },
  { sel: ".roomhead .mech", key: "guide.tour.mech" },
  { sel: '.mob.boss[data-open="true"] .tags', key: "guide.tour.badges" },
  // the open card: its level, HP, AP, MP and resistances ringed together (owner, 2026-11-18), then its spells
  { sel: '.mob.boss[data-open="true"] .stats, .mob.boss[data-open="true"] .resrow', key: "guide.tour.stats" },
  { sel: '.mob.boss[data-open="true"] .spells', key: "guide.tour.spells" },
  { sel: '.mob[data-open="false"] .mh', key: "guide.tour.folded" },
  // the filter above the list (« Filtrer les résultats »)
  { sel: ".tour-filter", key: "guide.tour.filter" },
  // then the gear (the settings), the padlock, and last where to find the guide again: the menu
  { sel: ".tour-gear", key: "guide.tour.gear" },
  { sel: ".tour-lock", key: "guide.tour.lock" },
  { sel: ".tour-menu", key: "guide.tour.menu" },
];
/** A guide step: its card here, and what the window beside shows (the game's corner, or the sample panel), ringed. */
type GuideStep = { card: "reads" | "coords" | "bar" | "shortcut" | "tour"; tip: Key; text?: Key; corner?: "all" | "coords" | "bar"; sel?: string };
/** The setup first, in the game's corner: what Dofight reads, the coordinates, the icon bar; then the shortcut. */
const SETUP: GuideStep[] = [
  { card: "reads", tip: "guide.tip.reads", corner: "all" },
  { card: "coords", tip: "guide.tip.coords", corner: "coords" },
  { card: "bar", tip: "guide.tip.bar", corner: "bar" },
  { card: "shortcut", tip: "guide.tip.shortcut", sel: ".tour-bar" },
];
let guideSteps: GuideStep[] = SETUP;
let guideStep = 0;
/** Opened by itself on the first use: its last button says « C'est parti » (else « J'ai compris »). */
let guideFirst = false;
/** The sample panel, drawn once per tour start: a mock top bar and search row, then the dungeon drawn by the app. */
let tourHtml = "";

/** The sample's dungeon, drawn by the app with every display option on, its boss open; the steps that find their element. */
function buildTour(): void {
  const bar = `<div class="tour-bar"><span class="tour-menu">${icon("menu")}</span><span class="tour-lock">${icon("unlock")}</span><b>Dofight</b><span class="tour-gear">${icon("gear")}</span></div>`;
  const search = `<div class="tour-searchrow"><span class="tour-search">${esc(t("main.searchPlaceholder"))}</span><span class="songe tour-songe">${$("songe").innerHTML}</span></div>`;
  const d = snap?.dungeons.get(TOUR_DUNGEON) ?? (snap ? [...snap.dungeons.values()].find((x) => x.name === PREVIEW_DUNGEON) : undefined);
  let room = `<p class="empty">${esc(t("guide.tour.loading"))}</p>`;
  if (snap && view && d) {
    const monsters = d.monsterIds.map((id) => snap!.monsters.get(id)).filter((m): m is Monster => !!m);
    const r: Room = { dungeon: d, title: d.name, monsters };
    const v = shown(r);
    const boss = monsters.find((m) => m.boss)?.id;
    room = renderRoom(v.dungeon, v.monsters, summaryOf(r), view, { ...DEFAULTS, suggest: false }, iconResolver(view), v.title, (id) => id === boss);
  }
  const filter = `<div class="tour-filter">${icon("filter")}<span>${esc(t("find.placeholder"))}</span></div>`;
  tourHtml = `<div class="tour">${bar}${search}${filter}${room}</div>`;
  const probe = document.createElement("div");
  probe.innerHTML = tourHtml;
  // the data could not load: the setup steps only (the sample would say « Chargement… » for ever)
  const tour = dataFailed ? [] : TOUR.filter((step) => probe.querySelector(step.sel));
  guideSteps = [...SETUP, ...tour.map((step): GuideStep => ({ card: "tour", tip: step.key, text: step.key, sel: step.sel }))];
}

/** The game's corner (the player's client language), the step's part ringed. */
/** The game's corner (the player's client language) with its three parts, so its picture loads once for steps 1-3. */
const cornerHtml = () =>
  `<div class="corner-shot"><img src="/guide/corner-${settings.lang}.png" alt="${esc(t("guide.corner"))}" />${["all", "coords", "bar"].map((p) => `<span class="corner-part" data-part="${p}"></span>`).join("")}</div>`;

/** The current step: its card here, its ring and bubble in the window beside the panel. */
function showGuideStep(): void {
  guideStep = Math.max(0, Math.min(guideStep, guideSteps.length - 1));
  const step = guideSteps[guideStep];
  const last = guideStep === guideSteps.length - 1;
  document.querySelectorAll<HTMLElement>("#guide-steps .guide-step").forEach((card) => (card.hidden = card.dataset.step !== step.card));
  if (step.text) $("tour-text").textContent = t(step.text);
  $("guide-top").hidden = guideStep !== 0; // the language and the intro: the first step only
  $("guide-nodofus").hidden = !(last && dofusClosed);
  // the two settings in Dofus: a ✓ once seen, else « later » while Dofus is closed
  document.querySelectorAll<HTMLElement>("#guide-steps .later").forEach((p) => (p.hidden = !dofusClosed || !p.parentElement!.querySelector<HTMLElement>(".seen")!.hidden));
  $("tour-count").textContent = t("guide.tour.count", { n: guideStep + 1, total: guideSteps.length });
  $("guide-skip").hidden = last;
  const prev = $<HTMLButtonElement>("tour-prev");
  if (guideStep === 0 && document.activeElement === prev) $("tour-next").focus({ preventScroll: true }); // a disabled button would keep the keyboard
  prev.disabled = guideStep === 0;
  const next = $("tour-next");
  next.dataset.i18n = last ? (guideFirst ? "guide.done" : "guide.gotIt") : "guide.tour.next";
  next.textContent = t(next.dataset.i18n as Key);
  // a taken shortcut: no bubble promising it works (its card says it is taken)
  const tip = step.card === "shortcut" && shortcutTaken ? "" : t(step.tip, { keys: shortcutLabel(settings.shortcut) });
  const html = step.corner ? cornerHtml() : tourHtml;
  void emit("preview:tour", { label: t("guide.title"), html, sel: step.corner ? `.corner-part[data-part="${step.corner}"]` : step.sel, text: tip });
}

/** The steps again (the data loaded, the language changed), at the same step; `restart` from the first one. */
function startTour(restart = false): void {
  buildTour();
  if (restart) guideStep = 0;
  if ($("view-guide").hidden) return;
  showGuideStep();
  void placePreview(false);
}
$("tour-prev").addEventListener("click", () => {
  guideStep--;
  showGuideStep();
});
$("tour-next").addEventListener("click", () => {
  if (guideStep === guideSteps.length - 1) return closeGuide(true);
  guideStep++;
  showGuideStep();
});

if (firstUse) openGuide(true);

/* ---------- settings cards that fold (owner, 2026-11-18): folded until the player opens one, then remembered ---------- */

function unfolded(): Record<string, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(FOLDS) ?? "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

/** Unfolds or folds a settings card (`reading`, `display`, `window`, `look`, `diagnostic`), remembered. */
function openCard(card: string, open = true): void {
  const fold = document.querySelector<HTMLElement>(`.card[data-card="${card}"] .fold`);
  if (!fold) return;
  fold.setAttribute("aria-expanded", String(open));
  $(`card-${card}`).hidden = !open;
  try {
    localStorage.setItem(FOLDS, JSON.stringify({ ...unfolded(), [card]: open }));
  } catch {
    // the state stays for this session
  }
  void placePreview(); // the settings grew or shrank
}
{
  const saved = unfolded();
  document.querySelectorAll<HTMLElement>(".card[data-card]").forEach((card) => {
    const open = saved[card.dataset.card!] === true;
    card.querySelector(".fold")!.setAttribute("aria-expanded", String(open));
    $(`card-${card.dataset.card}`).hidden = !open;
  });
}
// a click on a card's title folds or unfolds it; its own controls (the switch, the « i ») keep their click
$("view-settings").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const head = target.closest<HTMLElement>(".cardhead");
  if (!head || target.closest("input, select, a, .info, .bubble, .eye")) return;
  const card = head.closest<HTMLElement>(".card")!.dataset.card!;
  openCard(card, !!$(`card-${card}`).hidden);
});
$("gear").addEventListener("click", () => openSettings(!!$("view-settings").hidden));
/** Back to the panel; the keyboard lands on the gear that opened the settings. */
function closeSettings(): void {
  const toGuide = guideReturn;
  openSettings(false);
  if (toGuide) {
    // reached from the guide: back to it, at the step it was left
    openGuide(guideFirst, false);
    return;
  }
  $("gear").focus({ preventScroll: true });
}
$("back").addEventListener("click", closeSettings);
// Escape in the settings goes back too (the theme picker, an option's « i » and the fields handle their own Escape)
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || $("view-settings").hidden) return;
  const target = e.target as HTMLElement;
  if (target.closest?.("#themes, #lang, input:not([type=checkbox]), select, textarea")) return;
  if (document.querySelector(".switch:has(.info:hover), .switch:has(.info:focus-visible)")) return;
  closeSettings();
});
$("hide").addEventListener("click", () => void hidePanel(true));

/* ---------- global shortcut (shows or hides the overlay, even from the game) ---------- */

let capturing = false;
async function applyShortcut(keys: string): Promise<boolean> {
  try {
    await invoke("set_shortcut", { keys });
    return true;
  } catch {
    return false;
  }
}
void applyShortcut(settings.shortcut).then((ok) => {
  shortcutTaken = !ok;
  showGuideTexts();
});
$("shortcut").addEventListener("click", () => {
  capturing = true;
  $("shortcut").textContent = t("settings.shortcutPress");
  $("shortcut-hint").textContent = t("settings.shortcutHowTo");
});
document.addEventListener("keydown", async (e) => {
  if (!capturing) return;
  e.preventDefault();
  e.stopPropagation();
  const done = (hint: string) => {
    capturing = false;
    $("shortcut").textContent = shortcutLabel(settings.shortcut);
    $("shortcut-hint").textContent = hint;
  };
  if (e.key === "Escape") return done("");
  const keys = fromKeyEvent(e);
  if (!keys) return; // still waiting for a full combination
  if (await applyShortcut(keys)) {
    shortcutTaken = false;
    update({ shortcut: keys });
    showGuideTexts();
    done("");
  } else {
    await applyShortcut(settings.shortcut); // keep the previous one
    done(t("settings.shortcutTaken", { keys: shortcutLabel(keys) }));
  }
}, true);

/* ---------- « Suggérer »: a report on a dungeon, a zone, a monster, or on the app ---------- */

// what the suggestion is about: the room shown when it was opened, or what the player picked in its search
let reportSubject: Result | null = null;
let subjectResults: Result[] = [];
let reportFrom: "main" | "settings" = "main"; // the view the form was opened from: « Retour » goes back there
let lastReading: Reading | null = null;
let lastSentAt: number | null = null;
let version = "?";
void getVersion()
  .then((v) => {
    version = v;
    $("version").textContent = `Dofight ${v}`; // the bottom of the settings
  })
  .catch(() => undefined);

function reportBody() {
  const s = reportSubject;
  const m = s?.kind === "monster" && s.monsterId !== undefined ? snap?.monsters.get(s.monsterId) ?? null : null;
  return buildReport({
    kind: $<HTMLSelectElement>("report-kind").value as ReportKind,
    text: $<HTMLTextAreaElement>("report-text").value,
    monster: m,
    subject: s && s.kind !== "monster" ? { kind: s.kind, label: s.label } : null,
    room: room?.title ?? null,
    attachState: $<HTMLInputElement>("report-state").checked,
    reading: lastReading,
    settings,
    version,
  });
}

/** The room shown, as a suggestion's subject (a dungeon, or a zone or expedition). */
function roomSubject(): Result | null {
  if (!room) return null;
  return room.dungeon
    ? { kind: "dungeon", label: room.title, info: "", dungeonId: room.dungeon.id }
    : { kind: "subarea", label: room.title, info: "", subarea: room.title };
}

function openReport(subject: Result | null): void {
  reportSubject = subject;
  reportFrom = $("view-settings").hidden ? "main" : "settings";
  guideReturn = false;
  $<HTMLInputElement>("report-subject").value = subject?.label ?? "";
  $("report-subject-list").hidden = true;
  $<HTMLSelectElement>("report-kind").value = subject ? KINDS[0] : "bug";
  $<HTMLTextAreaElement>("report-text").value = "";
  showReportCount();
  $("report-status").textContent = "";
  for (const id of ["view-main", "view-settings", "view-guide"]) $(id).hidden = true;
  $("view-report").hidden = false;
  void placePreview();
  $("report-text").focus();
}

function closeReport(): void {
  $("view-report").hidden = true;
  if (reportFrom === "settings") {
    openSettings(true); // the settings come back as they were, their preview included
    $("report-app").focus({ preventScroll: true });
  } else {
    $("view-main").hidden = false;
    // the keyboard lands back on the « Suggestion » button at the bottom of the results
    document.querySelector<HTMLElement>("#room .suggest")?.focus({ preventScroll: true });
  }
}

const REPORT_ERRORS: Record<string, Key> = {
  "not-configured": "report.notConfigured",
  cooldown: "report.cooldown",
  network: "report.network",
  "too-big": "report.tooBig",
};

async function sendReport(): Promise<void> {
  const text = $<HTMLTextAreaElement>("report-text").value.trim();
  const status = $("report-status");
  if (text.length < 5) {
    status.textContent = t("report.tooShort");
    return;
  }
  const wait = cooldownLeft(lastSentAt, Date.now());
  if (wait > 0) {
    status.textContent = t("report.wait", { seconds: Math.ceil(wait / 1000) });
    return;
  }
  const button = $<HTMLButtonElement>("report-send");
  button.disabled = true;
  status.textContent = t("report.sending");
  try {
    await invoke("send_report", { body: reportBody(), attachLog: $<HTMLInputElement>("report-log").checked });
    diag("report", "suggestion sent");
    lastSentAt = Date.now();
    status.textContent = t("report.sent");
    window.setTimeout(closeReport, 1500);
  } catch (err) {
    const code = String(err);
    diag("report", `not sent: ${code}`); // the raw error for us, words for the player
    status.textContent = code in REPORT_ERRORS ? t(REPORT_ERRORS[code]) : t("report.failed");
  } finally {
    button.disabled = false;
  }
}

$("report-back").addEventListener("click", closeReport);
// near the limit, a counter says how much room is left
const REPORT_MAX = 1000;
const REPORT_COUNT_FROM = 800;
function showReportCount(): void {
  const count = $<HTMLTextAreaElement>("report-text").value.length;
  $("report-count").textContent = count > REPORT_COUNT_FROM ? t("report.count", { count, max: REPORT_MAX }) : "";
}
$("report-text").addEventListener("input", showReportCount);
// Escape goes back, like the settings: first it closes the subject's list, and it never drops a typed text
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || $("view-report").hidden) return;
  if (!$("report-subject-list").hidden) {
    $("report-subject-list").hidden = true;
    return;
  }
  const field = (e.target as HTMLElement).closest?.("input, textarea, select") as HTMLInputElement | null;
  if (field?.tagName === "SELECT") return; // its own list closes
  if (field && field.type !== "checkbox" && field.value.trim()) return;
  if ($<HTMLTextAreaElement>("report-text").value.trim()) return;
  closeReport();
});
$("report-cancel").addEventListener("click", closeReport);
$("report-send").addEventListener("click", () => void sendReport());
$("report-app").addEventListener("click", () => openReport(null));

// the subject: typing searches dungeons, zones, expeditions and monsters; picking one sets it, emptying it clears it
$("report-subject").addEventListener("input", () => {
  const q = $<HTMLInputElement>("report-subject").value;
  reportSubject = null;
  subjectResults = q.trim() && searchView ? search(searchView, q, 6) : [];
  const list = $("report-subject-list");
  list.innerHTML = subjectResults
    .map((r, i) => `<button type="button" class="res-item" data-i="${i}"><span><span class="kind">${resultKind(r)}</span>${esc(r.label)}</span>${resultInfo(r)}</button>`)
    .join("");
  list.hidden = subjectResults.length === 0;
});
$("report-subject-list").addEventListener("click", (e) => {
  const pick = (e.target as HTMLElement).closest<HTMLElement>(".res-item");
  if (!pick) return;
  reportSubject = subjectResults[Number(pick.dataset.i)] ?? null;
  $<HTMLInputElement>("report-subject").value = reportSubject?.label ?? "";
  $("report-subject-list").hidden = true;
});

/* ---------- the ☰ menu: suggestion, Discord, support (the same actions as the settings' last card) ---------- */

function showMenu(open: boolean): void {
  $("menu").hidden = !open;
  $("menu-btn").setAttribute("aria-expanded", String(open));
  if (open) document.querySelector<HTMLElement>("#menu [role=menuitem]")?.focus();
}
// the Discord logo of the settings button, drawn again in the menu
$("menu").querySelector(".discord-ic")!.innerHTML = $("discord").querySelector("svg")!.outerHTML;
$("menu-btn").addEventListener("click", () => showMenu($("menu").hidden === true));
$("menu").addEventListener("click", (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>("[data-go]");
  if (!item) return;
  showMenu(false);
  $(item.dataset.go!).click();
});
$("menu").addEventListener("keydown", (e) => {
  const items = [...document.querySelectorAll<HTMLElement>("#menu [role=menuitem]")];
  const at = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
  } else if (e.key === "Escape") {
    e.stopPropagation();
    showMenu(false);
    $("menu-btn").focus();
  }
});
// a press anywhere else closes it
document.addEventListener("pointerdown", (e) => {
  const target = e.target as HTMLElement;
  if (!$("menu").hidden && !target.closest("#menu, #menu-btn")) showMenu(false);
});
// « Soutenir le projet »: the Ko-fi page, in the browser
const SUPPORT_URL = "https://ko-fi.com/dofight";
$("support").addEventListener("click", () => void openUrl(SUPPORT_URL));
// « Rejoindre le Discord »: the server's invite, in the browser (or the Discord app)
const DISCORD_URL = "https://discord.gg/G8G4cyvpx6";
$("discord").addEventListener("click", () => void openUrl(DISCORD_URL));

/* ---------- main view ---------- */

document.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const res = target.closest<HTMLElement>("#results .res-item");
  if (res && snap) {
    const picked = results[Number(res.dataset.i)];
    // a new result: « Filtrer les résultats » starts empty again (the filter was for the list left behind)
    finding = "";
    $<HTMLInputElement>("find-q").value = "";
    room = roomFor(snap, picked.subarea && english ? { ...picked, subarea: english.zoneFr.get(picked.subarea) ?? picked.subarea } : picked);
    zoneAsked = false; // the player chose what to see
    flipped.clear();
    // a boss's summon searched for: its boss's dungeon, with the summon unfolded
    if (room.dungeon && room.pinned !== undefined && !isOpen(room.pinned)) flipped.add(room.pinned);
    $<HTMLInputElement>("q").value = "";
    $("results").innerHTML = "";
    showRoom();
    return;
  }
  const guide = target.closest<HTMLAnchorElement>("a.guide");
  if (guide) {
    e.preventDefault();
    await openUrl(guide.href);
    return;
  }
  const travel = target.closest<HTMLElement>("#room .travel");
  if (travel) {
    // the player pastes it in the game chat himself: Dofight never types in the game
    // the button says « Copié » in place of its text for 2 s (or « Copie impossible »: the command is on screen)
    const ok = await navigator.clipboard.writeText(travel.dataset.copy ?? "").then(() => true, () => false);
    showCopied(travel, ok);
    return;
  }
  if (target.closest("#room .suggest")) {
    openReport(roomSubject());
    return;
  }
  const head = target.closest<HTMLElement>("#room .mh");
  if (head) {
    const mob = head.closest<HTMLElement>(".mob")!;
    const id = Number(mob.dataset.monster);
    // a boss's key summons fold and unfold with it (each one can still be folded on its own)
    const opening = !isOpen(id);
    for (const one of [id, ...(mob.dataset.summons?.split(",").map(Number) ?? [])]) {
      if (isOpen(one) !== opening) {
        if (flipped.has(one)) flipped.delete(one);
        else flipped.add(one);
      }
    }
    turned = id;
    showRoom();
    // the row was drawn again: the keyboard stays on it (Space folds it back)
    document.querySelector<HTMLElement>(`#room .mob[data-monster="${id}"] .mh`)?.focus({ preventScroll: true });
    return;
  }
});
$("q").addEventListener("input", showResults);
$("q").addEventListener("keydown", (e) => {
  const input = e.target as HTMLInputElement;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!results.length) return;
    e.preventDefault();
    active = (active + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length;
    markActive();
  } else if (e.key === "Enter" && results.length) {
    e.preventDefault();
    document.getElementById(`res-${active}`)?.click();
  } else if (e.key === "Escape" && input.value) {
    e.preventDefault();
    input.value = "";
    showResults();
  }
});
$("songe-reset").addEventListener("click", () => {
  songeRoom = null;
  songeSignature = "";
  room = null; // back to the empty list, waiting for a hovered group
  flipped.clear();
  showRoom();
  $("q").focus(); // the button is gone: the focus goes back to the search field
});
$("backzone").addEventListener("click", () => {
  zoneAsked = false;
  room = zoneRoom;
  flipped.clear();
  showRoom();
});
document.addEventListener("keydown", (e) => {
  const head = (e.target as HTMLElement).closest?.("#room .mh");
  if (head && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    (head as HTMLElement).click();
  }
});

// the floating icon: a click shows or hides the overlay, its menu can show it
void listen("panel:toggle", async () => ((await panelOpen()) ? hidePanel(true) : openByPlayer()));
void listen("panel:show", () => openByPlayer());

/* ---------- screen reading (from the Rust side, see screen.rs: on change, at most every 0.3 s) ---------- */

let director: DirectorState = initialState();
let visibleBeforeHide = false;

let status = initialStatus();
let lastHeaderLog = "";
/** The zone line, steadied so a single bad OCR frame never makes it blink (see screen/status.ts). */
function zoneStatus(kind: StatusKind, text = ""): void {
  status = steadyStatus(status, { kind, text }, Date.now());
  $("zone").textContent = statusText(status.shown);
  $("zone").classList.toggle("warn", statusWarns(status.shown));
  const closed = status.shown?.kind === "noDofus";
  if (closed !== dofusClosed) {
    dofusClosed = closed;
    $("guide-nodofus").hidden = !closed;
    if (!room && snap) showRoom();
  }
  showScan();
}

async function apply(actions: Action[]): Promise<void> {
  for (const a of actions) {
    if (a.type === "loadRoom") {
      diag("zone", `room loaded: ${a.room.title} (${a.room.monsters.length} monsters)`);
      zoneRoom = a.room;
      keepZone(a.room);
      if (settings.songe) zoneReadInSonge = true; // turning Songe off shows this zone, not the room shown before
      // in Songe mode the hovered group stays on screen until Songe is turned off
      // in Songe mode the list shows only the hovered groups (empty until one is hovered)
      if (settings.songe && (room === null || room === songeRoom)) {
        showRoom();
        continue;
      }
      room = a.room;
      flipped.clear();
      showRoom();
    } else if (a.type === "show") {
      diag("panel", "fight started: open");
      guideReturn = false; // in the settings from a guide link: their back arrow goes to the fight, not the guide
      if (!$("view-guide").hidden) closeGuide(false); // a fight wins over the guide; it comes back next launch
      await showOverlay();
    }
    else if (a.type === "hide") {
      diag("panel", "fight over: close");
      await hidePanel(false);
    } else if (a.type === "hideAll") {
      diag("panel", "Dofus not in front: minimised");
      dofusAway = true;
      hidePeek();
      visibleBeforeHide = await panelOpen();
      await invoke("panel_show", { mode: "min" }); // the taskbar button stays
      await placePreview();
    } else if (a.type === "restoreAll") {
      diag("panel", "Dofus back in front: restored");
      dofusAway = false;
      await invoke("panel_show", { mode: visibleBeforeHide ? "open" : "min" });
      await placePreview();
    }
  }
}

/** The zone a map header points to (an English client's names too). */
function roomOfHeader(s: Snapshot, header: NonNullable<ReturnType<typeof parseHeader>>): Room | null {
  const englishFound = readEnglish && english ? locate(readEnglish, header) : null;
  return locate(s, header) ?? (englishFound && english ? frenchRoom(s, english, englishFound) : null);
}

/* « Scanner ma sous-zone »: with « Lecture de l'écran » off, one reading of the corner on demand (screen.rs). */
let scanning: { rooms: (Room | null)[]; headers: boolean[]; timer: number } | null = null;
/** The last scan's result, as a text key (shown in the current language); `warn` for a failure. */
let scanMessage: { key: Key; warn: boolean } | null = null;
function showScan(): void {
  // the zone not followed (the reading off, or on with its zone option off): one reading on demand
  const hidden = (settings.reading && settings.fromHeader) || dofusClosed || !snap;
  $("scan").hidden = hidden;
  // « Lecture de l'écran coupée » would say the same as the button and the list: the scan row stands for it
  $("zone").hidden = !hidden && status.shown?.kind === "off";
  const go = $("scan-go") as HTMLButtonElement;
  go.disabled = scanning !== null;
  go.textContent = t(scanning ? "scan.busy" : "scan.button");
  go.title = t("scan.title");
  const message = scanning || !scanMessage ? "" : t(scanMessage.key);
  $("scan-msg").textContent = message;
  $("scan").classList.toggle("warn", !!message && !!scanMessage?.warn);
}
function endScan(key: Key | null, warn = true): void {
  if (scanning) window.clearTimeout(scanning.timer);
  scanning = null;
  scanMessage = key ? { key, warn } : null;
  showScan();
}
$("scan-go").addEventListener("click", async () => {
  if (scanning || (settings.reading && settings.fromHeader)) return;
  diag("zone", "scan asked by the player");
  scanning = { rooms: [], headers: [], timer: window.setTimeout(() => endScan("scan.notFront"), 4000) };
  scanMessage = null;
  showScan();
  const front = await invoke<boolean>("scan_now").catch(() => false);
  if (!front) endScan("scan.notFront");
});
void listen<{ lines: OcrLine[]; bar: BarState | null; error: string | null; left: number }>("screen:scan", ({ payload }) => {
  if (!scanning || !snap) return;
  if (payload.error) {
    diag("zone", `scan: ${payload.error}`);
    return endScan(payload.error === "no-ocr" ? "status.noOcr" : payload.error === "not-front" ? "scan.notFront" : "scan.failed");
  }
  const header = payload.lines.length ? parseHeader(payload.lines) : null;
  scanning.headers.push(!!header);
  scanning.rooms.push(header ? roomOfHeader(snap, header) : null);
  if (payload.left > 0) return;
  const out = scanOutcome(scanning.rooms, scanning.headers);
  if ("room" in out) {
    diag("zone", `scan: ${out.room.title}`);
    zoneRoom = out.room;
    keepZone(out.room);
    director = { ...director, lastRoomTitle: out.room.title };
    room = out.room;
    flipped.clear();
    endScan(null);
    showRoom();
  } else {
    diag("zone", `scan: nothing kept (${out.problem})`);
    endScan(out.problem === "noHeader" ? "status.noHeader" : out.problem === "unknown" ? "scan.unknown" : "scan.failed");
  }
});

void listen<{ front: boolean; lines: OcrLine[]; error: string | null; bar: BarState | null }>("screen:tick", async ({ payload }) => {
  if (payload.error === "no-dofus") return zoneStatus("noDofus", t("status.noDofus"));
  if (payload.error === "no-ocr") {
    $("guide-ocr").hidden = false;
    return zoneStatus("noOcr", t("status.noOcr"));
  }
  // macOS: « Enregistrement de l'écran » not granted yet (the system asked once)
  if (payload.error === "no-permission") {
    $("guide-permission").hidden = false;
    return zoneStatus("noPermission", t("status.noPermission"));
  }
  if (payload.error === "off") {
    // nothing captured: the switch is off, or on with nothing using it (then nothing to say); a tick sent before
    // the reader heard the switch turned on says nothing either
    if (!settings.reading) zoneStatus("off", t("status.readingOff"));
    if (!snap) return;
    // nothing looked at: Dofus counts as in front, so a panel hidden by « Masquer hors du jeu » comes back
    const out = step(director, { front: true, room: null, fight: "none", seen: false, at: Date.now() }, settings);
    director = out.state;
    return apply(out.actions);
  }
  if (!snap) return;
  const header = payload.front && payload.lines.length ? parseHeader(payload.lines) : null;
  const fight = payload.front ? readFight(payload.bar, director.inFight) : "none";
  // automatic Songe mode: on inside a Songe (its header says « Palier » / « Profondeur »); once the player has left it
  // (a shortcut brings him back where he was), off as soon as a map with coordinates shows again, whoever turned it on
  const dreaming = payload.front && payload.lines.length > 0 && inDream(payload.lines);
  if (dreaming) leftDream = false;
  if (payload.front && payload.lines.length && dreaming !== wasDreaming) {
    diag("songe", dreaming ? "inside a Songe (Palier / Profondeur in the header)" : "Songe header gone");
    if (!dreaming) leftDream = true;
    wasDreaming = dreaming;
  }
  if (settings.autoSonge && payload.front && payload.lines.length) {
    if (dreaming && !settings.songe) setSonge(true, "dofight");
    else if (leftDream && header?.x != null) {
      leftDream = false; // a normal map: the player is out of the Songe
      if (settings.songe) setSonge(false, "dofight");
    }
  }
  const found = header ? roomOfHeader(snap, header) : null;
  if (header && zoneSearch !== "idle") searchSawHeader = true;
  // a cut or unknown zone name (an animated map, the world map hovered): read again at once, a few times, rather than
  // waiting for the header to change
  // (a place with no monster, a village, stays unknown: 4 tries per header, then the usual pace)
  if (found) missedReads = 0;
  else if (payload.front && settings.fromHeader && header && !dreaming) {
    if (header.title !== missedTitle) missedReads = 0;
    missedTitle = header.title;
    if (missedReads < 4) {
      missedReads++;
      void invoke("read_again");
    }
  }
  if (zoneAsked && found && !settings.songe) {
    zoneAsked = false;
    // a changed zone replaces the one shown; the same zone leaves the rows as the player left them
    if (found.title !== zoneRoom?.title) {
      diag("zone", `read after Songe: ${found.title}`);
      zoneRoom = found;
      keepZone(found);
      director = { ...director, lastRoomTitle: found.title };
      if (room === null || room.title !== found.title) room = found;
      flipped.clear();
      showRoom();
    }
  }
  if (payload.front && header?.x != null) guideSeen("coords");
  if (payload.front && (payload.bar === "calm" || payload.bar === "fight")) guideSeen("bar");
  if (payload.front && payload.lines.length) {
    if (dreaming) zoneStatus("found", ""); // inside a Songe: no zone to read, nothing to say
    else if (zoneSearch === "searching" && !found) zoneStatus("searching", t("status.fightSearching"));
    // missed: no header ever read points to the coordinates option, else the fight covered the name
    else if (zoneSearch === "missed" && !found && !searchSawHeader && !header) zoneStatus("noHeader", t("status.noHeader"));
    else if (zoneSearch === "missed" && !found) zoneStatus("searching", t("status.fightMissed"));
    else if (!header) zoneStatus("noHeader", t("status.noHeader"));
    else if (found) zoneStatus("found", found.title);
    else if (!header.cut) zoneStatus("unknown", header.title);
  }
  if (payload.front && payload.lines.length) {
    lastReading = { zoneRead: header?.title ?? null, located: found?.title ?? null, fight, front: true };
    // the zone header as read (the cleaned title only) and what it matched, when it changes
    // what the zone header matched, once per change (out of a fight: in a fight it is not used); the title read is
    // written only when it matched nothing, the first time (garbled titles differ at every reading)
    if (!director.inFight) {
      const what = found ? `zone header → ${found.title}` : header ? "zone header not recognised" : "no zone header found";
      // each different misreading is written (it is what shows why a zone was missed)
      const line = !found && header ? `${what}: « ${header.title} »${header.x != null ? ` (${header.x}, ${header.y})` : ""}` : what;
      if (line !== lastHeaderLog) diag("zone", line);
      lastHeaderLog = line;
    }
  } else if (lastReading) lastReading = { ...lastReading, front: payload.front };
  // Dofight itself in front: the game was not read this tick (no lines), which must not end a fight
  const out = step(director, { front: payload.front, room: found, fight, seen: payload.lines.length > 0, at: Date.now() }, settings);
  // in a fight the screen is read less often and Songe sleeps (screen.rs)
  if (out.state.inFight !== director.inFight) {
    void invoke("set_in_fight", { on: out.state.inFight });
    diag("fight", `${out.state.inFight ? "fight started" : "fight over"} (icon bar: ${payload.bar ?? "none"}, read: ${fight})`);
  }
  director = out.state;
  await apply(out.actions);
  updateSearch();
});

// « Songe » mode: the group tooltips read around the resting mouse (out of a fight only)
void listen<OcrLine[]>("screen:songe", ({ payload }) => songeTick(payload));

async function fillReferenceWindows(): Promise<void> {
  const titles = await invoke<string[]>("list_dofus_windows").catch(() => [] as string[]);
  const names = titles.map((t) => t.split(" - ")[0]);
  const current = settings.referenceWindow ?? "";
  const options = [`<option value="">${esc(t("settings.referenceFirst"))}</option>`, ...names.map((n) => `<option value="${esc(n)}"${n === current ? " selected" : ""}>${esc(n)}</option>`)];
  if (current && !names.includes(current)) options.push(`<option value="${esc(current)}" selected>${esc(t("settings.referenceClosed", { name: current }))}</option>`);
  $("reference").innerHTML = options.join("");
}
$("reference").addEventListener("change", (e) => {
  const value = (e.target as HTMLSelectElement).value || null;
  update({ referenceWindow: value });
  void invoke("set_reference", { prefix: value ?? "" });
});
void invoke("set_reference", { prefix: settings.referenceWindow ?? "" });
void invoke("set_songe", { on: settings.songe });
void invoke("set_reading", { on: capturingGame(settings) });
showSongeState();
// the panel lives in the taskbar (its button « Dofight » always stays there) and opens at launch
void showOverlay();
// the × of the title bar and « Fermer la fenêtre » on the taskbar button quit at once, every window included; not
// while an update downloads or installs (its bar shows): a portable exe swapped halfway would be lost
const quit = () => {
  if (!$("update").hidden && !$("update-bar").hidden) return;
  void invoke("quit");
};
$("quit").addEventListener("click", quit);
void win.onCloseRequested((e) => {
  e.preventDefault();
  quit();
});

let geometryTimer: number | undefined;
const saveSoon = () => {
  void placePreview(false); // the example sticks to the panel while it moves or is resized
  clearTimeout(geometryTimer);
  geometryTimer = window.setTimeout(saveGeometry, 400);
};
// saveSoon places the example again too: it keeps the panel's size, beside it
void win.onResized(saveSoon);
void win.onMoved(saveSoon);

$<HTMLImageElement>("logo").src = logo;
// locked (the padlock next to the menu): no move by dragging, no resize by the edges
enableDragAnywhere(() => (settings.locked ? Promise.resolve() : win.startDragging()));
function showLock(): void {
  void win.setResizable(!settings.locked);
  const lock = $("lock");
  lock.setAttribute("aria-pressed", String(settings.locked));
  lock.dataset.icon = settings.locked ? "lock" : "unlock";
  lock.innerHTML = icon(settings.locked ? "lock" : "unlock");
  const key = settings.locked ? "app.unlock" : "app.lock";
  lock.dataset.i18nTitle = lock.dataset.i18nAria = key; // a language switch keeps the right text
  const label = t(key);
  lock.title = label;
  lock.setAttribute("aria-label", label);
}
$("lock").addEventListener("click", () => update({ locked: !settings.locked }));
showLock();
applyLook();

/** The update covers the whole panel (below the title bar, which still moves or hides it) until Dofight restarts: the
 * player waits instead of using a version about to go. A failure lets them go on with « Continuer ». */
function showUpdate(text: string, done?: number | null): void {
  $("update").hidden = false;
  for (const id of ["view-main", "view-settings", "view-report", "view-guide"]) $(id).inert = true;
  $("update-text").textContent = text;
  diagOnChange("update", "update", text);
  const bar = $<HTMLProgressElement>("update-bar");
  bar.hidden = done === undefined; // a failure: text only
  if (done === null) bar.removeAttribute("value"); // size unknown: an indeterminate bar
  else if (done !== undefined) bar.value = done;
  $("update-pct").textContent = typeof done === "number" && done < 1 ? t("update.percent", { percent: Math.round(done * 100) }) : "";
  $("update-continue").hidden = done !== undefined;
}
$<HTMLImageElement>("update-logo").src = logo;
$("update-continue").addEventListener("click", () => {
  $("update").hidden = true;
  for (const id of ["view-main", "view-settings", "view-report", "view-guide"]) $(id).inert = false;
});
// the installed Dofight updates through the installer; a copy kept elsewhere (Desktop) replaces its own exe
void invoke<string>("update_kind")
  .catch(() => "installer")
  .then((kind) => {
    const channel = (onEvent: (e: DownloadEvent) => void) => {
      const c = new Channel<DownloadEvent>();
      c.onmessage = onEvent;
      return c;
    };
    const portable = kind === "portable";
    return autoUpdate({
      check: portable ? portableCheck(invoke, channel) : check,
      relaunch: portable ? async () => {} : relaunch, // the portable copy restarts from Rust, at its own path
      show: showUpdate,
    });
  });
loadSnapshot(fetchFromApp)
  .then(async (s) => {
    snap = s;
    // reloaded (Ctrl+R): the zone shown before comes back at once, even mid-fight; not with the zone unfollowed
    // (« Lecture de l'écran » or its zone option off: the list says why it is empty)
    const kept = zoneRoom || !settings.reading || !settings.fromHeader ? null : restoreRoom(s, keptZone());
    if (kept) {
      diag("zone", `zone kept across a reload: ${kept.title}`);
      zoneRoom = kept;
      if (!room) room = kept;
      director = { ...director, lastRoomTitle: kept.title };
    }
    await refreshView();
    void ensureEnglish(); // an English client is read with the English names (in the background)
    $("status").textContent = "";
    showResults();
    showRoom();
    if (!$("view-guide").hidden) startTour(); // opened before the data: its sample can be drawn now
  })
  .catch((err) => {
    diag("data", `game data not loaded: ${String(err)}`);
    $("status").textContent = t("main.dataMissing"); // the technical error is in the diagnostic log
    dataFailed = true;
    if (!$("view-guide").hidden) startTour();
  });
