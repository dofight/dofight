import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setLang, t } from "./i18n";
import { icon } from "./render/icons";
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

// a pinned sheet pressed then moved (not on a button or a link): it comes off the panel and follows the pointer
const DRAG_MIN = 4; // px moved before a press is a drag (a plain click stays a click)
let press: { x: number; y: number } | null = null;
document.addEventListener("pointerdown", (e) => {
  const box = document.getElementById("peek")!;
  press = e.button === 0 && box.classList.contains("pinned") && !(e.target as Element).closest("button, a") ? { x: e.screenX, y: e.screenY } : null;
});
document.addEventListener("pointerup", () => (press = null));
document.addEventListener("pointermove", (e) => {
  if (!press || !(e.buttons & 1) || Math.hypot(e.screenX - press.x, e.screenY - press.y) < DRAG_MIN) return;
  press = null;
  if (!detached) {
    detached = true;
    void emit("peek:detach", { label });
    const close = document.querySelector<HTMLElement>(".peek-close");
    close?.setAttribute("title", t("peek.closeDetached")); // Escape no longer closes it
    close?.setAttribute("aria-label", t("peek.closeDetached"));
  }
  void getCurrentWindow().startDragging();
});

// the panel copied it (or could not): the sheet says so
void listen<{ command: string; ok: boolean; to: string }>("peek:copied", ({ payload }) => {
  if (payload.to === label) sheetCopied(document, payload.command, payload.ok);
});

void listen<{ token: number; html: string; pinned?: boolean; to: string }>("peek:render", ({ payload }) => {
  if (payload.to !== label || detached) return;
  const box = document.getElementById("peek")!;
  // a pinned sheet (clicked, or « Comment y aller ») can be closed from here; a hover preview goes with the pointer
  const close = payload.pinned
    ? `<button type="button" class="peek-close" title="${t("peek.close")}" aria-label="${t("peek.close")}">${icon("close")}</button>`
    : "";
  box.innerHTML = close + payload.html;
  box.classList.toggle("pinned", !!payload.pinned);
  // wait for the layout (and the badge icons, which have a fixed size) before measuring
  requestAnimationFrame(() => void emit("peek:size", { token: payload.token, height: Math.ceil(box.getBoundingClientRect().height), label }));
});

// a side window made after a detach: the panel waits for this before sending it a sheet
void emit("peek:ready", { label });
