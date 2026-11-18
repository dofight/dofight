import { beforeEach, expect, it, vi } from "vitest";

const invoke = vi.fn(async () => {});
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...(a as [])) }));
const { diagOnChange, loggableSettings } = await import("../src/diag");

beforeEach(() => invoke.mockClear());

it("never logs the reference window (a character name)", () => {
  expect(loggableSettings({ referenceWindow: "Somebody", songe: true })).toBe("songe=true");
  expect(loggableSettings({ referenceWindow: "Somebody" })).toBe("");
});

it("logs a repeated reading once", () => {
  diagOnChange("header", "zone", "header « A » → A");
  diagOnChange("header", "zone", "header « A » → A");
  diagOnChange("header", "zone", "header « B » → B");
  expect(invoke).toHaveBeenCalledTimes(2);
});
