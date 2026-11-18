# Suggestion relay

The “Suggestion” button posts the player's report to this Cloudflare Worker, which forwards it to the Discord
webhook of `#suggestions-in-app`. The webhook lives only in the Worker (a Cloudflare secret), so it is not in the
app: the exe only knows the Worker's address. The Worker accepts only a Dofight report (one embed, an optional
`dofight-log.txt`), caps its size, turns @mentions off and allows 3 reports a minute per connection.

Tests: `node --test relay/worker.test.mjs` (no dependency).

What a suggestion contains, and what it never contains, is in the [README](../README.md#questions-fréquentes).

## Setup (maintainer)

1. Create a free Cloudflare account, then from this folder: `npx wrangler login`.
2. `npx wrangler deploy`: prints the Worker's address, `https://dofight-relay.<account>.workers.dev`.
3. In Discord, create a webhook for `#suggestions-in-app`, then `npx wrangler secret put DISCORD_WEBHOOK` and
   paste it.
4. In GitHub, set this repository's `DOFIGHT_WEBHOOK` secret to the Worker's address: releases built after that
   send suggestions through the Worker.

Changing the code: edit `worker.mjs`, run the tests, `npx wrangler deploy`.
