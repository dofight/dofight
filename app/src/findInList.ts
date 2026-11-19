/** « Chercher dans la liste » (Ctrl+F or the 🔍 of the room header): only the monsters on screen whose name, badges,
 * detail, spell names or spell effects hold the text stay, opened, with the text highlighted. Accents and case are
 * ignored, like the main search; the text is the one shown (French or English). */
import { tagLabel } from "./render/monster";
import { normalize } from "./search";
import type { Monster, MonsterSummary, Spell, Vocabulary } from "./types";

/** Everything a monster's card can say, as one searchable text. */
export function monsterText(m: Monster, summary: MonsterSummary | undefined, spells: Map<number, Spell>, vocab: Vocabulary): string {
  const parts = [m.name];
  for (const tag of summary?.tags ?? []) {
    const spec = vocab.tags[tag.id];
    parts.push(`${spec ? tagLabel(spec) : ""} ${tag.param ?? ""}`);
  }
  if (summary?.detail) parts.push(summary.detail);
  for (const id of m.spellIds) {
    const s = spells.get(id);
    if (s) parts.push(s.name, ...s.effects.map((e) => e.text));
  }
  return normalize(parts.join("\n"));
}

/** The spells of `m` whose name or effects hold the text (their buttons are marked). */
export function spellsMatching(m: Monster, spells: Map<number, Spell>, query: string): number[] {
  const q = normalize(query).trim();
  if (!q) return [];
  return m.spellIds.filter((id) => {
    const s = spells.get(id);
    return !!s && normalize([s.name, ...s.effects.map((e) => e.text)].join("\n")).includes(q);
  });
}

export const matches = (text: string, query: string): boolean => {
  const q = normalize(query).trim();
  return !q || text.includes(q);
};

/** Wraps each match of `query` in the text under `root` in <mark class="hit"> (accents and case ignored). */
export function highlight(root: HTMLElement, query: string): void {
  const q = normalize(query).trim();
  if (!q) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = (n as Text).parentElement;
    if (parent && !parent.closest(".sr-only, mark, script, style")) nodes.push(n as Text);
  }
  for (const node of nodes) {
    const text = node.data;
    // the normalized text, and for each of its characters the original character it came from
    let flat = "";
    const from: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const c = normalize(text[i]);
      for (let k = 0; k < c.length; k++) from.push(i);
      flat += c;
    }
    let at = flat.indexOf(q);
    if (at < 0) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    while (at >= 0) {
      const start = from[at];
      const end = from[at + q.length - 1] + 1;
      if (start > last) frag.append(text.slice(last, start));
      const mark = document.createElement("mark");
      mark.className = "hit";
      mark.textContent = text.slice(start, end);
      frag.append(mark);
      last = end;
      at = flat.indexOf(q, at + q.length);
    }
    if (last < text.length) frag.append(text.slice(last));
    node.replaceWith(frag);
  }
}
