import json
from pathlib import Path

import pytest

from tools.summaries import build_index, untranslated, untranslated_mechanics, validate, validate_mechanics

ROOT = Path(__file__).resolve().parents[2]
VOCAB = json.loads((ROOT / "data" / "summaries" / "vocabulary.json").read_text(encoding="utf-8"))
SNAPSHOT = {
    "dungeons": [{"id": 1, "name": "Cour du Bouftou Royal", "level": 30, "monsterIds": [147, 101], "maps": []}],
    "monsters": [{"id": 147, "name": "Bouftou Royal"}, {"id": 101, "name": "Bouftou"}],
}


def summary(**over):
    base = {
        "dungeonId": 1,
        "dungeon": "Cour du Bouftou Royal",
        "status": "draft",
        "strategy": "Tuer les Bouftous puis le Bouftou Royal.",
        "monsters": {"147": {"tags": [{"id": "big_damage", "param": "CaC"}]}, "101": {"tags": []}},
    }
    base.update(over)
    return base


def test_valid_file_has_no_error():
    assert validate(summary(), VOCAB, SNAPSHOT) == []


def test_unknown_tag():
    errors = validate(summary(monsters={"147": {"tags": [{"id": "laser"}]}, "101": {"tags": []}}), VOCAB, SNAPSHOT)
    assert any("147" in e and "laser" in e for e in errors)


def test_required_param_missing():
    errors = validate(summary(monsters={"147": {"tags": [{"id": "one_shot", "param": ""}]}, "101": {"tags": []}}), VOCAB, SNAPSHOT)
    assert any("one_shot" in e and "param" in e for e in errors)


def test_param_too_long():
    long = "x" * 33
    errors = validate(summary(monsters={"147": {"tags": [{"id": "big_damage", "param": long}]}, "101": {"tags": []}}), VOCAB, SNAPSHOT)
    assert any("32" in e for e in errors)


def test_too_many_tags():
    tags = [{"id": t} for t in ("flees", "buffs_allies", "lock", "spread_out", "no_melee_end", "out_of_sight", "moves")]
    errors = validate(summary(monsters={"147": {"tags": tags}, "101": {"tags": []}}), VOCAB, SNAPSHOT)
    assert any("more than 6 tags" in e for e in errors)


def test_monster_not_in_dungeon_and_missing_monster():
    errors = validate(summary(monsters={"147": {"tags": []}, "999": {"tags": []}}), VOCAB, SNAPSHOT)
    assert any("999" in e for e in errors)
    assert any("101" in e for e in errors)


def test_boss_summons_have_their_own_entry():
    snap = {**SNAPSHOT, "monsters": SNAPSHOT["monsters"] + [{"id": 900, "name": "Disciple"}]}
    ok = summary(bossSummons={"147": [900]}, monsters={**summary()["monsters"], "900": {"tags": []}})
    assert validate(ok, VOCAB, snap) == []
    errors = validate(summary(bossSummons={"147": [900]}), VOCAB, snap)
    assert any("900" in e and "missing" in e for e in errors)
    errors = validate(summary(bossSummons={"5": [901]}), VOCAB, snap)
    assert any("bossSummons: 5" in e for e in errors) and any("summon 901" in e for e in errors)


def test_strategy_too_long():
    assert any("220" in e for e in validate(summary(strategy="x" * 221), VOCAB, SNAPSHOT))


def test_bad_status():
    assert any("status" in e for e in validate(summary(status="done"), VOCAB, SNAPSHOT))


def test_index_keyed_by_dungeon_id(tmp_path):
    folder = tmp_path / "dungeons"
    folder.mkdir()
    (folder / "1.json").write_text(json.dumps(summary(), ensure_ascii=False), encoding="utf-8")
    out = tmp_path / "index.json"
    assert build_index(folder, out) == 1
    assert json.loads(out.read_text(encoding="utf-8"))["1"]["dungeon"] == "Cour du Bouftou Royal"


def test_room_tags_use_the_vocabulary():
    assert validate(summary(roomTags=[{"id": "glyphs", "param": "vagues aux tours 1, 6, 11"}]), VOCAB, SNAPSHOT) == []
    errors = validate(summary(roomTags=[{"id": "laser"}]), VOCAB, SNAPSHOT)
    assert any("room" in e and "laser" in e for e in errors)


