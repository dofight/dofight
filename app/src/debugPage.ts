import { listen } from "@tauri-apps/api/event";
import { debugBoxes, type DebugAreas } from "./debugBoxes";
import { getPlatform } from "./i18n";

// the reader sends the areas it reads (screen.rs show_areas, dev builds only); macOS sends points, Windows pixels
const scale = getPlatform() === "macos" ? 1 : window.devicePixelRatio || 1;
void listen<DebugAreas>("screen:debug", ({ payload }) => {
  document.getElementById("debug")!.innerHTML = debugBoxes(payload, scale);
});
