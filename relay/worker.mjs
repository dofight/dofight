// Dofight's « Suggestion » relay, a Cloudflare Worker. The app posts its report here exactly as it would to a Discord
// webhook (JSON, or multipart with « payload_json » and the log as « files[0] »); the Worker checks it and forwards it
// to the real webhook, which only the Worker knows (secret DISCORD_WEBHOOK). So the webhook is not in the app, and
// the Worker caps what reaches Discord: a few reports per minute per connection, a size limit, no @mentions.

const PAYLOAD_MAX = 8_000; // characters of the message JSON (the app sends at most 6 000)
const LOG_MAX = 256_000; // bytes of the attached log (the app sends at most 200 000)
const MENTIONS_OFF = { parse: [] };

const reply = (status, text = null) => new Response(text, { status });

/** The message to forward: the app's fields only, never a mention. Null when it is not a Dofight report. */
function message(json) {
  let body;
  try {
    body = JSON.parse(json);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || !Array.isArray(body.embeds) || body.embeds.length === 0) return null;
  return { username: "Dofight", embeds: body.embeds.slice(0, 1), allowed_mentions: MENTIONS_OFF };
}

export async function handle(request, env, fetchImpl = fetch) {
  if (request.method !== "POST") return reply(405);
  if (!env.DISCORD_WEBHOOK) return reply(503, "not configured");
  if (env.LIMITER) {
    const key = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.LIMITER.limit({ key });
    if (!success) return reply(429);
  }
  const type = request.headers.get("content-type") ?? "";
  let out;
  if (type.startsWith("multipart/form-data")) {
    let form;
    try {
      form = await request.formData();
    } catch {
      return reply(400);
    }
    const json = form.get("payload_json");
    const file = form.get("files[0]");
    if (typeof json !== "string") return reply(400);
    if (json.length > PAYLOAD_MAX) return reply(413);
    const msg = message(json);
    if (!msg) return reply(400);
    out = new FormData();
    out.append("payload_json", JSON.stringify(msg));
    if (file && typeof file !== "string") {
      if (file.size > LOG_MAX) return reply(413);
      out.append("files[0]", new Blob([await file.text()], { type: "text/plain" }), "dofight-log.txt");
    }
  } else {
    const json = await request.text();
    if (json.length > PAYLOAD_MAX) return reply(413);
    const msg = message(json);
    if (!msg) return reply(400);
    out = JSON.stringify(msg);
  }
  const init = { method: "POST", body: out };
  if (typeof out === "string") init.headers = { "content-type": "application/json" };
  const res = await fetchImpl(env.DISCORD_WEBHOOK, init);
  return reply(res.ok ? 204 : 502);
}

export default { fetch: (request, env) => handle(request, env) };
