import json

from tools.consistency import accept, changes, differences, report


def spell(sid, text, target="enemies"):
    return {"id": sid, "name": f"s{sid}", "rangeMin": 1, "rangeMax": 5, "categories": [],
            "effects": [{"text": text, "target": target, "zone": None}]}


def snapshot(heal_text="Soin : 20% des PV max"):
    return {
        "monsters": [{"id": 1, "name": "Bouftou", "spellIds": [10, 11]}],
        "spells": [spell(10, heal_text, "self"), spell(11, "-2 PM (1 tour)")],
    }


def write(tmp_path, tags):
    (tmp_path / "dungeons").mkdir()
    (tmp_path / "dungeons" / "1.json").write_text(json.dumps({"monsters": {"1": {"tags": tags}}}), encoding="utf-8")
    return tmp_path


def test_a_spell_with_no_badge_and_a_badge_with_no_spell_are_reported(tmp_path):
    folder = write(tmp_path, [{"id": "removes", "param": "PM"}, {"id": "reflect"}, {"id": "one_shot"}])
    result = differences(folder, snapshot(), {})
    found = {(d["tag"], d["kind"]) for d in result["open"]}
    # one_shot comes from guides only: never compared
    assert found == {("heals", "no badge"), ("reflect", "no spell")}
    assert "Bouftou (1): spells show `heals` « soi-même », no badge" in report(result)


def test_a_reviewed_difference_is_not_asked_again_until_the_spells_change(tmp_path):
    folder = write(tmp_path, [{"id": "removes", "param": "PM"}, {"id": "heals", "param": "lui-même"}, {"id": "reflect"}])
    checked = accept({}, snapshot(), "1", "reflect", "passive in the guide, not in the data")
    result = differences(folder, snapshot(), checked)
    assert result["open"] == [] and result["accepted"] == 1
    changed = snapshot("Soin : 50% des PV max")
    result = differences(folder, changed, checked)
    assert [(d["tag"], d.get("spellsChanged")) for d in result["open"]] == [("reflect", True)]
    assert result["stale"] == 1


def test_changes_lists_added_removed_and_changed_monsters():
    old = snapshot()
    new = snapshot("Soin : 50% des PV max")
    new["monsters"].append({"id": 2, "name": "Tofu", "spellIds": []})
    diff = changes(old, new)
    assert diff == {"added": [("Tofu", 2)], "removed": [], "changed": [("Bouftou", 1)]}
