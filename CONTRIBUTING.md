# Contributing to Dofight

Thanks for helping. Dofight is a Windows overlay for Dofus 3; the rules below keep it safe for players and keep the
summaries trustworthy.

## Without writing code

- A wrong, unclear or missing badge or summary: the “Suggestion” button in Dofight, or a
  [“Summary fix” issue](https://github.com/dofight/dofight/issues/new/choose), with the in-game spell or the guide
  section that shows it.
- A bug: a [“Bug” issue](https://github.com/dofight/dofight/issues/new/choose), with the diagnostic log
  (Settings → Diagnostics → “Copy the log”).
- Questions and ideas: the [Discord](https://discord.gg/G8G4cyvpx6). French or English, both are fine.

## Ground rules

- **Screen reading only.** Dofight never sends input to the game and never reads its memory, files or network
  traffic. A change that would break this is refused.
- **No personal data.** No character, guild or account names in code, fixtures, screenshots or commits (crop chat
  and window titles out of screenshots).
- **French first for players.** Player-facing text (interface, badges, summaries) is written in French, then in
  English: `app/src/i18n.ts` for the interface, `data/summaries/en.json` for the summaries, with the official Ankama
  English names only.
- **English for everything else:** code, identifiers, comments, commit messages, docs.

## Setup

Windows 10 or 11 only: the app uses Windows screen capture and text recognition (add French to your Windows
languages).

- App: Node 22 + pnpm, Rust stable. In `app/`: `pnpm install`, then `pnpm tauri dev` (live reload).
- Tools: Python 3.12 with pytest (`python -m venv .venv`, then `.venv/Scripts/python -m pip install pytest`).

## Tests (all must pass; the `tests` workflow runs them on every pull request)

- `pnpm vitest run` and `pnpm exec tsc --noEmit -p .` in `app/`
- `cargo test --lib` in `app/src-tauri/`
- `.venv/Scripts/python -m pytest -q tests` at the root
- `node --test relay/worker.test.mjs` (the suggestion relay)
- After touching summaries: `.venv/Scripts/python -m tools.summaries validate`, then `index`

A bug fix comes with a test that fails without it.

## Summaries

Summaries follow `docs/reading-grid.md`: short, the same form for the same behaviour, only what changes how a fight
is played, never invented (the game data and the dungeon's guide are the sources). A new or changed text gets its
English in `data/summaries/en.json` in the same change. New summaries are `draft`; only the maintainer marks one
`reviewed`.

## Release notes

A commit that changes what a player sees ends its message with trailer lines written for players, French and
English; the release notes are drafted from them (`python -m tools.release_notes vX.Y.Z --summary-fr "…"
--summary-en "…"`):

```
Boss summons shown under their boss

Notes-kind: new
Notes-fr: Les invocations des boss s'affichent sous eux, avec leur fiche.
Notes-en: Bosses' summons now show under them, with their card.
```

`Notes-kind` is `new`, `change` (the default) or `fix`. Several `Notes-fr` / `Notes-en` pairs can follow each other.
Commits that players do not see (tests, refactoring, docs) have none.

## Pull requests

One topic per pull request, with a short description of what a player will see. Releases are made by the
maintainer only (a `vX.Y.Z` tag runs the `release` workflow).

## Layout

| Folder | What |
|---|---|
| `app/` | The app: Tauri v2, Rust in `app/src-tauri/`, Vite + TypeScript in `app/src/` |
| `data/snapshot/` | Game data from Dofensive (monsters, spells, dungeons; `en/` for English) |
| `data/travel.json` | From DofusDB (`tools/travel.py`): zaaps, dungeon entrances, subarea positions, map coordinates |
| `data/summaries/` | Summaries: one file per dungeon (`dungeons/`) and guild expedition (`zones/`), mechanic sheets (`mechanics.json`), the badge list (`vocabulary.json`), English (`en.json`) |
| `data/icons/` | Icons used by the app |
| `relay/` | The “Suggestion” relay (Cloudflare Worker) |
| `tools/` | Python tools: game data, summaries, Discord |
| `docs/` | Summary rules (`reading-grid.md`), release notes |

## Maintainers: releases and secrets

To release: bump the version in `app/package.json`, `app/src-tauri/tauri.conf.json` and `app/src-tauri/Cargo.toml`;
draft the player notes with `python -m tools.release_notes vX.Y.Z` (from the commits' `Notes-fr` / `Notes-en` lines,
into `docs/release-notes/vX.Y.Z.md`) and reread them; commit, tag `vX.Y.Z` and push the tag. The `release` workflow builds, signs and publishes the
installer, the plain exe and `latest.json` (auto-update), and announces it on the Discord. Secrets live in the
repository's GitHub secrets, never in the code:

| Secret | What for |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD`) | Signs the update files (the key file stays on the maintainer's PC) |
| `DOFIGHT_WEBHOOK` | Where the “Suggestion” button posts: the relay's address (`relay/`) |
| `DOFIGHT_ANNOUNCE_WEBHOOK` | Announces each release on the Discord |
