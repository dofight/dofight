import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER_SHORTCUT, DEFAULT_SEARCH_SHORTCUT, DEFAULT_SHORTCUT, fromKeyEvent, matchesShortcut, shortcutLabel } from "../src/shortcut";

const key = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods,
});

it("reads a combination from a key press", () => {
  expect(fromKeyEvent(key("KeyB", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+KeyB");
  expect(fromKeyEvent(key("Digit5", { altKey: true }))).toBe("Alt+Digit5");
  expect(fromKeyEvent(key("F9"))).toBe("F9");
});

it("refuses lone modifiers and plain keys that would catch typing", () => {
  expect(fromKeyEvent(key("ShiftLeft", { shiftKey: true }))).toBeNull();
  expect(fromKeyEvent(key("KeyB"))).toBeNull();
  expect(fromKeyEvent(key("KeyB", { shiftKey: true }))).toBeNull();
});

it("shows the shortcut in French", () => {
  expect(shortcutLabel(DEFAULT_SHORTCUT)).toBe("Ctrl + Maj + D");
  expect(shortcutLabel("Alt+Digit5")).toBe("Alt + 5");
  expect(shortcutLabel("")).toBe("Aucun");
});

it("on a Mac, the modifiers are named as on its keyboard: Control, Option", async () => {
  const { setPlatform } = await import("../src/i18n");
  const { shortcutLabel } = await import("../src/shortcut");
  setPlatform("macos");
  expect(shortcutLabel("Ctrl+Alt+KeyD")).toBe("Control + Option + D");
  setPlatform("windows");
  expect(shortcutLabel("Ctrl+Alt+KeyD")).toBe("Ctrl + Alt + D");
});

describe("search and filter shortcuts (owner, 2026-11-25)", () => {
  it("defaults: Ctrl+Shift+F searches (global), Ctrl+F filters (inside Dofight)", () => {
    expect(DEFAULT_SEARCH_SHORTCUT).toBe("Ctrl+Shift+KeyF");
    expect(DEFAULT_FILTER_SHORTCUT).toBe("Ctrl+KeyF");
  });
  it("a key press matches its combination exactly", () => {
    expect(matchesShortcut(key("KeyF", { ctrlKey: true }), "Ctrl+KeyF")).toBe(true);
    expect(matchesShortcut(key("KeyF", { ctrlKey: true, shiftKey: true }), "Ctrl+KeyF")).toBe(false);
    expect(matchesShortcut(key("KeyG", { ctrlKey: true }), "Ctrl+KeyF")).toBe(false);
    expect(matchesShortcut(key("KeyF", { ctrlKey: true }), "")).toBe(false); // turned off
  });
  it("Cmd on a Mac stands for Ctrl", () => {
    expect(matchesShortcut({ ...key("KeyF"), metaKey: true }, "Ctrl+KeyF")).toBe(true);
  });
});

it("matches a real KeyboardEvent, whose fields are getters (owner's Ctrl+F, 2026-11-25)", () => {
  expect(matchesShortcut(new KeyboardEvent("keydown", { code: "KeyF", ctrlKey: true }), "Ctrl+KeyF")).toBe(true);
});
