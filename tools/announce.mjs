// The Discord announcement of a release (used by the release workflow), for a channel both languages share: one
// post with the French notes, then the English ones, and a link to the release page.
// Usage: node tools/announce.mjs <tag> <notes.md> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [tag, notesFile, out] = process.argv.slice(2);
const text = readFileSync(notesFile, "utf8").replace(/\r/g, "");
const url = `https://github.com/${process.env.RELEASE_REPO || "dofight/dofight"}/releases/tag/${tag}`;

/** The part of the notes under « ## <title> » (up to the next « ## »), bullets wrapped on two lines joined. */
function section(title) {
  const m = text.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"));
  if (!m) return "";
  // the install line (« Dofight se met à jour tout seul », « Télécharge… ») is for the release page, not for #news:
  // the post starts at the first heading or bullet
  const lines = m[1].trim().replace(/\n {2,}/g, " ").split("\n");
  const start = lines.findIndex((l) => /^(\*\*|- )/.test(l));
  const body = (start > 0 ? lines.slice(start) : lines).join("\n").trim();
  if (body.length <= 1900) return body; // two embeds share Discord's 6000 characters
  const cut = body.lastIndexOf("\n- ", 1900); // end on a whole bullet
  return `${body.slice(0, cut > 0 ? cut : 1900)}\n…`;
}

const fr = section("Français");
const en = section("English");
const embeds = [];
if (fr) embeds.push({ title: `🇫🇷 Dofight ${tag} est sorti`, url, description: `${fr}\n\n[Notes complètes et téléchargement](${url})`, color: 0xe7b43c });
if (en) embeds.push({ title: `🇬🇧 Dofight ${tag} is out`, url, description: `${en}\n\n[Full notes and download](${url})`, color: 0xe7b43c });
// notes without language sections: the whole text once
if (!embeds.length) embeds.push({ title: `Dofight ${tag}`, url, description: text.trim().slice(0, 3800), color: 0xe7b43c });

writeFileSync(out, JSON.stringify({ username: "Dofight", embeds, allowed_mentions: { parse: [] } })); // never pings
