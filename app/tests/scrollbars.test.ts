import { afterEach, expect, it, vi } from "vitest";
import { scrollbarsWhileScrolling } from "../src/scrollbars";

afterEach(() => vi.useRealTimers());

// one listener for the whole file: it is installed once per window in the app as well
document.body.innerHTML = '<div class="view"><p>…</p></div><div class="other"></div>';
scrollbarsWhileScrolling();

it("marks an element as scrolling while the player scrolls it, then not", () => {
  vi.useFakeTimers();
  const view = document.querySelector(".view")!;
  view.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
  view.dispatchEvent(new Event("scroll"));
  expect(view.classList.contains("scrolling")).toBe(true);
  vi.advanceTimersByTime(500);
  view.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
  view.dispatchEvent(new Event("scroll")); // still scrolling: the bar stays
  vi.advanceTimersByTime(700);
  expect(view.classList.contains("scrolling")).toBe(true);
  vi.advanceTimersByTime(300);
  expect(view.classList.contains("scrolling")).toBe(false);
});

it("shows nothing for a scroll the code makes itself, with no wheel, touch, key or press before it", () => {
  vi.useFakeTimers();
  vi.advanceTimersByTime(5000); // long after the last input
  const other = document.querySelector(".other")!;
  other.dispatchEvent(new Event("scroll")); // a list drawn again, a scrollIntoView
  expect(other.classList.contains("scrolling")).toBe(false);
});
