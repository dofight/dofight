import type { Access } from "./access";
import type { Travel } from "./travel";

export type Element = "n" | "e" | "f" | "w" | "a";

export interface DungeonMap {
  id: number;
  name: string;
  x: number | null;
  y: number | null;
  boss: boolean;
}

export interface Dungeon {
  id: number;
  name: string;
  level: number;
  monsterIds: number[];
  maps: DungeonMap[];
}

export interface Monster {
  id: number;
  name: string;
  boss: boolean;
  levelMin: number;
  levelMax: number;
  hpMin: number;
  hpMax: number;
  ap: number;
  mp: number;
  res: Record<Element, number>;
  spellIds: number[];
  /** The spell it casts as the fight begins (a key in the spells, like spellIds): its states and passive effects. */
  startSpellId?: number;
  /** The states it keeps the whole fight, from that spell (Indéplaçable, Lourd…): drawn before the badges.
   * private/tools/client_snapshot.py lasting_states says which are kept. */
  states?: GameState[];
  dungeonIds: number[];
  subareas: string[];
  /** Why a creature has several entries: normal (lives somewhere), expedition, wanted (avis de recherche), summon
   * (by a monster), player_summon (class or Dopeul), special (not met by chance: quest creatures, raid or mini-dungeon bosses, chests), nowhere. Non-normal ones are labelled and listed after. */
  kind?: "normal" | "archmonster" | "expedition" | "wanted" | "summon" | "player_summon" | "special" | "event" | "nowhere";
}

/** A state of the game as the client names and explains it. */
export interface GameState {
  name: string;
  /** The game's description, else its rules one per line. */
  text: string;
  /** Its picture: data/icons/states/<icon>.webp. */
  icon: string;
}

export interface SpellEffect {
  text: string;
  icon: number;
  dispellable: boolean;
  /** Who it hits: enemies, allies (and the caster), self (the caster only), all. */
  target?: "enemies" | "allies" | "self" | "all";
  /** Its area ("cercle 2", "ligne 8"…), null for a single cell. */
  zone?: string | null;
  /** When it fires, if not at once: « Si dommages subis en mêlée », « En début de tour »… (the game's trigger,
   * private/tools/client_triggers.py; absent when the trigger is not known for sure). */
  trigger?: string;
  /** The effects of the spell this one casts or places (« Braise » → « Brûlis » → « 26 à 35 vol Feu »). */
  then?: SpellEffect[];
  /** Its area only reaches the targets the caster sees (the Ravalame's Frappe Cardinale, over the whole map). */
  inSight?: boolean;
  /** The same line as an `inSight` one beside it, but needing no line of sight (Frappe Cardinale's second branch). */
  outOfSight?: boolean;
}

export interface Spell {
  /** The spell's key in the snapshot: its game id, or grade × 1 000 000 + id when a monster casts a grade other than
   * the last one (tools/snapshot.py spell_key). */
  id: number;
  /** Set with a grade key: the game id (its icon) and the grade. */
  spellId?: number;
  grade?: number;
  name: string;
  ap: number;
  rangeMin: number;
  rangeMax: number;
  editableRange: boolean;
  lineOfSight: boolean;
  inLine: boolean;
  /** Cast in a diagonal only (older snapshots lack it). */
  inDiagonal?: boolean;
  perTurn: number;
  perTarget: number;
  cooldown: number;
  initialCooldown: number;
  critical: number;
  categories: string[];
  effects: SpellEffect[];
  conditions: string[];
}

export type TagKind = "danger" | "tip" | "mechanic";

/** One tag of a summary: an id from the vocabulary and an optional short parameter. */
export interface Tag {
  id: string;
  param?: string;
}

/** A dungeon's challenge achievement (data/snapshot/achievements.json), its texts as the game writes them. */
export interface Achievement {
  id: number;
  /** The part in brackets of its name: « Premier », « Spécial ». */
  kind: string;
  /** Whose it is (the name before the brackets): a dungeon with several bosses groups its rows by boss. */
  boss: string;
  /** The challenge's own name (« La vie est une chausse-trappe »), shown after the kind when it differs. */
  challenge: string;
  rule: string;
  /** data/icons/challenges/<icon>.png */
  icon: number;
}

/** A mechanic too big for a badge (data/summaries/mechanics.json): its sheet, shown on hovering its chip. */
export interface Mechanic {
  title: string;
  gist: string;
  points: string[];
  guide?: string;
  status?: "draft" | "reviewed";
}

