import { expect, it } from "vitest";
import { DEFAULT_SHORTCUT, fromKeyEvent, shortcutLabel } from "../src/shortcut";

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