def test_order_tags_are_gone():
    errors = validate(summary(monsters={"147": {"tags": [{"id": "kill_first"}]}, "101": {"tags": []}}), VOCAB, SNAPSHOT)
    assert any("kill_first" in e for e in errors)


def test_build_monsters_uses_dungeon_entries_then_spells(tmp_path):
    from tools.summaries import build_monsters
    folder = tmp_path / "dungeons"
    folder.mkdir()
    (folder / "1.json").write_text(json.dumps({"dungeonId": 1, "monsters": {"10": {"tags": [{"id": "flees"}]}}}), encoding="utf-8")
    snap = {
        "monsters": [{"id": 10, "spellIds": []}, {"id": 11, "spellIds": [5]}, {"id": 12, "spellIds": [6]}],
        "spells": [
            {"id": 5, "name": "Gel", "rangeMin": 1, "rangeMax": 5, "categories": ["hinder"], "effects": [{"text": "-2 PM (1 tour)", "target": "enemies"}]},
            {"id": 6, "name": "Crachat", "rangeMin": 1, "rangeMax": 6, "categories": ["dmg_w"], "effects": [{"text": "10 dommages Eau", "target": "enemies"}]},
        ],
    }
    out = tmp_path / "monsters.json"
    assert build_monsters(folder, snap, out) == 3
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["10"] == {"tags": [{"id": "flees"}]}
    assert data["11"]["tags"][0]["id"] == "removes"
    assert data["12"] == {"tags": []}  # a ranged hit alone: no badge, not harmless, but still an entry


def test_build_monsters_writes_an_entry_for_every_monster(tmp_path):
    from tools.summaries import build_monsters
    folder = tmp_path / "dungeons"
    folder.mkdir()
    snap = {"monsters": [{"id": 20, "spellIds": []}, {"id": 21, "spellIds": [99]}], "spells": []}
    assert build_monsters(folder, snap, tmp_path / "monsters.json") == 2
    data = json.loads((tmp_path / "monsters.json").read_text(encoding="utf-8"))
    assert set(data) == {"20", "21"}
    assert all("tags" in entry for entry in data.values())


def test_build_monsters_takes_written_entries_over_spells_but_after_dungeons(tmp_path):
    from tools.summaries import build_monsters
    folder = tmp_path / "dungeons"
    folder.mkdir()
    (folder / "1.json").write_text(json.dumps({"dungeonId": 1, "monsters": {"10": {"tags": [{"id": "flees"}]}}}), encoding="utf-8")
    written = {"10": {"tags": []}, "11": {"tags": [{"id": "summons", "param": "Pelle Murale"}]}}
    (tmp_path / "monsters-written.json").write_text(json.dumps({"status": "draft", "monsters": written}), encoding="utf-8")
    snap = {"monsters": [{"id": 10, "spellIds": []}, {"id": 11, "spellIds": [5]}],
            "spells": [{"id": 5, "name": "Gel", "rangeMin": 1, "rangeMax": 5, "categories": ["hinder"], "effects": [{"text": "-2 PM (1 tour)", "target": "enemies"}]}]}
    build_monsters(folder, snap, tmp_path / "monsters.json")
    data = json.loads((tmp_path / "monsters.json").read_text(encoding="utf-8"))
    assert data["10"] == {"tags": [{"id": "flees"}]}
    assert data["11"] == written["11"]


def test_written_entries_are_snapshot_monsters_with_valid_badges():
    from tools.summaries import validate_written
    ok = {"status": "draft", "monsters": {"147": {"tags": [{"id": "summons", "param": "7 monstres de la zone"}],
                                                  "guide": "https://www.dofuspourlesnoobs.com/ecaflipus.html"}}}
    assert validate_written(ok, VOCAB, SNAPSHOT) == []
    errors = validate_written({"status": "draft", "monsters": {"999": {"tags": []}, "101": {"tags": [{"id": "nope"}], "guide": "https://x.fr"}}},
                              VOCAB, SNAPSHOT)
    assert any("999 is not in the snapshot" in e for e in errors)
    assert any("unknown tag" in e for e in errors)
    assert any("guide must be a DPLN link" in e for e in errors)


