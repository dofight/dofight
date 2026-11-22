import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setLang, t } from "./i18n";
import { copyableSelection } from "./selection";
import { sheetBar, startsSheetDrag } from "./render/sheetBar";
import { showToast } from "./render/toast";
import { sheetCopied, sheetCopy } from "./render/accessSheet";
import { KEY, loadSettings } from "./settings";
import { applyTextSize, applyTheme } from "./theme";

// The side window beside the panel: a folded monster's badges and summary (see renderPeek), or a sheet the player
// pinned. It only shows what the panel sends, then tells the panel its height so the panel can size and place it. A
// pinned sheet dragged away is detached (owner, 2026-11-20): this window stays where it is dropped, until its ✕, and
// the panel makes another side window for the next sheet. There are several of these windows (« peek », « peek-1 »…):
// every event says which one it is from or for.

const label = getCurrentWindow().label;
let detached = false;

// the same theme and text size as the panel
const syncTheme = () => {
  const settings = loadSettings(localStorage);
  applyTheme(document.documentElement, settings.theme);
  applyTextSize(document.documentElement, settings.textSize);
  setLang(settings.lang); // the « copied » line of a sheet, in the interface language
};
syncTheme();
window.addEventListener("storage", (e) => e.key === KEY && syncTheme());

// a pinned mechanic's sheet links to its guide: the panel opens it (this window only sends events)
document.addEventListener("click", (e) => {
  if ((e.target as Element).closest(".peek-close")) return void emit("peek:close", { label });
  // « Comment y aller »: a command to copy goes to the panel, which owns the clipboard
  if (sheetCopy(e.target as Element, (command) => void emit("peek:copy", { command, label }))) return;
  const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.guide, a.quest");
  if (!link) return;
  e.preventDefault();
  void emit("peek:open", link.href);
});

// text selected in the sheet (its title too): the panel copies it, this window cannot take the focus
document.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return;
  const text = copyableSelection(window.getSelection(), document.getElementById("peek")!);
  if (text) void emit("peek:copytext", { text, label });
});
void listen<{ ok: boolean; to: string }>("peek:textcopied", ({ payload }) => {
  if (payload.to === label) showToast(document, payload.ok);
});

// a pinned sheet pressed on its bar then moved: it comes off the panel and follows the pointer (the rest of the sheet
// selects its text)
const DRAG_MIN = 4; // px moved before a press is a drag (a plain click stays a click)
let press: { x: number; y: number } | null = null;
document.addEventListener("pointerdown", (e) => {
  const box = document.getElementById("peek")!;
  press = e.button === 0 && box.classList.contains("pinned") && startsSheetDrag(e.target as Element) ? { x: e.screenX, y: e.screenY } : null;
});
document.addEventListener("pointerup", () => (press = null));
document.addEventListener("pointermove", (e) => {
  if (!press || !(e.buttons & 1) || Math.hypot(e.screenX - press.x, e.screenY - press.y) < DRAG_MIN) return;
  press = null;
  if (!detached) {
    detached = true;
    void emit("peek:detach", { label });
    // the player's own window now: a click on it gives it the focus (owner, 2026-11-20), so Escape closes it. On
    // macOS the panel conversion also has to be told, or it keeps refusing the keyboard (platform::detached_side).
    void getCurrentWindow().setFocusable(true);
    void invoke("side_detached", { label });
    const close = document.querySelector<HTMLElement>(".peek-close");
    close?.setAttribute("title", t("peek.closeDetached"));
    close?.setAttribute("aria-label", t("peek.closeDetached"));
  }
  void getCurrentWindow().startDragging();
});

// a detached sheet with the focus: Escape closes it, as its ✕ does
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && detached) void emit("peek:close", { label });
});

// the panel copied it (or could not): the sheet says so
void listen<{ command: string; ok: boolean; to: string }>("peek:copied", ({ payload }) => {
  if (payload.to === label) sheetCopied(document, payload.command, payload.ok);
});

void listen<{ token: number; html: string; pinned?: boolean; to: string }>("peek:render", ({ payload }) => {
  if (payload.to !== label || detached) return;
  const box = document.getElementById("peek")!;
  // a pinned sheet (clicked, or « Comment y aller ») has its bar: moved and closed from there; a hover preview goes
  // with the pointer
  box.innerHTML = payload.html;
  // inside the sheet's own box (its border), above its title
  (box.firstElementChild ?? box).insertAdjacentHTML("afterbegin", sheetBar(!!payload.pinned));
  box.classList.toggle("pinned", !!payload.pinned);
  // measured here and not in a requestAnimationFrame: this window is still hidden, and a hidden window runs no
  // frames on macOS, so the panel never got the height and never showed the sheet. getBoundingClientRect forces
  // the layout on its own, and the badge icons have a fixed size, so nothing is left to wait for.
  void emit("peek:size", { token: payload.token, height: Math.ceil(box.getBoundingClientRect().height), label });
});

// a side window made after a detach: the panel waits for this before sending it a sheet
void emit("peek:ready", { label });