export interface MonsterSummary {
  tags: Tag[];
  detail?: string;
  /** Ids of its own mechanic sheets (data/summaries/mechanics.json), shown as chips on its card. */
  mechanics?: string[];
  /** Its own guide (a wanted poster's DPLN page); a dungeon monster's guide is its dungeon's. */
  guide?: string;
}

/** One dungeon's summary (data/summaries/dungeons/<id>.json), monsters keyed by monster id. */
export interface RoomSummary {
  /** Set for a zone summary (guild expeditions: « Expédition - Cour du Bouftou Royal »). */
  zone?: string;
  dungeonId: number;
  dungeon: string;
  status: "draft" | "reviewed";
  /** Absent for a zone whose file only adds mechanics: the panel then writes its « À surveiller » list. */
  strategy?: string;
  guide?: string;
  guideUpdated?: string;
  guideWarning?: string;
  /** What applies to the whole room (waves, a rule for every monster). */
  roomTags?: Tag[];
  /** Ids of mechanics.json sheets: a chip each in the room header. */
  mechanics?: string[];
  /** The summons that drive a boss fight, by boss id: shown as cards right under the boss. */
  bossSummons?: Record<string, number[]>;
  monsters: Record<string, MonsterSummary>;
}

export interface TagSpec {
  category: TagKind;
  label: string;
  /** The English label (the app's English interface); `label` is the French one. */
  labelEn?: string;
  param: string;
  icon: string | null;
}

export interface Vocabulary {
  tags: Record<string, TagSpec>;
  /** A state's own icon by its French or official English name (data/summaries/vocabulary.json « stateIcons »). */
  stateIcons?: Record<string, string>;
}

export interface Snapshot {
  dungeons: Map<number, Dungeon>;
  monsters: Map<number, Monster>;
  spells: Map<number, Spell>;
  summaries: Map<number, RoomSummary>;
  vocabulary: Vocabulary;
  icons: Set<string>;
  /** Badges of every monster wherever it is met: its dungeon summary entry, else derived from its spells. */
  monsterSummaries?: Map<number, MonsterSummary>;
  /** Each dungeon's challenge achievements, by dungeon id (data/snapshot/achievements.json). */
  achievements?: Map<number, Achievement[]>;
  /** The anomaly bosses' own challenge achievements, by monster id (data/snapshot/boss-achievements.json). */
  bossAchievements?: Map<number, Achievement[]>;
  /** Mechanic sheets by id (data/summaries/mechanics.json). */
  mechanics?: Map<string, Mechanic>;
  /** Written summaries of zones (guild expeditions), keyed by the zone name. */
  zoneSummaries?: Map<string, RoomSummary>;
  /** Where dungeons, zones and zaaps are (data/travel.json). */
  travel?: Travel;
  /** Map coordinates (« x,y ») → the zones with monsters there, named as the snapshot names them: finds the zone when
   * the OCR garbles its name but reads the coordinates. */
  places?: Map<string, string[]>;
  /** Zone → its area (« Lac gelé » → « Île de Frigost »), named as the snapshot names them: a header read with only
   * its area still points to the one zone of that area at its coordinates. */
  areas?: Map<string, string>;
  /** What each dungeon and area needs before going there (data/access.json). */
  access?: Access;
  /** Map coordinates (« x,y ») → the sub-areas without monsters there (data/travel.json emptyPlaces). */
  emptyAt?: Map<string, string[]>;
}

/** What the panel shows; Settings extends it. */
export interface Display {
  roomSummary: boolean;
  thumbnails: boolean;
  tagsDanger: boolean;
  tagsTip: boolean;
  tagsMechanic: boolean;
  resistances: boolean;
  spells: boolean;
  spellBadges: boolean;
  details: boolean;
  hoverPeek?: boolean; // hovering a spell shows its sheet beside the panel: no native tooltip over it then
  suggest?: boolean; // the « Suggestion » button at the bottom of the results (the settings' example has none)
  showSpecial?: boolean; // special creatures (quest creatures, mini-dungeon and raid bosses, chests…) in zone lists; false hides them
  showArch?: boolean; // archmonsters in zone lists; false hides them
  showWanted?: boolean; // wanted-poster monsters (avis de recherche) in zone lists; false hides them
  showEvent?: boolean; // event creatures (Halouine, Nowel, Leprechauns…) in zone lists; false hides them
}