def test_untranslated_lists_written_texts_without_english():
    s = summary(monsters={"147": {"tags": [{"id": "big_damage", "param": "CaC"}, {"id": "moves", "param": "pousse", "source": "spells"}],
                                  "detail": "Le garder loin."}, "101": {"tags": []}})
    english = {"Tuer les Bouftous puis le Bouftou Royal.": "x", "CaC": "melee"}
    assert untranslated(s, english) == ["Le garder loin."]


def test_wanted_entries_are_wanted_monsters_with_valid_badges():
    from tools.summaries import validate_wanted
    snap = {**SNAPSHOT, "monsters": SNAPSHOT["monsters"] + [{"id": 4272, "name": "Bouss Baybe", "kind": "wanted"}]}
    ok = {"status": "draft", "monsters": {"4272": {"guide": "https://www.dofuspourlesnoobs.com/on-recherche-bouss-baybe.html",
                                                   "tags": [{"id": "no_summon", "param": "il les change en ennemis"}]}}}
    assert validate_wanted(ok, VOCAB, snap) == []
    errors = validate_wanted({"status": "draft", "monsters": {"147": {"tags": [{"id": "nope"}], "guide": "https://x.fr"}}}, VOCAB, snap)
    assert any("not a wanted-poster monster" in e for e in errors)
    assert any("unknown tag" in e for e in errors)
    assert any("guide must be a DPLN link" in e for e in errors)


def test_build_monsters_takes_wanted_entries_over_spells(tmp_path):
    from tools.summaries import build_monsters
    folder = tmp_path / "dungeons"
    folder.mkdir()
    entry = {"tags": [{"id": "inflicts", "param": "Pacifiste"}]}
    (tmp_path / "wanted.json").write_text(json.dumps({"status": "draft", "monsters": {"11": entry}}), encoding="utf-8")
    snap = {"monsters": [{"id": 11, "spellIds": [5]}],
            "spells": [{"id": 5, "name": "Gel", "rangeMin": 1, "rangeMax": 5, "categories": ["hinder"], "effects": [{"text": "-2 PM (1 tour)", "target": "enemies"}]}]}
    build_monsters(folder, snap, tmp_path / "monsters.json")
    assert json.loads((tmp_path / "monsters.json").read_text(encoding="utf-8"))["11"] == entry


SHEET = {"title": "Cycle lunaire", "gist": "Une phase par tour.", "points": ["Pleine lune : renvoie 200 dommages."],
         "guide": "https://www.dofuspourlesnoobs.com/sanctuaire-de-torkelonia.html", "status": "draft"}


def test_mechanics_need_title_points_and_https_guide():
    assert validate_mechanics({"lunar-cycle": SHEET}) == []
    errors = validate_mechanics({"bad": {**SHEET, "points": [], "guide": "javascript:alert(1)"}})
    assert len(errors) == 2 and all("bad" in e for e in errors)


def test_room_names_unknown_mechanic():
    errors = validate(summary(mechanics=["nope"]), VOCAB, SNAPSHOT, mechanics={"lunar-cycle": SHEET})
    assert any("unknown mechanic 'nope'" in e for e in errors)
    assert validate(summary(mechanics=["lunar-cycle"]), VOCAB, SNAPSHOT, mechanics={"lunar-cycle": SHEET}) == []


def test_monster_names_unknown_mechanic():
    monsters = {"147": {"tags": [], "mechanics": ["nope"]}, "101": {"tags": []}}
    errors = validate(summary(monsters=monsters), VOCAB, SNAPSHOT, mechanics={"lunar-cycle": SHEET})
    assert any("monster 147: unknown mechanic 'nope'" in e for e in errors)


def test_mechanic_texts_need_english():
    english = {"Cycle lunaire": "Lunar cycle", "Une phase par tour.": "One phase per turn."}
    assert untranslated_mechanics({"lunar-cycle": SHEET}, english) == ["Pleine lune : renvoie 200 dommages."]
