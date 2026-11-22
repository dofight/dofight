/** The diagnostic log, from the page (see src-tauri/src/diag.rs): what Dofight understood and did, sent with a
 * suggestion when the player leaves « Joindre le journal » on.
 *
 * Only cleaned-up facts go in: zone and monster names, fight state, actions, settings. Never raw screen text (chat,
 * character or guild names), window titles, or the reference window setting. A piece of what was read goes in a dev
 * build alone, through `withRead`: that is the one thing here the player must be able to trust. */
import { invoke } from "@tauri-apps/api/core";

/** A build with the dev tools in it (src-tauri/src/lib.rs dev_build); `import.meta.env.DEV` is the dev server alone. */
let devBuild = import.meta.env.DEV;
void invoke<boolean>("dev_build")
  .then((dev) => {
    devBuild = devBuild || dev;
  })
  .catch(() => {}); // a release build, where the command is there but nothing else is

/** `message`, and what was read on screen behind it — in a dev build only.
 *
 * What the screen holds is not ours to write down: the corner the zone is read from also holds the player's guild
 * and alliance, and a tooltip sits over the chat. A misreading is what shows why a zone or a group was missed, so
 * the owner still gets it on a dev build; a player's log, which goes out with a suggestion, gets the message alone
 * (owner, 2026-11-21: « nothing unsecure that makes us lie »). `message` has to read sensibly without it. */
export function withRead(message: string, raw: string): string {
  return devBuild ? `${message}: « ${raw} »` : message;
}

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
