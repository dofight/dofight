/** « Scanner ma sous-zone » (the zone not followed): the corner is read twice (screen.rs SCAN_READS), and the zone
 * is kept only when both readings found the same one (a fight's effects may garble the corner). */
import type { Room } from "../room";

/** noHeader: no map header at all (the coordinates option); unknown: a header, but no zone with monsters for it (a
 * village); failed: the readings disagree (a garbled frame), worth another try. */
export type ScanOutcome = { room: Room } | { problem: "noHeader" | "unknown" | "failed" };

/** `rooms`: the zone each reading found; `headers`: whether each reading found a map header at all. */
export function scanOutcome(rooms: (Room | null)[], headers: boolean[]): ScanOutcome {
  const [first, ...rest] = rooms;
  if (first && rest.length && rest.every((r) => r?.title === first.title)) return { room: first };
  if (rooms.some(Boolean)) return { problem: "failed" };
  return headers.some(Boolean) ? { problem: "unknown" } : { problem: "noHeader" };
}
