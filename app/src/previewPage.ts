import { emit, listen } from "@tauri-apps/api/event";
import { applyI18n, setLang } from "./i18n";
import { KEY, loadSettings } from "./settings";
import { applyTextSize, applyTheme } from "./theme";

// same theme as the overlay; follows it when the player picks another one (settings live in the shared storage)
// same look as the overlay: theme and background opacity
const syncTheme = () => {
  const settings = loadSettings(localStorage);
  applyTheme(document.documentElement, settings.theme);
  document.documentElement.style.setProperty("--alpha", String(settings.opacity));
  applyTextSize(document.documentElement, settings.textSize);
  setLang(settings.lang); // the window title follows the interface language (the overlay sends the rest translated)
  applyI18n(document);
};
syncTheme();
window.addEventListener("storage", (e) => e.key === KEY && syncTheme());

// the overlay sends the rendered room each time a setting changes
void listen<{ label: string; html: string }>("preview:render", ({ payload }) => {
  document.getElementById("label")!.textContent = payload.label;
  document.getElementById("preview")!.innerHTML = payload.html;
});

// a folded row hovered here shows the same badge preview as in the panel (the panel places it); the example only
// shows, so clicks do nothing
const preview = document.getElementById("preview")!;
let hovered: HTMLElement | null = null;
let timer: number | undefined;
let shown = false;
const leave = () => {
  window.clearTimeout(timer);
  hovered = null;
  if (shown) void emit("preview:peek", null);
  shown = false;
};
preview.addEventListener("pointerover", (e) => {
  // a mechanic's chip, a spell of an open monster (their sheets), or a folded monster
  const target = e.target as HTMLElement;
  const row = target.closest<HTMLElement>(".mech") ?? target.closest<HTMLElement>(".sp") ?? target.closest<HTMLElement>('.mob[data-open="false"]');
  if (row === hovered) return;
  leave();
  if (!row) return;
  hovered = row;
  timer = window.setTimeout(() => {
    shown = true;
    const top = row.getBoundingClientRect().top;
    void emit("preview:peek", row.dataset.mechanic ? { mechanic: row.dataset.mechanic, top } : row.dataset.spell ? { spell: Number(row.dataset.spell), top } : { id: Number(row.dataset.monster), top });
  }, 250);
});
preview.addEventListener("pointerleave", leave);
document.addEventListener("scroll", leave, true);
preview.addEventListener("click", (e) => e.preventDefault(), true);
