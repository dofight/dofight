/** The global shortcut that shows or hides the overlay: stored as the plugin reads it ("Ctrl+Shift+KeyD"), shown to
 * the player in the interface language ("Ctrl + Maj + D", "Ctrl + Shift + D"). */

import { getPlatform, t } from "./i18n";

export const DEFAULT_SHORTCUT = "Ctrl+Shift+KeyD"; // D for Dofight
/** Inside Dofight only, never global (owner, 2026-11-25: nothing opens Dofight but the show-or-hide shortcut, so
 * Dofight never takes the keyboard from the game): the cursor in the search box... */
export const DEFAULT_SEARCH_SHORTCUT = "Ctrl+KeyF";
/** ...and the filter bar over the monster list. */
export const DEFAULT_FILTER_SHORTCUT = "Ctrl+Shift+KeyF";

type KeyLike = Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;

/** The shortcut a key press makes, or null: a lone modifier, or a plain key without Ctrl/Alt (Cmd too on a Mac: it
 * would catch ordinary typing and game keys); F1–F12 may be used alone. Cmd is « Super », the global shortcut's own
 * name for it: it was never written down, so a Mac player could not choose a shortcut with Cmd at all, and Cmd alone
 * with a key was refused (owner, 2026-11-28). The Windows key stays out, as before. */
export function fromKeyEvent(e: KeyLike): string | null {
  if (!e.code || MODIFIER_CODES.test(e.code)) return null;
  const fkey = /^F([1-9]|1[0-2])$/.test(e.code);
  const cmd = e.metaKey && getPlatform() === "macos";
  if (!fkey && !e.ctrlKey && !e.altKey && !cmd) return null;
  const parts = [cmd && "Super", e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.code].filter(Boolean);
  return parts.join("+");
}

/** Whether a key press is exactly this combination ("" never matches: the shortcut is off). Cmd on a Mac also stands
 * for Ctrl, as Cmd+F is the Mac's find: Ctrl+F is matched by Cmd+F too. */
export function matchesShortcut(e: KeyLike, keys: string): boolean {
  return !!keys && (fromKeyEvent(e) === keys || fromKeyEvent(cmdAsCtrl(e)) === keys);
}

/** The key press with Cmd read as Ctrl (and no longer as Cmd). Its fields copied one by one: a KeyboardEvent's are
 * getters on its prototype, which `{ ...e }` leaves behind. */
export function cmdAsCtrl(e: KeyLike): KeyLike {
  return { code: e.code, ctrlKey: e.ctrlKey || e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: false };
}

const KEY_NAME = (code: string) =>
  code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, t("key.numpad"));

export function shortcutLabel(s: string): string {
  if (!s) return t("key.none");
  const mac = getPlatform() === "macos";
  return s
    .split("+")
    // a Mac keyboard says Control and Option
    .map((p) => (p === "Super" ? (mac ? "Cmd" : "Win") : p === "Ctrl" ? (mac ? "Control" : "Ctrl") : p === "Shift" ? t("key.shift") : p === "Alt" ? (mac ? "Option" : "Alt") : KEY_NAME(p)))
    .join(" + ");
}
