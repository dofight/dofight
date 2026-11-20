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
  tourTarget = target;
  requestAnimationFrame(placeTip);
});

// the element the bubble points at; the bubble is placed again whenever the sample's layout moves (a portrait or an
// icon loaded, the fonts, the window sized: owner, 2026-11-20, bubbles a few pixels off)
let tourTarget: HTMLElement | null = null;
const GAP = 14; // between the element and the bubble: the arrow (7 px out of it) stops short of the gold ring (4 px)
/** Beside the element, in the sample's coordinates: below it when there is room on screen, else above; on the game's
 * corner, under the whole picture (its other parts stay visible), the arrow still on the ringed part. */
function placeTip(): void {
  const box = document.getElementById("preview")!;
  const tip = box.querySelector<HTMLElement>(".tour-tip");
  if (!tourTarget || !tip || !box.contains(tourTarget)) return;
  const b = box.getBoundingClientRect();
  const shot = tourTarget.closest(".corner-shot")?.getBoundingClientRect();
  const t = tourTarget.getBoundingClientRect();
  const r = shot ? { top: shot.top, bottom: shot.bottom, left: t.left, width: t.width } : t;
  const below = r.bottom + tip.offsetHeight + GAP + 6 <= window.innerHeight;
  tip.classList.toggle("below", below);
  tip.classList.toggle("above", !below);
  tip.style.top = `${below ? r.bottom - b.top + GAP : r.top - b.top - tip.offsetHeight - GAP}px`;
  // the arrow (10 px wide) under the element's middle, as far as the bubble's edges allow
  const middle = r.left + r.width / 2 - tip.getBoundingClientRect().left;
  tip.style.setProperty("--arrow", `${Math.round(Math.max(4, Math.min(middle - 5, tip.offsetWidth - 14)))}px`);
}
const tourBox = document.getElementById("preview")!;
new ResizeObserver(() => requestAnimationFrame(placeTip)).observe(tourBox);
tourBox.addEventListener("load", () => requestAnimationFrame(placeTip), true); // an image in the sample
window.addEventListener("resize", () => requestAnimationFrame(placeTip));
void document.fonts.ready.then(() => requestAnimationFrame(placeTip));

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
