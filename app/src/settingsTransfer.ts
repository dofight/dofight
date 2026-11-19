/** The settings as text, to copy to another PC or share (owner, 2026-11-18). The reference window (a character's
 * name) and the moment's Songe mode stay on this PC. */
import { loadSettings, type Settings } from "./settings";

const LOCAL: (keyof Settings)[] = ["referenceWindow", "songe"];

export function exportSettings(s: Settings): string {
  const settings = Object.fromEntries(Object.entries(s).filter(([k]) => !LOCAL.includes(k as keyof Settings)));
  return JSON.stringify({ dofight: "settings", version: 1, settings });
}

/** The settings a text holds, over `current` (every value checked as when loading; the local ones kept). */
export function importSettings(text: string, current: Settings): { ok: true; settings: Settings } | { ok: false } {
  let data: unknown;
  try {
    data = JSON.parse(text.trim());
  } catch {
    return { ok: false };
  }
  const d = data as { dofight?: unknown; settings?: unknown } | null;
  if (!d || d.dofight !== "settings" || !d.settings || typeof d.settings !== "object" || Array.isArray(d.settings)) return { ok: false };
  const local = Object.fromEntries(LOCAL.map((k) => [k, current[k]]));
  const merged = { ...current, ...(d.settings as Record<string, unknown>), ...local };
  return { ok: true, settings: loadSettings({ getItem: () => JSON.stringify(merged) }) };
}
