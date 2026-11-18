"""Build data/snapshot/*.json (and data/icons/) from Dofensive.

python -m tools.snapshot [--refresh] [--only-dungeons] [--no-icons]
"""

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

from tools.dofensive import USER_AGENT, Dofensive, DofensiveError
from tools.effects import format_effect, spell_categories

ROOT = Path(__file__).resolve().parent.parent
ASSET_BASE = "https://dofensive.com/asset/dofensive/"
_RES_KEYS = (("Neutral", "n"), ("Earth", "e"), ("Fire", "f"), ("Water", "w"), ("Air", "a"))
STATIC_ICONS = (
    [f"characteristics/resper_{e}.webp" for e in ("neutral", "earth", "fire", "water", "air")]
    + [f"hud/{h}.webp" for h in ("health", "ap", "mp")]
    + [f"spell/{s}.webp" for s in ("cost", "critical", "fixed_range", "editable_range")]
    + ["spell/dispell/1.webp"]
)


def _normal_grades(raw: dict) -> list:
    """Grades 1-5 are the monster's normal grades; extra ones (special scaled versions) are ignored when present."""
    grades = raw.get("Grades") or []
    normal = [g for g in grades if g.get("Id", 0) <= 5]
    return normal or grades


_EVENT_FAMILIES = {"créatures de nowel", "créatures de pwâk"}
# event creatures Dofensive files under an ordinary family, met in ordinary zones: the Leprechauns (Saint-Patwick),
# Halouine's Bouftou and Tofu, Ballotin le Bouftou (owner, 2026-11-09)
_EVENT_MONSTERS = {7859, 7886, 7887, 7888, 7889, 7890, 7891, 7892, 7893, 7894, 7895, 793, 794, 1232}


def monster_kind(raw: dict) -> str:
    """Why a creature has several entries in Dofensive: one per context it fights in.
    normal (lives in a sub-area or a dungeon), archmonster, expedition, wanted (avis de recherche), special (not met by
    chance: quest creatures, with or without a place, and zone creatures with a single level and no map of their own:
    mini-dungeon and raid bosses, chests, tutorial creatures), event (Nowel, Pwâk), summon (summoned by a monster),
    player_summon (class or Dopeul summons), nowhere (other creatures with no place). In a zone the overlay lists them
    in that order."""
    race = ((raw.get("Race") or {}).get("Name") or "").lower()
    family = ((raw.get("Family") or {}).get("Name") or "").lower()
    areas = [s["Name"] for s in raw.get("Subareas") or []]
    if race.startswith("avis de recherche"):
        return "wanted"
    if areas and not raw.get("Dungeons") and all(a.lower().startswith("expédition") for a in areas):
        return "expedition"
    if raw.get("Dungeons"):
        return "normal"
    if areas:
        if family == "créatures archimonstres":
            return "archmonster"
        if family == "créatures de quête":
            return "special"
        if family in _EVENT_FAMILIES or raw.get("Id") in _EVENT_MONSTERS:
            return "event"
        # the zone's own monsters come at several levels and have maps they live on; a creature fought at one level
        # with no map is met another way (Krtek's mine, the raids' bosses, a chest): owner, 2026-11-09
        if not raw.get("PreferredMaps") and len({g["Level"] for g in _normal_grades(raw)}) == 1:
            return "special"
        return "normal"
    if race == "invocations de monstre":
        return "summon"
    if family == "créatures invoquées":
        return "player_summon"
    if family == "créatures de quête":
        return "special"
    return "nowhere"


def trim_monster(raw: dict) -> dict:
    grades = _normal_grades(raw)
    top = max(grades, key=lambda g: (g["Level"], g["LifePoints"])) if grades else {}
    res = top.get("PercentResistances") or {}
    spell_ids = [int(k) for k in (top.get("SpellGrades") or {})] or [s["Id"] for s in raw.get("Spells") or []]
    return {
        "id": raw["Id"],
        "name": raw["Name"],
        "boss": raw.get("Type") == 3,
        "levelMin": min((g["Level"] for g in grades), default=0),
        "levelMax": max((g["Level"] for g in grades), default=0),
        "hpMin": min((g["LifePoints"] for g in grades), default=0),
        "hpMax": max((g["LifePoints"] for g in grades), default=0),
        "ap": top.get("ActionPoints", 0),
        "mp": top.get("MovementPoints", 0),
        "res": {code: res.get(key, 0) for key, code in _RES_KEYS},
        "spellIds": list(dict.fromkeys(spell_ids)),
        "dungeonIds": [d["Id"] for d in raw.get("Dungeons") or []],
        "subareas": [s["Name"] for s in raw.get("Subareas") or []],
        "kind": monster_kind(raw),
    }


