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
  const box = document.getElementById("preview")!;
  box.classList.remove("touring");
  tourHtml = "";
  box.innerHTML = payload.html;
});

// the guide's tour: the sample once, then one element ringed in gold at a time, its bubble pointing at it
let tourHtml = "";
void listen<{ label: string; html: string; sel: string; text: string }>("preview:tour", async ({ payload }) => {
  document.getElementById("label")!.textContent = payload.label;
  const box = document.getElementById("preview")!;
  if (payload.html !== tourHtml) {
    tourHtml = payload.html;
    box.innerHTML = `${payload.html}<div class="tour-tip"></div>`;
    box.classList.add("touring");
  }
  box.querySelectorAll(".tour-on").forEach((el) => el.classList.remove("tour-on"));
  // one or several elements ringed (the open card: its resistances and its spells); the bubble points at the last
  const targets = [...box.querySelectorAll<HTMLElement>(payload.sel)];
  const tip = box.querySelector<HTMLElement>(".tour-tip")!;
  tip.textContent = payload.text;
  if (!targets.length) return;
  targets.forEach((el) => el.classList.add("tour-on"));
  const target = targets[targets.length - 1];
  // the game's corner: its picture must be drawn before the ring and the bubble can be placed (a failed load too)
  const img = box.querySelector("img");
  if (img && !img.complete) await new Promise((done) => {
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
  target.scrollIntoView({ block: "center" });
  // beside the element, in the sample's coordinates: below it when there is room on screen, else above; on the game's
  // corner, under the whole picture (its other parts stay visible), the arrow still on the ringed part
  requestAnimationFrame(() => {
    const b = box.getBoundingClientRect();
    const shot = target.closest(".corner-shot")?.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const r = shot ? { top: shot.top, bottom: shot.bottom, left: t.left, width: t.width } : t;
    const below = r.bottom + tip.offsetHeight + 16 <= window.innerHeight;
    tip.classList.toggle("below", below);
    tip.classList.toggle("above", !below);
    tip.style.top = `${below ? r.bottom - b.top + 10 : r.top - b.top - tip.offsetHeight - 10}px`;
    tip.style.setProperty("--arrow", `${Math.max(10, Math.min(r.left + r.width / 2 - b.left - 13, b.width - 34))}px`);
  });
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
