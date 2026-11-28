import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER_SHORTCUT, DEFAULT_SEARCH_SHORTCUT, DEFAULT_SHORTCUT, fromKeyEvent, matchesShortcut, shortcutLabel } from "../src/shortcut";

const key = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({
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
  it("defaults, both inside Dofight: Ctrl+F searches, Ctrl+Shift+F filters (owner, 2026-11-25)", () => {
    expect(DEFAULT_SEARCH_SHORTCUT).toBe("Ctrl+KeyF");
    expect(DEFAULT_FILTER_SHORTCUT).toBe("Ctrl+Shift+KeyF");
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

// Cmd was never written down: a Mac player could not choose a shortcut with Cmd, and Cmd with a key alone was refused
// as plain typing (owner, 2026-11-28). It is « Super », the global shortcut's name for it; Ctrl+Shift+D stays the
// default (owner, 2026-11-28).
describe("Cmd on a Mac", () => {
  it("is recorded, alone or with others, and named Cmd", async () => {
    const { setPlatform } = await import("../src/i18n");
    setPlatform("macos");
    try {
      expect(fromKeyEvent(key("KeyD", { metaKey: true, shiftKey: true }))).toBe("Super+Shift+KeyD");
      expect(fromKeyEvent(key("KeyD", { metaKey: true }))).toBe("Super+KeyD");
      expect(fromKeyEvent(key("KeyD", { metaKey: true, ctrlKey: true }))).toBe("Super+Ctrl+KeyD");
      expect(shortcutLabel("Super+Shift+KeyD")).toBe("Cmd + Maj + D");
      expect(DEFAULT_SHORTCUT).toBe("Ctrl+Shift+KeyD");
    } finally {
      setPlatform("windows");
    }
  });
  it("matches a shortcut recorded with it, and still stands for Ctrl", async () => {
    const { setPlatform } = await import("../src/i18n");
    setPlatform("macos");
    try {
      expect(matchesShortcut(key("KeyK", { metaKey: true }), "Super+KeyK")).toBe(true);
      expect(matchesShortcut(key("KeyF", { metaKey: true }), "Ctrl+KeyF")).toBe(true);
      expect(matchesShortcut(key("KeyF", { ctrlKey: true }), "Super+KeyF")).toBe(false);
    } finally {
      setPlatform("windows");
    }
  });
  it("leaves the Windows key out on Windows, as before", () => {
    expect(fromKeyEvent(key("KeyD", { metaKey: true }))).toBeNull();
    expect(fromKeyEvent(key("KeyD", { metaKey: true, ctrlKey: true }))).toBe("Ctrl+KeyD");
  });
});