def effect_target(e: dict) -> str:
    """Who an effect hits: "enemies", "allies" (and the caster), "self" (the caster only) or "all"."""
    names = " ".join((m.get("Name") or "").lower() for m in e.get("InclusionMasks") or [])
    enemies, allies = "ennemis" in names, "alliés" in names
    if enemies and allies:
        return "all"
    if enemies:
        return "enemies"
    if allies:
        return "allies"
    if "lanceur" in names:
        return "self"
    return "all"


# The game's area types (Dofensive "Zone.Type") → a short id; the drawing and the French label live in the app.
_ZONE_TYPES = {
    5: "ligne", 6: "ligne-lanceur", 7: "ligne-perp", 8: "cercle", 9: "cercle-inversé", 10: "demi-cercle",
    11: "carré", 12: "carré-inversé", 13: "carré-sans-diag", 14: "rectangle", 15: "croix", 16: "croix-diag",
    17: "étoile", 18: "cône", 19: "boomerang", 20: "damier", 21: "fourche",
}


def effect_zone(e: dict):
    """The area as "<shape> <size>[ <second number>]" ("cercle 2", "cercle 3 1" = rings 1 to 3, "rectangle 1 3"),
    "toute la carte", "cases" (fixed cells), or None for the single targeted cell. A size of 60+ means unlimited."""
    zone = e.get("Zone") or {}
    kind = zone.get("Type")
    if kind in (1, 2):
        return "toute la carte"
    if kind == 4:
        return "cases"
    shape = _ZONE_TYPES.get(kind)
    if not shape:
        return None
    params = [p.get("Id") for p in zone.get("Parameters") or [] if isinstance(p.get("Id"), int)]
    size = zone.get("Size") if zone.get("Size") not in (None, -1) else (params[0] if params else 0)
    second = params[1] if len(params) > 1 else None
    if shape == "cercle" and size == 0 and not second:
        return None  # a circle of size 0 is the targeted cell alone
    return f"{shape} {size}" + (f" {second}" if second else "")


def trim_spell(raw: dict, lang: str = "fr") -> dict:
    level = raw["Levels"][-1]
    all_effects = [e for g in level.get("GroupEffects") or [] for e in g["Effects"]]
    effects, seen = [], set()
    for e in all_effects:
        if not e.get("IconType"):
            continue
        text = format_effect(e, lang)
        if not text or text in seen:
            continue
        seen.add(text)
        effects.append({
            "text": text,
            "icon": e["IconType"],
            "dispellable": (e.get("Dispellable") or 0) > 0 and (e.get("Duration") or 0) > 0,
            "target": effect_target(e),
            "zone": effect_zone(e),
        })
    conditions = [format_effect(c, lang) for group in level.get("StateCriteria") or [] for c in group]
    return {
        "id": raw["Id"],
        "name": raw["Name"],
        "ap": level["ActionPoints"],
        "rangeMin": level["MinRange"],
        "rangeMax": level["Range"],
        "editableRange": bool(level["EditableRange"]),
        "lineOfSight": bool(level["CastLineOfSight"]),
        "inLine": bool(level["CastInLine"]),
        "inDiagonal": bool(level.get("CastInDiagonal")),
        "perTurn": level["MaxCastPerTurn"],
        "perTarget": level["MaxCastPerTarget"],
        "cooldown": level["MinCastInterval"],
        "initialCooldown": level["InitialCooldown"],
        "critical": level["CriticalProbability"],
        "categories": spell_categories(all_effects),
        "effects": effects,
        "conditions": conditions,
    }


def trim_dungeon(raw: dict, maps: dict) -> dict:
    out_maps = []
    for m in raw.get("Maps") or []:
        full = maps.get(m["Id"]) or {}
        coords = full.get("Coordinates") or {}
        out_maps.append({
            "id": m["Id"],
            "name": m["Name"],
            "x": coords.get("X"),
            "y": coords.get("Y"),
            "boss": bool(full.get("IsBossMap")),
        })
    return {
        "id": raw["Id"],
        "name": raw["Name"],
        "level": raw["Level"],
        "monsterIds": [m["Id"] for m in raw.get("Monsters") or []],
        "maps": out_maps,
    }


