/** The global shortcut that shows or hides the overlay: stored as the plugin reads it ("Ctrl+Shift+KeyD"), shown to
 * the player in the interface language ("Ctrl + Maj + D", "Ctrl + Shift + D"). */

import { t } from "./i18n";

export const DEFAULT_SHORTCUT = "Ctrl+Shift+KeyD"; // D for Dofight

type KeyLike = Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;

/** The shortcut a key press makes, or null: a lone modifier, or a plain key without Ctrl/Alt (it would catch
 * ordinary typing and game keys); F1–F12 may be used alone. */
export function fromKeyEvent(e: KeyLike): string | null {
  if (!e.code || MODIFIER_CODES.test(e.code)) return null;
  const fkey = /^F([1-9]|1[0-2])$/.test(e.code);
  if (!fkey && !e.ctrlKey && !e.altKey) return null;
  const parts = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.code].filter(Boolean);
  return parts.join("+");
}

const KEY_NAME = (code: string) =>
  code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, t("key.numpad"));

export function shortcutLabel(s: string): string {
  if (!s) return t("key.none");
  return s
    .split("+")
    .map((p) => (p === "Ctrl" ? "Ctrl" : p === "Shift" ? t("key.shift") : p === "Alt" ? "Alt" : KEY_NAME(p)))
    .join(" + ");
}
