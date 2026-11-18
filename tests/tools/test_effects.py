from tests.tools.conftest import FIXTURES, spell_effects
from tools.effects import format_effect, spell_categories


def test_damage_range():
    assert format_effect(spell_effects(30921)[0]) == "46 à 54 dommages Feu"


def test_duration_suffix():
    texts = [format_effect(e) for e in spell_effects(338)]
    assert "-150 Puissance (1 tour)" in texts


def test_no_placeholder_left():
    for file in FIXTURES.glob("spells_*.json"):
        spell_id = int(file.stem.split("_")[1])
        for effect in spell_effects(spell_id):
            text = format_effect(effect)
            assert "#" not in text and "{" not in text and "}" not in text, (file.name, text)


def test_categories_hemorasoir():
    assert spell_categories(spell_effects(30921)) == ["dmg_f"]


def test_categories_ventwoboom():
    assert spell_categories(spell_effects(330)) == ["dmg_n", "move"]


def test_categories_awmuwe_woyale():
    assert spell_categories(spell_effects(3780)) == ["boost"]


def test_categories_cawotte_pawalysante():
    assert spell_categories(spell_effects(334)) == ["hinder"]


def test_categories_cawotte_vitaminee():
    assert spell_categories(spell_effects(333)) == ["heal"]


def _texts(spell_id):
    return [format_effect(e) for e in spell_effects(spell_id)]


def test_linked_spell_shows_its_name_not_its_id():
    assert "Répercussion (exécuté par la cible)" in _texts(30921)


def test_summon_shows_the_monster_name():
    assert "Invoque : Raphaela" in _texts(1018)


def test_negative_range_keeps_its_sign():
    effect = {"Name": "-#1{ à -#2|~2} Esquive PA", "Parameters": [{"Name": "16", "Value": 16}, {"Name": "20", "Value": 20}]}
    assert format_effect(effect) == "-16 à -20 Esquive PA"
    assert "-10 Esquive PA (3 tours)" in _texts(1012)


def test_plural_is_written_once():
    assert "20 à 24 Dommages (2 tours)" in _texts(1002)
    single = {"Name": "#1{ à #2|~2} Dommage{s|#1}{s|||#1}", "Parameters": [{"Name": "1", "Value": 1}, {"Name": "0", "Value": 0}]}
    assert format_effect(single) == "1 Dommage"


def test_state_without_metadata_shows_its_name():
    assert any(t.startswith("État Collecte") for t in _texts(15197))