def _write(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def build(api, out_dir: Path, only_dungeons: bool = False, log=print, overrides: dict | None = None,
          lang: str = "fr") -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_dungeons = api.get("dungeons/preview")
    maps = {}
    for d in raw_dungeons:
        for m in d.get("Maps") or []:
            try:
                maps[m["Id"]] = api.get(f"maps/{m['Id']}")[0]
            except (DofensiveError, IndexError) as e:
                log(f"map {m['Id']}: {e!r}")
    dungeons = [trim_dungeon(d, maps) for d in raw_dungeons]
    # data/overrides.json: monsters a dungeon really has but Dofensive does not list (checked by the user)
    added = {}
    for did, rule in ((overrides or {}).get("dungeons") or {}).items():
        for d in dungeons:
            if str(d["id"]) == str(did):
                for mid in rule.get("addMonsters", []):
                    if mid not in d["monsterIds"]:
                        d["monsterIds"].append(mid)
                    added.setdefault(mid, []).append(d["id"])
    if only_dungeons:
        monster_ids = list(dict.fromkeys(i for d in dungeons for i in d["monsterIds"]))
    else:
        monster_ids = list(dict.fromkeys([m["Id"] for m in api.get("monsters/preview")] + list(added)))
    monsters = []
    for n, mid in enumerate(monster_ids, 1):
        try:
            m = trim_monster(api.get(f"monsters/{mid}")[0])
            m["dungeonIds"] = list(dict.fromkeys(m["dungeonIds"] + added.get(mid, [])))
            monsters.append(m)
        except (DofensiveError, IndexError, KeyError) as e:
            log(f"monster {mid}: {e!r}")
        if n % 200 == 0:
            log(f"{n}/{len(monster_ids)} monsters")
    spell_ids = list(dict.fromkeys(s for m in monsters for s in m["spellIds"]))
    spells = []
    for sid in spell_ids:
        try:
            spells.append(trim_spell(api.get(f"spells/{sid}")[0], lang))
        except (DofensiveError, IndexError, KeyError) as e:
            log(f"spell {sid}: {e!r}")
    known = {s["id"] for s in spells}
    for m in monsters:
        m["spellIds"] = [s for s in m["spellIds"] if s in known]
    _write(out_dir / "dungeons.json", dungeons)
    _write(out_dir / "monsters.json", monsters)
    _write(out_dir / "spells.json", spells)
    return {"dungeons": dungeons, "monsters": monsters, "spells": spells}


def icon_paths(snapshot: dict) -> list:
    paths = list(STATIC_ICONS)
    paths += [f"spells/{s['id']}.webp" for s in snapshot["spells"]]
    paths += [f"monsters/{m['id']}.webp" for m in snapshot["monsters"]]
    icons = sorted({e["icon"] for s in snapshot["spells"] for e in s["effects"]})
    paths += [f"spell/effect/{i}.webp" for i in icons]
    return paths


def download_icons(paths: list, out_dir: Path, delay: float = 0.3, opener=urllib.request.urlopen, log=print) -> list:
    """Fetch missing icons, write index.json (the icon paths present), return that list."""
    out_dir = Path(out_dir)
    for n, rel in enumerate(paths, 1):
        target = out_dir / rel
        if target.exists():
            continue
        # spell and monster icons have no extension on Dofensive
        remote = rel[:-5] if rel.startswith(("spells/", "monsters/")) else rel
        if delay:
            time.sleep(delay)
        try:
            req = urllib.request.Request(ASSET_BASE + remote, headers={"User-Agent": USER_AGENT})
            with opener(req) as resp:
                kind, body = resp.headers.get("Content-Type", ""), resp.read()
        except OSError as e:
            log(f"icon {rel}: {e!r}")
            continue
        if kind.startswith("image"):
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)
        else:
            log(f"icon {rel}: not an image ({kind or 'no type'})")
        if n % 500 == 0:
            log(f"{n}/{len(paths)} icons")
    out_dir.mkdir(parents=True, exist_ok=True)
    present = sorted(p.relative_to(out_dir).as_posix() for p in out_dir.rglob("*.webp"))
    _write(out_dir / "index.json", present)
    return present


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--only-dungeons", action="store_true")
    parser.add_argument("--no-icons", action="store_true")
    parser.add_argument("--lang", default="fr", choices=["fr", "en"],
                        help="en writes the English names and texts to data/snapshot/en (same ids, no icons)")
    args = parser.parse_args(argv)
    cache = ROOT / ".cache" / ("dofensive" if args.lang == "fr" else f"dofensive-{args.lang}")
    api = Dofensive(cache, refresh=args.refresh, lang=args.lang)
    overrides_file = ROOT / "data" / "overrides.json"
    overrides = json.loads(overrides_file.read_text(encoding="utf-8")) if overrides_file.exists() else None
    out = ROOT / "data" / "snapshot" / ("" if args.lang == "fr" else args.lang)
    snap = build(api, out, only_dungeons=args.only_dungeons, overrides=overrides, lang=args.lang)
    print(f"{len(snap['dungeons'])} dungeons, {len(snap['monsters'])} monsters, {len(snap['spells'])} spells", flush=True)
    if args.lang != "fr":
        # the monster kind is read from French race and family names: take it from the French snapshot (same ids)
        kinds = {m["id"]: m.get("kind") for m in json.loads((ROOT / "data" / "snapshot" / "monsters.json").read_text(encoding="utf-8"))}
        for m in snap["monsters"]:
            m["kind"] = kinds.get(m["id"], m.get("kind"))
        _write(out / "monsters.json", snap["monsters"])
        return 0
    if not args.no_icons:
        present = download_icons(icon_paths(snap), ROOT / "data" / "icons")
        print(f"{len(present)} icons", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
