import { getLang, t, type Key } from "../i18n";

/** Icon URL for a path under data/icons/, or null when that icon was not downloaded. */
export type IconUrl = (path: string) => string | null;

export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function img(icon: IconUrl, path: string, attrs = ""): string {
  const url = icon(path);
  return url ? `<img src="${esc(url)}" alt="" ${attrs}>` : "";
}

export const CATEGORY_ICON: Record<string, number> = {
  dmg_n: 1, dmg_e: 4, dmg_f: 7, dmg_w: 10, dmg_a: 13, heal: 40, boost: 38, hinder: 29, move: 36, summon: 52, glyph: 44,
};

/** The name of a spell category (dmg_f, heal…) in the interface language. */
export const categoryName = (category: string): string => (category in CATEGORY_ICON ? t(`category.${category}` as Key) : category);

/** Sentences of a written summary: split after « . », « ! » or « ? » when the next word starts a sentence (a capital,
 * a digit, a sign or « « »), so « 0 rés. poussée » stays whole. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ0-9«+\-])/u).map((s) => s.trim()).filter(Boolean);
}

// « 1er », « 2e », « 13e »: a number with its ordinal suffix, alone (not « 1e5 », « F2e »)
const ORDINAL = /(?<![\p{L}\d.,])(\d+)(er|re|e)(?![\p{L}\d])/gu;

/** French ordinals with their suffix raised (« 1<sup>er</sup> »), in text already escaped. Only in French. */
export const ordinals = (html: string): string => (getLang() === "fr" ? html.replace(ORDINAL, "$1<sup>$2</sup>") : html);

/** Escapes `text`, then raises its ordinals' suffixes. */
export const escText = (text: string): string => ordinals(esc(text));

/** A written summary (a room's strategy, a monster's detail), already spaced: one sentence as a line, several as a
 * bullet list, easier to read at a glance. */
export function prose(text: string, cls: string): string {
  const list = sentences(text);
  if (list.length < 2) return `<div class="${cls}">${escText(text)}</div>`;
  return `<ul class="${cls} bullets">${list.map((s) => `<li>${escText(s)}</li>`).join("")}</ul>`;
}
