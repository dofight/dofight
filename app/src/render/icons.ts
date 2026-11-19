/** The navigation icons of the panel (chevron, back, undo, external link), drawn inline so they take the text colour
 * of any theme (currentColor) and need no file. One stroke for all of them: 2 units, round, in a 24-unit box; the
 * size is set in styles.css (.ic). The static HTML asks for one with `data-icon="<name>"` (see applyIcons). */
const PATHS = {
  // « › »: a folding row or picker; CSS turns it down when open
  chevron: "m9 18 6-6-6-6",
  // « ← »: back to the previous view
  back: "M19 12H5m7 7-7-7 7-7",
  // « – »: hide the panel (a short stroke, as narrow as the other icons)
  minus: "M7 12h10",
  // « × »: quit Dofight
  close: "M18 6 6 18M6 6l12 12",
  // « ↺ »: back to a previous state (the zone the player is in, the hovered group cleared)
  undo: "M3 3v5h5M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
  // « ⓘ »: a mechanic's sheet (hover it); its stem and dot are added by `icon` (thicker, so they show at 18 px)
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
  // « ↗ »: opens outside the panel (the browser)
  external: "M7 7h10v10M7 17 17 7",
  // two sheets: copies a command (to paste in the game chat)
  copy: "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2ZM4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2",
  // a gear: the settings
  gear: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  // « ☰ »: the menu (suggestion, Discord, support)
  menu: "M4 6h16M4 12h16M4 18h16",
  // a padlock, closed: the panel can't be moved or resized; open: it can
  lock: "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2ZM7 11V7a5 5 0 0 1 10 0v4",
  unlock: "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2ZM7 11V7a5 5 0 0 1 9.9-1",
  // a pencil: write a suggestion
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z",
  // a heart: support the project
  heart: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
  // a spell's range: « + » with four arrows, cast in a line
  inLine: "M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5",
  // « × » with four arrows, cast in a diagonal
  inDiagonal: "m5 5 14 14M19 5 5 19M5 5h3.5M5 5v3.5M19 19h-3.5M19 19v-3.5M19 5h-3.5M19 5v3.5M5 19h3.5M5 19v-3.5",
  // a crossed eye: cast without line of sight
  noSight: "M10.7 5.1A10.7 10.7 0 0 1 22 11.7a1 1 0 0 1 0 .7 10.7 10.7 0 0 1-1.4 2.5M14.1 14.2a3 3 0 0 1-4.2-4.2M17.5 17.5A10.7 10.7 0 0 1 2.1 12.3a1 1 0 0 1 0-.7 10.7 10.7 0 0 1 4.4-5.1M2 2l20 20",
} as const;

export type IconName = keyof typeof PATHS;

/** Drawn on top of the « ⓘ » ring: a thick stem and a filled dot (the stroked dot of one path was barely visible). */
const INFO_MARK = `<path d="M12 11v6" stroke-width="2.4"/><circle cx="12" cy="7.4" r="1.5" fill="currentColor" stroke="none"/>`;

export const icon = (name: IconName): string =>
  `<svg class="ic ic-${name}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${PATHS[name]}"/>${name === "info" ? INFO_MARK : ""}</svg>`;

/** Draws the icon named by `data-icon` inside each element of the page that asks for one. */
export function applyIcons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => {
    const name = el.dataset.icon as IconName;
    if (name in PATHS) el.innerHTML = icon(name);
  });
}
