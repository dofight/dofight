import { expect, it } from "vitest";
import { initialStatus, statusText, statusWarns, steadyStatus, type Status, type StatusKind } from "../src/screen/status";

const s = (kind: StatusKind, text = ""): Status => ({ kind, text });
const feed = (ticks: Status[]) => ticks.reduce((st, x) => steadyStatus(st, x), initialStatus()).shown;
const missing = s("noHeader", "Nom de zone introuvable");

it("shows a found zone at once", () => {
  expect(feed([s("found", "A"), s("found", "B")])).toEqual(s("found", "B"));
});

it("ignores one or two bad readings between good ones", () => {
  expect(feed([s("found", "A"), s("unknown", "os)"), s("found", "A")])).toEqual(s("found", "A"));
  expect(feed([s("found", "A"), missing, missing])).toEqual(s("found", "A"));
});

it("gives way after three failed readings of the same kind in a row", () => {
  expect(feed([s("found", "A"), missing, missing, missing])).toEqual(missing);
});

it("shows the first message even when it is a failure", () => {
  expect(feed([s("noDofus", "Dofus n'est pas ouvert")])).toEqual(s("noDofus", "Dofus n'est pas ouvert"));
});

it("counts garbled unknown names as the same kind of failure", () => {
  expect(feed([s("found", "A"), s("unknown", "Vilage"), s("unknown", "Vlage"), s("unknown", "Vilag")])).toEqual(s("unknown", "Vilag"));
});

it("with timed readings, a failure must also last two seconds before it replaces a zone", () => {
  const timed = (ticks: [Status, number][]) => ticks.reduce((st, [x, at]) => steadyStatus(st, x, at), initialStatus()).shown;
  expect(timed([[s("found", "A"), 0], [missing, 300], [missing, 600], [missing, 900]])).toEqual(s("found", "A"));
  expect(timed([[s("found", "A"), 0], [missing, 300], [missing, 600], [missing, 2400]])).toEqual(missing);
});

it("shows only the messages a player can act on, whatever their wording", () => {
  expect(statusText(s("found", "Landes de Cania"))).toBe("");
  expect(statusText(s("unknown", "Plaines de Gl"))).toBe("");
  expect(statusText(s("noDofus", "Dofus n'est pas ouvert"))).toBe("");
  expect(statusText(missing)).toBe("Nom de zone introuvable");
  expect(statusText(null)).toBe("");
});

it("marks the messages that block the reading as a warning", () => {
  expect(statusWarns(missing)).toBe(true);
  expect(statusWarns(s("noOcr", "x"))).toBe(true);
  expect(statusWarns(s("found", "A"))).toBe(false);
  expect(statusWarns(s("noDofus", "x"))).toBe(false);
  expect(statusWarns(null)).toBe(false);
});
