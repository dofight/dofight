// node --test relay/worker.test.mjs  (Node 22: Request, FormData and Blob are built in)
import assert from "node:assert/strict";
import { test } from "node:test";
import { handle } from "./worker.mjs";

const HOOK = "https://discord.test/webhook";
const report = { username: "Dofight", allowed_mentions: { parse: [] }, embeds: [{ title: "Bug", description: "texte" }] };

function discord() {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 204 });
  };
  return { calls, fetch };
}
const env = (extra = {}) => ({ DISCORD_WEBHOOK: HOOK, ...extra });
const post = (body, headers = {}) => new Request("https://relay.example/", { method: "POST", body, headers });

test("forwards a JSON report to the webhook, mentions turned off", async () => {
  const d = discord();
  const res = await handle(post(JSON.stringify({ ...report, allowed_mentions: undefined, content: "@everyone" }), { "content-type": "application/json" }), env(), d.fetch);
  assert.equal(res.status, 204);
  assert.equal(d.calls[0].url, HOOK);
  const sent = JSON.parse(d.calls[0].init.body);
  assert.deepEqual(sent.allowed_mentions, { parse: [] });
  assert.equal(sent.username, "Dofight");
  assert.equal(sent.embeds[0].title, "Bug");
});

test("forwards a report with its log file", async () => {
  const d = discord();
  const form = new FormData();
  form.append("payload_json", JSON.stringify(report));
  form.append("files[0]", new Blob(["log lines"], { type: "text/plain" }), "dofight-log.txt");
  const res = await handle(post(form), env(), d.fetch);
  assert.equal(res.status, 204);
  const out = d.calls[0].init.body;
  assert.ok(out instanceof FormData);
  assert.deepEqual(JSON.parse(out.get("payload_json")).allowed_mentions, { parse: [] });
  assert.equal(out.get("files[0]").name, "dofight-log.txt");
  assert.equal(await out.get("files[0]").text(), "log lines");
});

test("refuses what is not a Dofight report", async () => {
  const d = discord();
  assert.equal((await handle(new Request("https://relay.example/"), env(), d.fetch)).status, 405);
  assert.equal((await handle(post("not json", { "content-type": "application/json" }), env(), d.fetch)).status, 400);
  assert.equal((await handle(post(JSON.stringify({ username: "Dofight" }), { "content-type": "application/json" }), env(), d.fetch)).status, 400);
  const huge = { ...report, embeds: [{ title: "x", description: "y".repeat(9000) }] };
  assert.equal((await handle(post(JSON.stringify(huge), { "content-type": "application/json" }), env(), d.fetch)).status, 413);
  assert.equal(d.calls.length, 0);
});

test("refuses a log that is too big", async () => {
  const d = discord();
  const form = new FormData();
  form.append("payload_json", JSON.stringify(report));
  form.append("files[0]", new Blob(["x".repeat(300_000)], { type: "text/plain" }), "dofight-log.txt");
  assert.equal((await handle(post(form), env(), d.fetch)).status, 413);
  assert.equal(d.calls.length, 0);
});

test("limits each connection, keyed by its address", async () => {
  const d = discord();
  const keys = [];
  const LIMITER = { limit: async ({ key }) => (keys.push(key), { success: false }) };
  const req = post(JSON.stringify(report), { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" });
  assert.equal((await handle(req, env({ LIMITER }), d.fetch)).status, 429);
  assert.deepEqual(keys, ["203.0.113.7"]);
  assert.equal(d.calls.length, 0);
});

test("says so when the webhook is not set", async () => {
  const d = discord();
  const res = await handle(post(JSON.stringify(report), { "content-type": "application/json" }), {}, d.fetch);
  assert.equal(res.status, 503);
});

test("keeps accents in the forwarded message", async () => {
  const d = discord();
  const accented = { ...report, embeds: [{ title: "Déchireuse", description: "Message envoyé à ignorer, œ" }] };
  await handle(post(JSON.stringify(accented), { "content-type": "application/json; charset=utf-8" }), env(), d.fetch);
  assert.equal(JSON.parse(d.calls[0].init.body).embeds[0].description, "Message envoyé à ignorer, œ");
});
