import { expect, it } from "vitest";
import { MISSED_AFTER_MS, searchState } from "../src/screen/fightSearch";

const base = { inFight: true, zoneKnown: false, following: true, since: 0, now: 0 };

it("searches in a fight while the zone is unknown", () => {
  expect(searchState(base)).toBe("searching");
});

it("says the zone was missed after a while, and keeps searching", () => {
  expect(searchState({ ...base, now: MISSED_AFTER_MS - 1 })).toBe("searching");
  expect(searchState({ ...base, now: MISSED_AFTER_MS })).toBe("missed");
});

it("rests out of a fight, once the zone is known, or when the zone is not followed", () => {
  expect(searchState({ ...base, inFight: false })).toBe("idle");
  expect(searchState({ ...base, zoneKnown: true })).toBe("idle");
  expect(searchState({ ...base, following: false })).toBe("idle");
});
