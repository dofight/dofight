import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// The search and the filter stay in view: a fixed head over a list that scrolls on its own (owner and Fable,
// 2026-11-22). No fold, manual or automatic: rows jumping under the pointer would switch the hover preview.
it("pins the search row and the filter above the scrolling list", () => {
  document.body.innerHTML = readFileSync("index.html", "utf8").replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, "");
  const main = document.getElementById("view-main")!;
  expect(main.classList.contains("paged")).toBe(true);
  const head = main.querySelector(":scope > .mainhead")!;
  const body = main.querySelector(":scope > #main-body.pagebody")!;
  expect(head.querySelector(".searchrow #q")).not.toBeNull();
  expect(head.querySelector("#results")).not.toBeNull();
  expect(head.querySelector("#find")).not.toBeNull();
  expect(body.querySelector("#room")).not.toBeNull();
  expect(body.querySelector("#status")).not.toBeNull(); // the messages scroll with the list: the head keeps one height
});

it("lays the search results over the list instead of pushing it down", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toMatch(/\.searchbox\{[^}]*position:relative/);
  expect(css).toMatch(/\.searchbox \.results\{[^}]*position:absolute/);
});
