# Reading grid: how Dofight summaries are written

Summaries are what makes Dofight worth opening. They are short, identical in form for identical behaviour, and only
say what changes how a fight is played. This grid is applied to every dungeon; the user's review corrections are
added here as rules (section "Rulings from reviews"), never only fixed in one dungeon.

Source: the Dofus pour les Noobs (DPLN) guide of the dungeon, checked against the
game data of each monster's spells. Never invent: what the guide does not support is not written.

## Output (per dungeon, `data/summaries/dungeons/<dungeonId>.json`)

```json
{
  "dungeonId": 1,
  "dungeon": "Cour du Bouftou Royal",
  "guide": "https://www.dofuspourlesnoobs.com/cour-du-bouftou-royal.html",
  "guideUpdated": "21/06/2026",
  "status": "draft",
  "strategy": "Une ou deux phrases : les mécaniques du donjon et de ses monstres (pas du boss).",
  "monsters": {
    "147": { "tags": [{ "id": "one_shot", "param": "au CaC sous 50 % PV" }], "detail": "Optionnel, 1-2 phrases." }
  }
}
```

- Keys of `monsters` are game monster ids of that dungeon. Every monster of the dungeon appears, even with
  `"tags": []`.
- `status`: `draft` (generated) → `reviewed` (the user read it and agreed). Only the user moves a dungeon to `reviewed`.
- Tag ids, categories, labels and parameter kinds: `data/summaries/vocabulary.json`. A tag not in the vocabulary is
  not allowed; propose a new one in the review questions instead.

## What earns a tag

1. **Danger** (red, shown first): what can kill a character or lose the fight.
   - `one_shot`: the guide says it can kill a character in one hit or one turn; the parameter says when.
   - `invulnerable`: the monster cannot be damaged until something happens; the parameter says what lifts it.
   - `big_damage`: much stronger than the other monsters of the room, or a single spell the guide warns about.
   - `area_damage` only when the guide insists on spreading out or the zone is the main threat (e.g. Grand Ougah).
     Having an area spell is not enough.
   - `heals`, `removes`, `steals`, `reflect`, `team_damage`: only when the guide calls it a problem.
2. **Conseil** (blue): an action the player should take: placement (`no_melee_end`, `out_of_sight`, `spread_out`,
   `lock`, `reduce_range`), `dispel`, `hit_element` (only for a clear weakness the guide recommends). `kill_condition`
   « Pour le tuer » for a monster that only dies when a condition is met (the Krobes: « 3 tours sans aucun soin »). No kill order:
   it is subjective (user, 2026-11-07).
3. **Mécanique** (yellow): how the monster works when it matters to plan the fight: `phase`, `summons`,
   `buffs_allies`, `moves`, `glyphs`, `flees`, `state`.

Choosing between them (owner, 2026-11-09): a badge whose text reads as an instruction to the player (« Ne pas… »,
« Le taper… ») is a **Conseil**; one that describes the monster (« il invoque… », « il se téléporte… ») is a
**Mécanique**; **Danger** is kept for what can kill a character or lose the fight. When a mechanic's whole use is an
action the player takes, write the action as a tip (Capitaine Ekarlatte: « Le taper pour se soigner », not « État :
le taper te soigne »).

## What does not earn a tag

- Things every monster does (it hits, it moves, it has an area spell nobody worries about).
- Exact damage numbers: guides and the game data's base values differ. Say « gros dégâts », not « 240 ».
- Achievements (Hardi, Blitzkrieg, Duo...): out of scope.
- Loot, keys, quests, access to the dungeon.

## Form

- At most 6 tags per monster (`limits.tagsPerMonster`), most important first; danger before tip before mechanic.
- Parameters in French, at most 32 characters, no final full stop, no exact numbers unless they are the mechanic
  (« à 50 % PV » is fine).
- `detail`: only for what no tag can say (a seasonal unlock, a sequence of steps). At most 240 characters.
- `strategy`: one or two sentences, at most 220 characters: the dungeon's and its monsters' mechanics, what to
  avoid (never the boss: see the 2026-11-08 ruling below).
- A harmless monster gets `"tags": []`; the app shows « Rien de dangereux à signaler ».
- Monster names in parameters as written in the game (accents kept).

## Mechanic sheets (`data/summaries/mechanics.json`)

A mechanic too big for a badge or the strategy (a cycle of phases, a colour → element list, steps to make a boss
vulnerable, a per-season table) gets a sheet, keyed by an English id, and the rooms that have it list that id in
`"mechanics"`. The room header shows a chip (« ⓘ Cycle lunaire »); hovering it shows the sheet beside the panel.

- Form: `title`, `gist` (one sentence: what the mechanic is), `points` (1 to 12, one row each, at most 160
  characters, in the order the fight follows), `guide` (the DPLN section, with its anchor), `status` (`draft` until
  the owner reviews it).
