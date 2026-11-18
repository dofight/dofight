/** The diagnostic log, from the page (see src-tauri/src/diag.rs): what Dofight understood and did, sent with a
 * suggestion when the player leaves « Joindre le journal » on.
 *
 * Only cleaned-up facts go in: zone and monster names, fight state, actions, settings. Never raw screen text (chat,
 * character or guild names), window titles, or the reference window setting. */
import { invoke } from "@tauri-apps/api/core";

export function diag(area: string, message: string): void {
  void invoke("log_event", { area, message }).catch(() => {}); // a log must never break the app
}

const last = new Map<string, string>();

/** Logs only when the message for `key` changed (readings repeat every tick). */
export function diagOnChange(key: string, area: string, message: string): void {
  if (last.get(key) === message) return;
  last.set(key, message);
  diag(area, message);
}

/** The settings as they may be logged or sent: the reference window (a character name) is left out. */
export function loggableSettings(patch: Record<string, unknown>): string {
  return Object.entries(patch)
    .filter(([k]) => k !== "referenceWindow")
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}
