/** Colour themes, the same as the Dofus 3 interface themes (and Ganymède's list): each one has a base colour (the
 * banner of the theme card in the game) and an accent (the dot). The overlay's dark shades are derived from the base so
 * every window keeps enough contrast; « Défaut » is Dofight's own slate and gold. */

import { t } from "./i18n";

export interface Theme {
  id: string;
  name: string;
  base: string; // hex
  accent: string; // hex
}

export const THEMES: Theme[] = [
  { id: "default", name: "Défaut", base: "#21303c", accent: "#e3b54f" },
  { id: "standard", name: "Standard", base: "#5d5f86", accent: "#e6f24a" },
  { id: "bonta", name: "Bonta", base: "#4d68a6", accent: "#ffc88f" },
  { id: "brakmar", name: "Brâkmar", base: "#a8303f", accent: "#ffc88f" },
  { id: "tribute", name: "Tribute", base: "#6d6d6d", accent: "#c7ec6a" },
  { id: "gold", name: "Gold", base: "#9c6a43", accent: "#ffc88f" },
  { id: "belladone", name: "Belladone", base: "#7d6a8f", accent: "#dbf07a" },
  { id: "unicorn", name: "Unicorn", base: "#a2508f", accent: "#ff9fe3" },
  { id: "emerald", name: "Emerald", base: "#3d7884", accent: "#8ff5cf" },
  { id: "sufokia", name: "Sufokia", base: "#3a8f8a", accent: "#ffe98a" },
  { id: "pandala", name: "Pandala", base: "#5f8a3c", accent: "#ffe98a" },
  { id: "wabbit", name: "Wabbit", base: "#d0613a", accent: "#c7ec6a" },
];

export const themeById = (id: string): Theme => THEMES.find((x) => x.id === id) ?? THEMES[0];

/** The name shown to the player: « Défaut » is translated, the Dofus theme names stay as the game writes them. */
export const themeName = (theme: Theme): string => (theme.id === "default" ? t("theme.default") : theme.name);

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
}

/** The base colour at a given lightness, saturation capped so dark shades stay calm. */
function shade(base: string, lightness: number): [number, number, number] {
  const [h, s] = hexToHsl(base);
  return hslToRgb(h, Math.min(s, 0.35), lightness);
}

const hex = (rgb: [number, number, number]) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** The CSS variables of a theme (only the ones the themes change; badge and element colours stay). */
export function themeVars(id: string): Record<string, string> {
  if (themeById(id).id === "default") {
    // Ganymède's own colours (sampled from it), so the two windows side by side look alike
    return { "--win": "30,40,49", "--bar": "62,70,80", "--bg": "#3e4650", "--card": "#21303c", "--line": "#3a4856", "--gold": "#e3b54f", "--gold-soft": "rgba(227,181,79,.16)", "--yellow": "#f2d54b" };
  }
  const t = themeById(id);
  const n = parseInt(t.accent.slice(1), 16);
  return {
    "--win": shade(t.base, 0.1).join(","),
    "--bar": shade(t.base, 0.2).join(","),
    "--bg": hex(shade(t.base, 0.13)),
    "--card": hex(shade(t.base, 0.19)),
    "--line": hex(shade(t.base, 0.29)),
    "--gold": t.accent,
    "--gold-soft": `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},.16)`,
    "--yellow": t.accent,
  };
}

/** The text size (in %, see settings.ts): the whole page is zoomed, its icons and spacing with the text (styles.css:
 * `html { zoom: var(--zoom) }`). */
export function applyTextSize(root: HTMLElement, size: number): void {
  root.style.setProperty("--zoom", String(size / 100));
}

/** The window's height in the zoomed page's own CSS pixels: the most a sheet may take before it scrolls inside
 * (styles.css `--view-h`). `100vh / zoom` held on Windows only: WebKit's `100vh` is already in the zoomed page's
 * pixels, so the Mac divided by the zoom twice, and at 110 % a pinned sheet was capped 34 px short of its window, its
 * last line scrolled away (owner's Mac, 2026-11-28: a 408-point window, its sheet capped at 337 × 1.1). The window's
 * `innerHeight` is the same in both engines. */
export function viewHeight(windowHeight: number, zoom: number): number {
  return windowHeight / (zoom > 0 ? zoom : 1);
}

/** Sets `--view-h` on `root` for the window it is in now; again after a resize or a text size change. */
export function applyViewHeight(root: HTMLElement, windowHeight: number): void {
  const zoom = Number(root.style.getPropertyValue("--zoom")) || 1;
  root.style.setProperty("--view-h", `${viewHeight(windowHeight, zoom)}px`);
}

/** What a getBoundingClientRect length is multiplied by to be in the window's own pixels, under that zoom. The two
 * engines disagree: WebView2 (Windows) counts the zoom, WebKit (the Mac) gives the unzoomed length, so at 90 % a
 * spell's sheet said 420 where 378 was drawn and its window stood 42 px off the panel (owner, 2026-11-26). Asked of
 * an element 100 px wide rather than of the platform. */
export function drawnScale(doc: Document): number {
  const zoom = Number(doc.documentElement.style.getPropertyValue("--zoom")) || 1;
  const probe = doc.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;width:100px;height:0";
  doc.body.append(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width > 0 ? (zoom * 100) / width : 1;
}

export function applyTheme(root: HTMLElement, id: string): void {
  for (const [k, v] of Object.entries(themeVars(id))) root.style.setProperty(k, v);
  root.dataset.theme = themeById(id).id;
}
