import json

from tests.tools.conftest import load
from tools.snapshot import build, trim_dungeon, trim_monster, trim_spell


def test_trim_monster_dechireuse():
    m = trim_monster(load("monsters_8037")[0])
    assert m["name"] == "Déchireuse"
    assert m["boss"] is True
    assert m["levelMin"] == m["levelMax"] == 220
    assert (m["hpMin"], m["hpMax"]) == (13000, 18000)
    assert m["res"] == {"n": 25, "e": 20, "f": 15, "w": 15, "a": 20}
    assert 30921 in m["spellIds"]
    assert m["dungeonIds"] == [165]
    assert m["subareas"] == ["Autel de la Déchireuse"]


def test_trim_spell_hemorasoir():
    s = trim_spell(load("spells_30921")[0])
    assert (s["ap"], s["rangeMin"], s["rangeMax"]) == (3, 1, 4)
    assert s["lineOfSight"] is True
    assert (s["perTurn"], s["perTarget"], s["critical"]) == (2, 1, 20)
    assert s["categories"] == ["dmg_f"]
    assert s["conditions"] == ["Ne pas posséder l'état Barbarisme"]
    assert s["effects"][0] == {"text": "46 à 54 dommages Feu", "icon": 7, "dispellable": False, "target": "all", "zone": None}


def test_trim_spell_drops_duplicate_and_iconless_effects():
    s = trim_spell(load("spells_30921")[0])
    texts = [e["text"] for e in s["effects"]]
    assert len(texts) == len(set(texts))
    assert all(e["icon"] != 0 for e in s["effects"])


def test_dispellable_needs_a_duration():
    s = trim_spell(load("spells_338")[0])
    puissance = next(e for e in s["effects"] if e["text"] == "-150 Puissance (1 tour)")
    assert puissance["dispellable"] is True


def test_trim_dungeon_autel():
    raw = next(d for d in load("dungeons_preview") if d["Name"] == "Autel de la Déchireuse")
    d = trim_dungeon(raw, {236716546: load("maps_236716546")[0]})
    assert d["level"] == 200
    assert d["monsterIds"] == [8037, 8040, 8039, 8038]
    assert d["maps"] == [{"id": 236716546, "name": "Autel de la Déchireuse - Salle du rituel", "x": 12, "y": 2, "boss": True}]


class FakeApi:
    """Serves fixtures; dungeons/preview limited to the Autel."""
    def get(self, path):
        if path == "dungeons/preview":
            return [d for d in load("dungeons_preview") if d["Id"] == 165]
        if path == "monsters/preview":
            return [{"Id": 8037, "Name": "Déchireuse", "Type": 3, "Dungeons": [{"Id": 165}]}]
        if path.startswith("monsters/") and path != "monsters/8037":
            return load("monsters_8037")  # stand-in for the other three
        name = path.replace("/", "_")
        try:
            return load(name)
        except FileNotFoundError:
            return load("spells_30921") if path.startswith("spells/") else load("maps_236716546")


def test_build_writes_snapshot(tmp_path):
    build(FakeApi(), tmp_path, only_dungeons=True)
    dungeons = json.loads((tmp_path / "dungeons.json").read_text(encoding="utf-8"))
    monsters = json.loads((tmp_path / "monsters.json").read_text(encoding="utf-8"))
    spells = json.loads((tmp_path / "spells.json").read_text(encoding="utf-8"))
    assert [d["id"] for d in dungeons] == [165]
    assert {m["id"] for m in monsters} >= {8037}
    assert all(sid in {s["id"] for s in spells} for m in monsters for sid in m["spellIds"])


def test_special_grades_are_ignored():
    # grades 6-8 of the Wa Wabbit (levels 75, 130, 200) have no resistances: not the dungeon monster
    m = trim_monster(load("monsters_180")[0])
    assert (m["levelMin"], m["levelMax"]) == (60, 60)
    assert (m["hpMin"], m["hpMax"]) == (2600, 3300)
    assert m["res"] == {"n": 28, "e": 28, "f": 18, "w": -7, "a": -12}


def test_committed_snapshot_has_no_raw_ids_or_templates():
    import re
    from pathlib import Path
    spells = json.loads((Path(__file__).resolve().parents[2] / "data" / "snapshot" / "spells.json").read_text(encoding="utf-8"))
    texts = [e["text"] for s in spells for e in s["effects"]] + [c for s in spells for c in s["conditions"]]
    bad = [t for t in texts if re.search(r"^(Invoque : |État )\d+( \(\d+ tours?\))?$|^\d{3,} \(|Dommagess|[#{}|~]", t)]
    assert bad == []


