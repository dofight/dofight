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

it("keeps the usual 8 px between the filter and the list: no empty status line, no doubled padding (owner, 2026-11-22)", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).toContain("#main-body>.status:empty{display:none}");
  expect(css).toMatch(/#view-main>\.pagebody\{[^}]*padding-top:0/);
  expect(css).not.toContain("#view-main>.status"); // the status lines are in #main-body now
});

// a search result chosen with the list scrolled down showed the new list from that depth (owner, 2026-11-27)
it("shows a chosen search result's list from its top", () => {
  const main = readFileSync("src/main.ts", "utf8");
  const pick = main.slice(main.indexOf('closest<HTMLElement>("#results .res-item")'));
  const block = pick.slice(0, pick.indexOf("return;"));
  expect(block).toContain('$("main-body").scrollTop = 0;');
});
