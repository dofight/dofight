/** A player's suggestion or bug report, sent from the overlay to the Dofight Discord (webhook, via the Rust side).
 * The app's state is attached automatically so the report can be understood without asking the player.
 * Never attached: screenshots, window titles (character names) or chat.
 * The report is read by the developers: its title and field names are in English whatever the interface language
 * (the player's own text is sent as typed). */
import { DICTIONARIES } from "./i18n";
import { DEFAULTS, type Settings } from "./settings";
import type { Monster } from "./types";

export const KINDS = ["wrongSummary", "missingBadge", "wrongData", "wrongMonsters", "bug", "idea"] as const;
export type ReportKind = (typeof KINDS)[number];

/** The kind as the report title shows it (the form shows it in the interface language, see i18n.ts). */
export const KIND_TITLE = Object.fromEntries(KINDS.map((k) => [k, DICTIONARIES.en[`report.kind.${k}`]])) as Record<ReportKind, string>;

export const TEXT_MAX = 1000;
export const COOLDOWN_MS = 60_000;

/** What Dofight last understood from the screen (no raw OCR: it may contain names or chat). */
export interface Reading {
  zoneRead: string | null; // the map header title as read
  located: string | null; // the room or sub-area it was matched to
  fight: string; // none / fight / end
  front: boolean;
}

export interface ReportInput {
  kind: ReportKind;
  text: string;
  monster: Monster | null;
  /** What the suggestion is about when it is not a monster: a dungeon, a zone or an expedition (from the search). */
  subject?: { kind: string; label: string } | null;
  room: string | null; // the room shown in the overlay
  attachState: boolean;
  reading: Reading | null;
  settings: Settings;
  version: string;
}

/** The settings that differ from the defaults, as "key=value" (the reference window is never sent). */
export function changedSettings(s: Settings): string {
  const out = (Object.keys(DEFAULTS) as (keyof Settings)[])
    .filter((k) => k !== "referenceWindow" && s[k] !== DEFAULTS[k])
    .map((k) => `${k}=${s[k]}`);
  return out.join(", ") || "defaults";
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const field = (name: string, value: string, inline = true) => ({ name, value: clip(value || "—", 1000), inline });

/** The Discord webhook body. Mentions are disabled so a report can never ping anyone. */
export function buildReport(r: ReportInput) {
  const fields = [];
  if (r.monster) fields.push(field("Monster", `${r.monster.name} (#${r.monster.id}, ${r.monster.kind})`));
  else if (r.subject) fields.push(field("Subject", `${r.subject.label} (${r.subject.kind})`));
  if (r.room) fields.push(field("Room or zone shown", r.room));
  if (r.attachState) {
    const read = r.reading;
    fields.push(field("Read on screen", read ? `${read.zoneRead ?? "no zone name"} → ${read.located ?? "not recognised"}` : "nothing read", false));
    fields.push(field("Fight", read ? `${read.fight}${read.front ? "" : " (Dofus not in front)"}` : "—"));
    fields.push(field("Settings", changedSettings(r.settings), false));
  }
  return {
    username: "Dofight",
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: clip(`${KIND_TITLE[r.kind]}${r.monster ? ` · ${r.monster.name}` : r.subject ? ` · ${r.subject.label}` : ""}`, 250),
        description: clip(r.text.trim(), TEXT_MAX),
        fields,
        footer: { text: `Dofight ${r.version}` },
      },
    ],
  };
}

/** Milliseconds left before the next report may be sent (one per minute). */
export function cooldownLeft(lastSentAt: number | null, now: number): number {
  return lastSentAt === null ? 0 : Math.max(0, lastSentAt + COOLDOWN_MS - now);
}
