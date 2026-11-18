**What a player will see:**

**Checklist** (see CONTRIBUTING.md)
- [ ] Tests pass (`pnpm vitest run`, `pnpm exec tsc --noEmit -p .`, `cargo test --lib`, `pytest -q tests`,
  `node --test relay/worker.test.mjs`)
- [ ] A bug fix comes with a test that fails without it
- [ ] Player-facing text in French, with its English (`i18n.ts` or `data/summaries/en.json`)
- [ ] Summaries: `tools.summaries validate` then `index`; nothing the sources do not support
- [ ] No character, guild or account names, no secrets
