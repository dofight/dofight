# Dofight app

The Windows overlay itself: Tauri v2, Rust in `src-tauri/`, Vite + TypeScript (vanilla) in `src/`. The working rules
and the release steps are in the repo's `CONTRIBUTING.md`.

- Dev, with live reload: `pnpm tauri dev`
- Tests: `pnpm vitest run` here, `cargo test --lib` in `src-tauri/`
- Release build: `pnpm tauri build` (releases are built by the GitHub workflow on a `vX.Y.Z` tag)
