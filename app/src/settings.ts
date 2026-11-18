import type { Lang } from "./i18n";
import type { Display } from "./types";

export type Settings = Display & {
  showSpecial: boolean;
  showArch: boolean;
  showWanted: boolean;
  showEvent: boolean;
  /** Songe mode on by itself inside a Songe, off again when leaving it. */
  autoSonge: boolean;
  /** Global shortcut that shows or hides the overlay (see shortcut.ts). */
  shortcut: string;
  /** « Songe » mode: show the monster groups hovered on the map (toggle next to the search bar). */
  songe: boolean;
  /** Open the overlay when a fight starts and close it at its end (one option, off by default). */
  autoFight: boolean;
  hideWhenAway: boolean; // hide Dofight while Dofus is not in front
  fromHeader: boolean;
  preview: boolean;
  expandAll: boolean;
  /** Hovering a folded monster shows its badges and summary beside the panel. */
  hoverPeek: boolean;
  opacity: number;
  /** Text size in %, one of TEXT_SIZES: the whole panel and its side windows are zoomed. */
  textSize: number;
  theme: string; // see theme.ts
  /** Interface language (French by default). */
  lang: Lang;
  referenceWindow: string | null;
};

export const KEY = "dofight.settings";
export const OPACITY_MIN = 0; // the player may go fully see-through (the top bar stays opaque)
export const TEXT_SIZES = [90, 100, 110];

export const DEFAULTS: Settings = {
  autoFight: true,
  hideWhenAway: false,
  fromHeader: true,
  preview: true, // the example beside the settings: shown until the player turns it off (then remembered)
  expandAll: false,
  hoverPeek: true,
  roomSummary: true,
  thumbnails: true,
  tagsDanger: true,
  tagsTip: true,
  tagsMechanic: true,
  resistances: true,
  spells: true,
  spellBadges: true,
  details: true,
  showSpecial: false,
  showArch: false,
  showWanted: true,
  showEvent: false,
  autoSonge: true,
  shortcut: "Ctrl+Shift+KeyD",
  songe: false,
  opacity: 1,
  textSize: 100,
  theme: "default",
  lang: "fr",
  referenceWindow: null,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function loadSettings(store: Pick<Storage, "getItem">): Settings {
  let saved: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) saved = parsed;
  } catch {
    saved = {};
  }
  // « monstres de quête » became « monstres spéciaux » (v0.7.0): keep the player's choice
  if (saved.showSpecial === undefined && saved.showQuest !== undefined) saved.showSpecial = saved.showQuest;
  const out: Settings = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const value = saved[key];
    const def = DEFAULTS[key];
    if (key === "referenceWindow") {
      if (value === null || typeof value === "string") out.referenceWindow = value;
    } else if (key === "lang") {
      if (value === "fr" || value === "en") out.lang = value;
    } else if (typeof value === typeof def && (typeof value !== "number" || Number.isFinite(value))) {
      (out as unknown as Record<string, unknown>)[key] = value;
    }
  }
  out.opacity = clamp(out.opacity, OPACITY_MIN, 1);
  // the nearest of the sizes offered
  out.textSize = TEXT_SIZES.reduce((best, size) => (Math.abs(size - out.textSize) < Math.abs(best - out.textSize) ? size : best));
  return out;
}

export function saveSettings(store: Pick<Storage, "setItem">, s: Settings): void {
  store.setItem(KEY, JSON.stringify(s));
}

/** Re-reads what is saved now, applies `patch`, saves and returns the result (several windows share the store). */
export function updateSettings(store: Pick<Storage, "getItem" | "setItem">, patch: Partial<Settings>): Settings {
  const current = loadSettings(store);
  const next = loadSettings({ getItem: () => JSON.stringify({ ...current, ...patch }) });
  saveSettings(store, next);
  return next;
}