- One sheet for one mechanic, shared by every room that has it (Torkélonia and Crocuzko share `lunar-cycle`).
- A mechanic of one monster (most often the boss) goes on that monster, not the room: its entry lists the id in
  `"mechanics"` and the chip shows on its card. The room header keeps the sheets that concern every monster of the
  room (lunar cycle, seasonal reaction, dice). Hovering a chip previews its sheet (no link); a click or Enter
  pins it, with a link to its guide section, until a second click, a click elsewhere or Escape (owner,
  2026-11-18). The room header keeps its guide link.
- The room strategy never describes the boss fight (owner, 2026-11-17): a boss mechanic goes on the boss's card,
  and when it does not fit there (detail, badges), into a sheet on the boss.
- A monster detail that only repeats the sheet is shortened or dropped; its badges stay.
- A zone file can carry only `mechanics` (no `strategy`): the panel keeps its generated « À surveiller » list. Its
  `monsters` copy the dungeon's entries so the monsters keep their badges.
- English for the title, gist and points goes into `en.json` in the same change (`validate` checks it).

## Rulings from reviews

- 2026-11-07 (batch 1 review):
  - No kill-order tags (« Tuer en premier / en dernier / ignorer »): subjective. The room summary may still say what
    the guide recommends.
  - New tags: `invisible`, `erodes`, `reduce_range`, `redirects`, `swaps_on_hit`. Up to 5 tags per monster.
  - Room-level tags (`roomTags`) for what applies to the whole room (waves, « Détection des Protecteurs »).
  - Summons are described on the monster that summons them. The Kralamoure's 900 % resistances count as
    `invulnerable`.
  - Guild expeditions are added (as their own entries), not ignored.
  - A monster whose spells all hit at melee range, without moving, summoning, healing, hindering or glyphs, is
    harmless (`"harmless": true`, no question to the user).
  - Read who an effect hits and where (`target`, `zone` on each effect): range 0 + an area = « autour de lui »; a
    heal on the caster only is « lui-même », on his allies « lui et ses alliés »; a bonus given to allies is
    `buffs_allies`; any characteristic removed from enemies (Force, Puissance…) is `removes`; « Dommages Renvoyés »
    is `reflect`; shortening enemies' effects or removing their buffs is `dispels_you` (« Désenvoûte »).
    (User, Château Ensablé: Mob l'Éponge, Pichon Kloune, Pichon Vert.)
  - Every monster's spells are checked, including those the user or the guide called harmless: when the spells show
    a removal, a heal, a move, a summon, a glyph or a ranged hit, badges are proposed and the user confirms.
  - A monster the guide does not discuss gets badges proposed from its spells (`tools/derive.py`, each
    tag `"source": "spells"`); the user validates them.

- The boss is the monster the game data marks as boss, even when the guide calls another monster « le vrai boss »
  (Donjon des Squelettes: the boss is the Chafer Rōnin; the Chafer Draugr is « la menace n°1 », user 2026-11-07).
  Never write « boss » in a parameter for a monster that is not the boss.

- 2026-11-07 (batch 1 validated as a whole by the user):
  - `strategy` gives no order of targets either (« d'abord », « puis », « en dernier », « ignorer »): it says what
    to avoid, how the mechanics work and how the fight is won. A step that triggers a mechanic is fine (« Belladone
    descend quand tous les monstres sont morts »), and so is a timing rule (« pas jusqu'à 6 tant que des monstres
    vivent », Hell Mina).
  - No `lock` tag to stop a monster summoning (« le bloquer pour qu'il n'invoque plus »): rarely used as a strategy.
  - Guild expeditions are the 20 zones « Expédition - <donjon> » (not the negative dungeon ids, which are the Cratère
    Minus versions, Cire Momore and Gargandyas). Their monsters are separate entries with their own spells.
    They are written in `data/summaries/zones/<slug>.json` (same form plus "zone") from the guide's « Expédition de
    guilde » section only; guides without that section give spell badges only.
- 2026-11-07 (batch 2 questions): when the guide and the game data disagree on what a spell does (range, area,
  push or pull, a spell the guide lists but the game data does not have), trust the game data: it is the game data. A
  « Tue la cible » effect is `one_shot`. Effects that hit « les alliés » of a monster mean the monster's allies.
- 2026-11-07 (expedition review): for bosses, follow the guide's description of their spells even when the game data
  lacks an effect (Maître Corbac's Carapace d'Ailes: he stops playing for 2 turns and reflects damage). Exceptions the
  user confirmed: the Bworkette does not teleport. For other monsters, the game data still wins.
- 2026-11-08: no badge for what every wave room does (« invulnérable au 1er tour d'une nouvelle vague »): it is
  implicit. States that hinder a player (Pesanteur, Insoignable, Affaibli, Pacifiste…) get `inflicts`.

- 2026-11-08 (summary pass): every summary was checked against its guide's « Stratégie globale » (the actual plan)
  and « Principe du combat »; expeditions against their « Expédition de guilde » section. Write the strategy from
  « Stratégie globale » first.

- 2026-11-08 (owner): the room `strategy` describes only the dungeon's and its monsters' mechanics (a zone effect,
  summons, waves, what the monsters do and how to handle them). Never the boss: the boss has his own card, so his
  mechanics (how to remove his invulnerability, his phases, when to finish him) go in his badges and `detail`.
  Example: Tertre du long sommeil, the strategy explains the Malterego of the monsters; Hell Mina's Rage and « pas à 6
  avant la mort des monstres » are in her detail. A dungeon whose only mechanic is its boss may have a short or
  empty strategy.
- 2026-11-08 (owner, follow-up): the `strategy` is the dungeon's summary, not one room's: mechanics of the dungeon or
  its monsters that hold in any room. The boss card holds the boss fight (the last room): the boss's mechanics, the
  summons that drive it (Coquilles, Totems, Grokillages), and with several bosses each card explains its own
  mechanic, even when they share it. Empty strategies are fine (the guide link is still shown). No player spell names (« se désenvoûter », not « Jouvence, Lait de Bambou »); the monsters' spell names are fine.
- 2026-11-08 (owner): Huzounet (huzounet.fr/monsters/<id>, « Stratégie ») is a second source for boss mechanics the guide
  lacks; the owner confirms each addition. When it contradicts the game data, the game data wins (Damadrya, Shin Larve).
- 2026-11-08 (owner): no « Taper (élément) » badge and no « faible / résiste en … » advice: the resistances row
  already shows it. Mechanics tied to an element (a glyph, a state, a totem) stay.
- 2026-11-09 (owner, Bouss Baybe): a spell that kills a player's summon and puts an enemy in its place gets the tip
  `no_summon` (« Ne pas invoquer · il les change en ennemis »). Derived from a confirmed list of spells
  (`TURNS_SUMMONS` in `tools/derive.py`): the same game effect also covers a monster turning its own allies or killing
  anyone in melee, which the data does not tell apart.
- 2026-11-09 (owner): wanted-poster monsters get written badges from their DPLN « On recherche » guide, in
  `data/summaries/wanted.json` (an entry per monster, with its `guide` link shown on its card); a written entry
  replaces the badges derived from its spells. Example: Naganita puts Pacifiste on characters more than 2 cells away
  at the start of her turn (`inflicts` « Pacifiste à plus de 2 PO »).
- 2026-11-09 (owner, wanted-poster review): new badges `ranged_resist` « Résiste à distance » with the real
  percentage (« 75 % »; a near-total reduction stays `invulnerable` « à distance »), `dodges_melee` « Esquive au
  CaC », `weapon_immune` « Immunisé aux armes » and the tip `no_ap_mp_removal` « Ne pas lui retirer PA/PM ».
  `invulnerable` still covers a near-total damage reduction (Culbutœuf at melee). A kill order is written when it IS
  the mechanic, and then explained (Nenufor: the first Nufor spreads into twelve and repeats his spell).
- 2026-11-09 (owner): « Soin sur l'attaquant » aimed at the players is a debuff on a character: whoever hits
  that character heals (DPLN: Harpirate, Toxoliath, Kabahal, Buboxor, Culbutœuf). Badge `heals` « ceux qui frappent
  sa cible », derived from the spells too. Capitaine Ekarlatte's Tourbilaule is the other way round in game (hitting
  him heals you: tip `hit_to_heal`); the data does not tell them apart, so an exception is written by hand.
- 2026-11-09 (owner): written badges are checked against the spells (`python -m tools.summaries check`); each
  difference is fixed or reviewed with its reason (`accept`, into `checked.json`). After a game update, run
  `changes` and `check` again.
- 2026-11-17 (owner, after a review of every summary for sense):
  - A text says what happens and why: an instruction carries its reason (« … : sinon il te one-shot »), and a
    pronoun (« il », « lui », « son ») always has one clear owner, or the name is written again.
  - A badge reads as one sentence with its label. `invulnerable` says how to lift it (« Invulnérable · sauf s'il
    n'utilise aucun PM », « tant que … »), never a phrase that reads as the cause. `revives`: « avec 25 % de leurs
    PV », never « de ses PV ». An effect on the player says so (« te téléporte », « sa cible subit … »).
  - The same state twice (`inflicts` « Met en état · X » and `state` « État · X »): keep `inflicts`, its param
    carries the precision.
  - Up to 6 badges per monster.
  - A mechanic sheet can open by click too (for players with the hover preview off).
  - The player is « tu », as in the interface (owner, 2026-11-18): « tu perds », « tes personnages »; instructions
    stay in the infinitive (« rester à distance »).
  - No kill order anywhere, sheets included: it depends on the player's strategy and challenge.
  - States players know (Lourd: a Pandawa cannot carry it; Pesanteur...) and class spells (Raulebaque) are named,
    not explained.
- 2026-11-08 (owner): every summary text has its English in `data/summaries/en.json` (`text`: the whole French
  text → English; `token`: the pieces of the badge parameters derived from spells). `validate` fails on a text with
  no English: a new or changed summary gets its English in the same change. Game names (monsters, dungeons, zones,
  spells, states, characteristics) are the **official Ankama English** from the game client (`data/snapshot/en`, the game's own
  English texts), never guessed: with no official English, keep the French name.
