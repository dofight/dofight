import type { Room } from "../room";
import type { Settings } from "../settings";
import type { FightState } from "./fight";

/** What one screen-reading tick saw in the reference Dofus window. */
export interface Reading {
  /** The reference Dofus window (or a Dofight window) is in front. */
  front: boolean;
  /** The room or sub-area the map header points to; null when unread, cut or unknown. */
  room: Room | null;
  fight: FightState;
  /** The game was read this tick. False when Dofight is in front (no capture): nothing about the fight changes. */
  seen?: boolean;
  /** When it was read (ms). Without it, only readings are counted. */
  at?: number;
}

export type Action =
  | { type: "loadRoom"; room: Room }
  | { type: "show" | "hide" | "hideAll" | "restoreAll" };

export interface DirectorState {
  front: boolean;
  /** Dofight is hidden because Dofus is not in front (option « hideWhenAway »). */
  away: boolean;
  inFight: boolean;
  /** Readings in a row without any fight sign: the fight is over only after a few (one missed frame is not an end). */
  quietTicks: number;
  /** When the first of those readings was made (ms), null when unknown. */
  quietSince: number | null;
  lastRoomTitle: string | null;
  /** A new room read once: it is loaded only when the next reading says the same (one bad OCR frame is ignored). */
  pendingRoomTitle: string | null;
  /** The overlay was opened by a fight start (only those are closed at the fight's end). */
  openedAuto: boolean;
  /** The player hid the overlay during this fight: it stays hidden until the next fight. */
  hiddenByPlayer: boolean;
  /** The player opened the overlay by hand: a fight's end never closes it. */
  openedByPlayer: boolean;
}

/** Without the end banner, a fight is over after this long without any sign of it (frames may miss the buttons,
 * for instance while a spell animation covers them), and at least QUIET_TICKS_TO_END readings. */
export const QUIET_MS_TO_END = 4000;
export const QUIET_TICKS_TO_END = 3;

export function initialState(): DirectorState {
  return { front: true, away: false, inFight: false, quietTicks: 0, quietSince: null, lastRoomTitle: null, pendingRoomTitle: null, openedAuto: false, hiddenByPlayer: false, openedByPlayer: false };
}

/** Pure decision: what to do after one reading. The caller applies the actions and feeds back player events. */
export function step(state: DirectorState, reading: Reading, settings: Settings): { state: DirectorState; actions: Action[] } {
  const s = { ...state };
  const actions: Action[] = [];

  s.front = reading.front;
  // hidden while Dofus is not in front only when the player asked for it (off by default); turning the option off
  // while away brings everything back at the next tick
  const away = !reading.front && settings.hideWhenAway;
  if (away !== s.away) {
    s.away = away;
    actions.push({ type: away ? "hideAll" : "restoreAll" });
  }
  if (!reading.front || reading.seen === false) return { state: s, actions };

  const fighting = reading.fight === "fight";
  // the header is trusted out of a fight (the preparation included: the turn order can cover it, and the zone was
  // read on the map before). In a fight it is used only when no room is known yet (Dofight opened or reloaded
  // mid-fight), and then only once read twice in a row: the fight's effects may garble that corner
  const unknownInFight = fighting && s.lastRoomTitle === null;
  if (settings.fromHeader && reading.room && (!fighting || unknownInFight) && reading.room.title !== s.lastRoomTitle) {
    if (s.pendingRoomTitle === reading.room.title || (s.lastRoomTitle === null && !fighting)) {
      s.lastRoomTitle = reading.room.title;
      s.pendingRoomTitle = null;
      actions.push({ type: "loadRoom", room: reading.room });
    } else s.pendingRoomTitle = reading.room.title;
  } else if (reading.room?.title === s.lastRoomTitle) s.pendingRoomTitle = null;

  // the end of a fight: the end banner, or several readings in a row without the fight buttons
  if (fighting || reading.fight === "end") {
    s.quietTicks = 0;
    s.quietSince = null;
  } else if (s.inFight) {
    if (s.quietTicks === 0) s.quietSince = reading.at ?? null;
    s.quietTicks += 1;
  }
  const quietLongEnough = reading.at === undefined || s.quietSince === null || reading.at - s.quietSince >= QUIET_MS_TO_END;
  const over = reading.fight === "end" || (s.quietTicks >= QUIET_TICKS_TO_END && quietLongEnough);

  if (fighting && !s.inFight) {
    s.inFight = true;
    s.hiddenByPlayer = false;
    if (settings.autoFight) {
      s.openedAuto = true;
      actions.push({ type: "show" });
    }
  } else if (!fighting && s.inFight && over) {
    s.inFight = false;
    s.quietTicks = 0;
    s.quietSince = null;
    if (settings.autoFight && s.openedAuto && !s.openedByPlayer) actions.push({ type: "hide" });
    s.openedAuto = false;
    s.hiddenByPlayer = false;
  }
  return { state: s, actions };
}
