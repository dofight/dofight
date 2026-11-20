import { emit, listen } from "@tauri-apps/api/event";
import { setLang } from "./i18n";
import { sheetCopy } from "./render/accessSheet";
import { KEY, loadSettings } from "./settings";
import { applyTextSize, applyTheme } from "./theme";

// The hover preview beside the panel: a folded monster's badges and summary (see renderPeek). It only shows what the
// panel sends, then tells the panel its height so the panel can size and place it.

// the same theme and text size as the panel
const syncTheme = () => {
  const settings = loadSettings(localStorage);
  applyTheme(document.documentElement, settings.theme);
  applyTextSize(document.documentElement, settings.textSize);
  setLang(settings.lang); // the « copied » line of a sheet, in the interface language
};
syncTheme();
window.addEventListener("storage", (e) => e.key === KEY && syncTheme());

// a pinned mechanic's sheet links to its guide: the panel opens it (this window only sends events)
document.addEventListener("click", (e) => {
  // « Comment y aller »: a command to copy goes to the panel, which owns the clipboard
  if (sheetCopy(e.target as Element, (command) => void emit("peek:copy", command))) return;
  const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.guide");
  if (!link) return;
  e.preventDefault();
  void emit("peek:open", link.href);
});

void listen<{ token: number; html: string }>("peek:render", ({ payload }) => {
  const box = document.getElementById("peek")!;
  box.innerHTML = payload.html;
  // wait for the layout (and the badge icons, which have a fixed size) before measuring
  requestAnimationFrame(() => void emit("peek:size", { token: payload.token, height: Math.ceil(box.getBoundingClientRect().height) }));
});
