import { t } from "./i18n";

/** What the updater plugin reports while downloading (see @tauri-apps/plugin-updater DownloadEvent). */
export type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export interface UpdateDeps {
  check: () => Promise<{ version: string; downloadAndInstall: (onEvent?: (e: DownloadEvent) => void) => Promise<void> } | null>;
  relaunch: () => Promise<void>;
  /** Shows the update in the panel: a text and, while downloading, the share done (0..1, null when unknown). */
  show: (text: string, done?: number | null) => void;
}

/** At launch: a newer signed release is downloaded with a progress bar in the panel, installed silently (no Windows
 * installer window, see tauri.conf.json « installMode ») and Dofight restarts. Offline or up to date: nothing. */
export async function autoUpdate({ check, relaunch, show }: UpdateDeps): Promise<void> {
  let update;
  try {
    update = await check();
  } catch {
    return; // offline, GitHub unreachable: try again at the next launch
  }
  if (!update) return;
  const { version } = update;
  let total: number | null = null;
  let received = 0;
  show(t("update.downloading", { version }), null);
  try {
    await update.downloadAndInstall((e) => {
      if (e.event === "Started") {
        total = e.data.contentLength ?? null;
        show(t("update.downloading", { version }), total ? 0 : null);
      } else if (e.event === "Progress") {
        received += e.data.chunkLength;
        show(t("update.downloading", { version }), total ? Math.min(1, received / total) : null);
      } else show(t("update.installing", { version }), 1);
    });
    await relaunch();
  } catch {
    show(t("update.failed", { version }));
  }
}

/** Tauri's invoke, and a progress channel (Tauri's Channel) that hands each download event to `onEvent`. */
export type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
export type MakeChannel = (onEvent: (e: DownloadEvent) => void) => unknown;

/** The check of a copy run outside the install folder: the Rust side finds the release's raw exe, then downloads
 * it, puts it in place of the running exe (same path, shortcuts keep working) and restarts Dofight. */
export function portableCheck(invoke: Invoke, channel: MakeChannel): UpdateDeps["check"] {
  return async () => {
    const version = await invoke<string | null>("portable_check");
    if (!version) return null;
    return {
      version,
      downloadAndInstall: async (onEvent) => {
        await invoke("portable_install", { onEvent: channel((e) => onEvent?.(e)) });
      },
    };
  };
}
