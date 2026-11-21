import { listen } from "@tauri-apps/api/event";
import { debugBoxes, debugElements, type DebugAreas } from "./debugBoxes";
import { diag } from "./diag";
import { getPlatform } from "./i18n";

// the reader sends the areas it reads (screen.rs show_areas, dev builds only); macOS sends points, Windows pixels
const scale = getPlatform() === "macos" ? 1 : window.devicePixelRatio || 1;
let said = false;
void listen<DebugAreas>("screen:debug", ({ payload }) => {
  const boxes = debugBoxes(payload, scale);
  const root = document.getElementById("debug")!;
  root.replaceChildren(...debugElements(boxes));
  if (said || !boxes.length) return;
  said = true;
  // what the page makes of the first box: where it really landed, once (the boxes are a dev aid, not a log)
  const at = root.firstElementChild!.getBoundingClientRect();
  diag("debug", `overlay drew ${boxes.length} boxes, first at ${at.x},${at.y} ${at.width}×${at.height}`);
});
