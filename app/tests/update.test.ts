import { expect, it, vi } from "vitest";
import { autoUpdate, portableCheck, type DownloadEvent } from "../src/update";
import { plain } from "./fixtures";

it("downloads with a progress bar, installs and restarts", async () => {
  const shown: [string, (number | null)?][] = [];
  const show = vi.fn((text: string, done?: number | null) => void shown.push(done === undefined ? [plain(text)] : [plain(text), done]));
  const relaunch = vi.fn(async () => {});
  const install = vi.fn(async (onEvent?: (e: DownloadEvent) => void) => {
    onEvent?.({ event: "Started", data: { contentLength: 200 } });
    onEvent?.({ event: "Progress", data: { chunkLength: 50 } });
    onEvent?.({ event: "Progress", data: { chunkLength: 150 } });
    onEvent?.({ event: "Finished" });
  });
  await autoUpdate({ check: async () => ({ version: "0.3.0", downloadAndInstall: install }), relaunch, show });
  expect(shown).toContainEqual(["Téléchargement de la version 0.3.0…", 0.25]);
  expect(shown).toContainEqual(["Téléchargement de la version 0.3.0…", 1]);
  expect(shown.at(-1)).toEqual(["Installation de la version 0.3.0… Dofight redémarre tout seul.", 1]);
  expect(relaunch).toHaveBeenCalled();
});

it("shows an indeterminate bar when the size is unknown, and tells a failure", async () => {
  const shown: [string, (number | null)?][] = [];
  const show = vi.fn((text: string, done?: number | null) => void shown.push(done === undefined ? [plain(text)] : [plain(text), done]));
  const install = vi.fn(async (onEvent?: (e: DownloadEvent) => void) => {
    onEvent?.({ event: "Started", data: {} });
    throw new Error("network");
  });
  await autoUpdate({ check: async () => ({ version: "0.3.0", downloadAndInstall: install }), relaunch: vi.fn(), show });
  expect(shown).toContainEqual(["Téléchargement de la version 0.3.0…", null]);
  expect(shown.at(-1)).toEqual(["La mise à jour 0.3.0 a échoué. Nouvel essai au prochain lancement."]);
});

it("does nothing when up to date, and never throws when offline", async () => {
  const shown: [string, (number | null)?][] = [];
  const show = vi.fn((text: string, done?: number | null) => void shown.push(done === undefined ? [plain(text)] : [plain(text), done]));
  await autoUpdate({ check: async () => null, relaunch: vi.fn(), show });
  await autoUpdate({ check: async () => { throw new Error("offline"); }, relaunch: vi.fn(), show });
  expect(show).not.toHaveBeenCalled();
});

it("a portable copy checks and installs through its own commands, progress included", async () => {
  const calls: [string, unknown?][] = [];
  const events: DownloadEvent[] = [];
  const invoke = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push([cmd, args]);
    if (cmd === "portable_check") return "0.8.0" as T;
    const send = (args?.onEvent as { send: (e: DownloadEvent) => void }).send;
    send({ event: "Started", data: { contentLength: 10 } });
    send({ event: "Finished" });
    return undefined as T;
  };
  const channel = (onEvent: (e: DownloadEvent) => void) => ({ send: onEvent });
  const update = await portableCheck(invoke, channel)();
  expect(update?.version).toBe("0.8.0");
  await update?.downloadAndInstall((e) => events.push(e));
  expect(calls.map(([cmd]) => cmd)).toEqual(["portable_check", "portable_install"]);
  expect(events.map((e) => e.event)).toEqual(["Started", "Finished"]);
});

it("a portable copy with no newer release finds nothing", async () => {
  const invoke = async <T,>(): Promise<T> => null as T;
  expect(await portableCheck(invoke, () => ({}))()).toBeNull();
});
