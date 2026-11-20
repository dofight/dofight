// Adds platforms to a published latest.json (what every installed Dofight's updater reads), keeping the rest: the Mac
// build runs after the Windows one and adds its darwin entries to the same release.
//   node tools/merge_latest.mjs latest.json mac-platforms.json   (rewrites latest.json)
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** `published` with `platforms` added (or replaced), as a new object. */
export function mergeLatest(published, platforms) {
  return { ...published, platforms: { ...published.platforms, ...platforms } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [latestFile, platformsFile] = process.argv.slice(2);
  const merged = mergeLatest(JSON.parse(fs.readFileSync(latestFile, "utf8")), JSON.parse(fs.readFileSync(platformsFile, "utf8")));
  fs.writeFileSync(latestFile, JSON.stringify(merged, null, 2));
}