def test_overrides_add_a_monster_missing_from_a_dungeon(tmp_path):
    overrides = {"dungeons": {"165": {"addMonsters": [8999], "why": "test"}}}

    class WithExtra(FakeApi):
        def get(self, path):
            if path == "monsters/8999":
                raw = dict(load("monsters_8037")[0], Id=8999, Name="Chafer Draugr", Type=0, Dungeons=[])
                return [raw]
            return super().get(path)

    build(WithExtra(), tmp_path, only_dungeons=True, overrides=overrides)
    dungeons = json.loads((tmp_path / "dungeons.json").read_text(encoding="utf-8"))
    monsters = {m["id"]: m for m in json.loads((tmp_path / "monsters.json").read_text(encoding="utf-8"))}
    assert 8999 in dungeons[0]["monsterIds"]
    assert monsters[8999]["name"] == "Chafer Draugr"
    assert 165 in monsters[8999]["dungeonIds"]


def _raw(**over):
    raw = dict(load("monsters_8037")[0])
    raw.update(over)
    return raw


def test_monster_kind():
    assert trim_monster(_raw())["kind"] == "normal"
    expedition = _raw(Dungeons=[], Subareas=[{"Id": 1, "Name": "Expédition - Cour du Bouftou Royal"}])
    assert trim_monster(expedition)["kind"] == "expedition"
    assert trim_monster(_raw(Race={"Id": 9, "Name": "Avis de recherche de Frigost"}))["kind"] == "wanted"
    nowhere = dict(Dungeons=[], Subareas=[])
    summons = dict(nowhere, Family={"Id": 1, "Name": "Créatures invoquées"})
    assert trim_monster(_raw(**summons, Race={"Id": 1, "Name": "Invocations de monstre"}))["kind"] == "summon"
    assert trim_monster(_raw(**summons, Race={"Id": 2, "Name": "Invocations de classe Osamodas"}))["kind"] == "player_summon"
    assert trim_monster(_raw(**nowhere, Family={"Id": 3, "Name": "Créatures de quête"}))["kind"] == "special"
    assert trim_monster(_raw(**nowhere, Family={"Id": 4, "Name": "Créatures diverses"}))["kind"] == "nowhere"
    zone = {"Dungeons": [], "Subareas": [{"Id": 2, "Name": "Plaines de Cania"}]}
    assert trim_monster(_raw(**zone, Family={"Id": 5, "Name": "Créatures Archimonstres"}))["kind"] == "archmonster"
    assert trim_monster(_raw(**zone, Family={"Id": 3, "Name": "Créatures de quête"}))["kind"] == "special"
    assert trim_monster(_raw(**zone, Family={"Id": 6, "Name": "Créatures de Nowel"}))["kind"] == "event"
    # a zone creature with one level and no map of its own is not met by chance (Krtek, a chest, a raid boss)
    one_level = dict(zone, Family={"Id": 7, "Name": "Créatures d'Amakna"}, PreferredMaps=[])
    assert trim_monster(_raw(**one_level))["kind"] == "special"
    assert trim_monster(_raw(**dict(one_level, PreferredMaps=[{"Id": 1, "Name": "x"}])))["kind"] == "normal"
    grades = [dict(g, Level=10 * g["Id"]) for g in _raw()["Grades"]]
    assert trim_monster(_raw(**one_level, Grades=grades))["kind"] == "normal"


def test_full_build_keeps_every_monster(tmp_path):
    class Full(FakeApi):
        def get(self, path):
            if path == "monsters/preview":
                return [{"Id": 8037}, {"Id": 7001}]
            if path == "monsters/7001":
                return [dict(load("monsters_8037")[0], Id=7001, Name="Bouftou", Type=0, Dungeons=[], Subareas=[])]
            return super().get(path)

    build(Full(), tmp_path)
    ids = {m["id"] for m in json.loads((tmp_path / "monsters.json").read_text(encoding="utf-8"))}
    assert {8037, 7001} <= ids


def _effects(spell_id):
    return trim_spell(load(f"spells_{spell_id}")[0])["effects"]


def test_effects_say_who_they_hit_and_where():
    heal = next(e for e in _effects(992) if "soins" in e["text"])  # Régénération Spontanée
    assert heal["target"] == "allies" and heal["zone"] == "cercle 2"
    rinse = _effects(991)[0]  # Rinçage: shortens the enemies' effects around him
    assert rinse["target"] == "enemies" and rinse["zone"] == "cercle 2"
    reflect = _effects(10207)[0]  # Klounerie
    assert reflect["target"] == "self"
    onde = _effects(10213)  # Onde Enrageante: -Force to enemies, +Puissance to allies
    assert [e["target"] for e in onde] == ["enemies", "allies"]


def test_zone_uses_the_game_area_type():
    from tools.snapshot import effect_zone
    z = lambda t, size, *params: {"Zone": {"Type": t, "Size": size, "Parameters": [{"Id": p} for p in params]}}
    assert effect_zone(z(17, 2, 2)) == "étoile 2"
    assert effect_zone(z(16, 1, 1)) == "croix-diag 1"
    assert effect_zone(z(8, 3, 3, 1)) == "cercle 3 1"
    assert effect_zone(z(9, 63, 63, 5)) == "cercle-inversé 63 5"
    assert effect_zone(z(14, 1, 1, 3)) == "rectangle 1 3"
    assert effect_zone(z(2, -1)) == "toute la carte"
    assert effect_zone(z(3, -1)) is None
    assert effect_zone(z(8, 0, 0)) is None
