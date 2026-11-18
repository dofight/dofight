/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { resolve } from "node:path";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  // the snapshot, summaries and icons live in ../data and are served as static files
  publicDir: "../data",
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        preview: resolve(import.meta.dirname, "preview.html"),
        peek: resolve(import.meta.dirname, "peek.html"),
      },
    },
  },
  test: { environment: "jsdom" },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
