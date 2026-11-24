from tools.derive import derive


def spell(name, rmax=1, cats=(), effects=()):
    return {"id": hash(name) % 10000, "name": name, "rangeMin": 1, "rangeMax": rmax, "categories": list(cats),
            "effects": [{"text": t, "icon": 1, "dispellable": False} for t in effects]}


def test_melee_only_monster_is_harmless():
    out = derive([spell("Morsure", 1, ["dmg_e"], ["10 à 12 dommages Terre"])])
    assert out == {"harmless": True, "tags": []}


def test_a_ranged_hit_is_not_harmless_but_gets_no_tag_by_itself():
    out = derive([spell("Crachat", 6, ["dmg_w"], ["10 à 12 dommages Eau"])])
    assert out["harmless"] is False and out["tags"] == []


def test_movement_spells_make_a_moves_tag_even_at_melee():
    # « Déplace » for what moves you, « Se déplace » for what moves the monster itself (owner, 2026-11-22)
    out = derive([spell("Charge", 1, ["move"], ["Attire de 3 cases", "Téléporte sur la case ciblée"])])
    assert out["harmless"] is False
    assert {"id": "moves", "param": "attire", "source": "spells"} in out["tags"]
    assert {"id": "moves_self", "param": "se téléporte", "source": "spells"} in out["tags"]


def test_a_teleport_aimed_at_enemies_teleports_you_not_the_monster():
    s = spell("Choc", 3, ["move"], ["Téléportation symétrique"])
    s["effects"][0]["target"] = "enemies"
    out = derive([s])
    assert {"id": "moves", "param": "te téléporte", "source": "spells"} in out["tags"]


def test_summons_name_what_they_summon():
    out = derive([spell("Appel", 3, ["summon"], ["Invoque : Tiwabbit", "Invoque : Black Tiwabbit"])])
    assert {"id": "summons", "param": "Tiwabbit, Black Tiwabbit", "source": "spells"} in out["tags"]


def test_heals_removes_steals_erodes_invisible():
    out = derive([
        spell("Soin", 4, ["heal"], ["Soin : 20% des PV max"]),
        spell("Gel", 5, ["hinder"], ["-2 PM (1 tour)", "-1 PA (1 tour)"]),
        spell("Vol", 5, ["hinder"], ["Vole 2 PM (1 tour)", "-3 Portée (1 tour)"]),
        spell("Ronge", 1, ["dmg_n"], ["10% Érosion (2 tours)"]),
        spell("Ombre", 0, [], ["Rend la cible invisible (2 tours)"]),
    ])
    ids = {t["id"]: t.get("param") for t in out["tags"]}
    assert ids["heals"] == "lui ou ses alliés"
    assert ids["removes"] == "PA, PM, PO"
    assert ids["steals"] == "PM"
    assert "erodes" in ids and "invisible" in ids


def test_a_positive_bonus_is_not_a_removal():
    out = derive([spell("Cri", 0, ["boost"], ["2 PM (1 tour)", "50 Puissance (2 tours)"])])
    assert all(t["id"] != "removes" for t in out["tags"])


def test_at_most_six_tags():
    effects = ["Invoque : A", "Soin : 10% des PV max", "-1 PA (1 tour)", "Vole 1 PO (1 tour)", "Repousse de 2 cases",
               "10% Érosion (1 tour)", "Rend la cible invisible (1 tour)"]
    assert len(derive([spell("Tout", 5, [], effects)])["tags"]) == 6


def eff(text, target="enemies", zone=None):
    return {"text": text, "icon": 1, "dispellable": False, "target": target, "zone": zone}


def sp(name, rmin, rmax, effects, cats=()):
    return {"id": 1, "name": name, "rangeMin": rmin, "rangeMax": rmax, "categories": list(cats), "effects": effects}


def test_mob_l_eponge_heals_himself_and_allies_around_him_and_dispels_you():
    out = derive([
        sp("Dégraissage", 1, 1, [eff("15 à 20 vol Eau"), eff("-2 Portée (1 tour)")], ["dmg_w", "hinder"]),
        sp("Rinçage", 0, 0, [eff("Durée des effets : -2", "enemies", "cercle 2")]),
        sp("Régénération Spontanée", 0, 0, [eff("51 à 75 soins Feu", "allies", "cercle 2")], ["heal"]),
    ])
    ids = {t["id"]: t.get("param") for t in out["tags"]}
    assert ids["heals"] == "lui et ses alliés autour de lui"
    assert ids["dispels_you"] == "autour de lui"
    assert ids["removes"] == "PO"


def test_pichon_kloune_reflects_damage():
    out = derive([sp("Klounerie", 0, 0, [eff("16 Dommages Renvoyés", "self")])])
    assert {t["id"]: t.get("param") for t in out["tags"]}["reflect"] == "16"


def test_pichon_vert_removes_force_and_boosts_allies():
    out = derive([sp("Onde Enrageante", 0, 0, [eff("-50 Force (2 tours)", "enemies", "cercle 2"), eff("50 Puissance (2 tours)", "allies", "cercle 2")])])
    ids = {t["id"]: t.get("param") for t in out["tags"]}
    assert ids["removes"] == "Force autour de lui"
    assert ids["buffs_allies"] == "Puissance"


def test_a_heal_on_himself_only():
    out = derive([sp("Soin", 0, 0, [eff("Soin : 20% des PV max", "self")], ["heal"])])
    assert {t["id"]: t.get("param") for t in out["tags"]}["heals"] == "lui-même"


def test_heal_maluses_and_lifesteal_are_not_heals():
    out = derive([sp("Maudit", 1, 4, [eff("Soins reçus x50% (2 tours)", "enemies"),
                                      eff("Soin : 10% des dommages infligés", "self")])])
    assert all(t["id"] != "heals" for t in out["tags"])


def test_heal_on_attacker_aimed_at_players_heals_whoever_hits_the_target():
    hure = sp("Hure", 1, 8, [eff("Soin sur l'attaquant : 0% des dommages (2 tours)", "enemies")])
    assert {"id": "heals", "param": "ceux qui frappent sa cible", "source": "spells"} in derive([hure])["tags"]


def test_a_real_heal_wins_over_the_heal_on_attacker():
    out = derive([sp("Soin", 0, 0, [eff("Soin : 20% des PV max", "self")], ["heal"]),
                  sp("Hure", 1, 8, [eff("Soin sur l'attaquant : 0% des dommages", "enemies")])])
    assert [t.get("param") for t in out["tags"] if t["id"] == "heals"] == ["lui-même"]


def test_damage_received_is_not_a_removal():
    out = derive([sp("Carapace", 0, 0, [eff("-20% dommages reçus (1 tour)", "all", "cercle 2")])])
    assert all(t["id"] != "removes" for t in out["tags"])


def test_reviving_allies_comes_first():
    out = derive([sp("Mansovegarde", 1, 1, [eff("Ressuscite le dernier allié mort avec 10% de ses PV", "all")]),
                  sp("Appel", 1, 3, [eff("Invoque : Mansot")], ["summon"])])
    assert out["tags"][0] == {"id": "revives", "param": "à 10 % de ses PV", "source": "spells"}


def test_hindering_states_are_a_danger_badge():
    out = derive([sp("Lest", 1, 5, [eff("État Pesanteur (1 tour)"), eff("État Insoignable (2 tours)"), eff("État Feu (1 tour)")])])
    assert {"id": "inflicts", "param": "Pesanteur, Insoignable", "source": "spells"} in out["tags"]


def test_ap_and_mp_poisons_are_danger_badges():
    out = derive([sp("Poison", 1, 5, [eff("12 dommages Feu pour 1 PA utilisé (2 tours)", target="enemies"),
                                      eff("8 dommages Eau pour 1 PM utilisé", target="all"),
                                      eff("5 dommages Air pour 1 PM utilisé", target="all")])])
    assert {"id": "poison_ap", "param": "Feu", "source": "spells"} in out["tags"]
    assert {"id": "poison_mp", "param": "Eau, Air", "source": "spells"} in out["tags"]


def test_a_poison_on_itself_is_not_a_badge():
    out = derive([sp("Malus", 1, 5, [eff("12 dommages Feu pour 1 PA utilisé", target="self")])])
    assert not any(t["id"] == "poison_ap" for t in out["tags"])


def test_a_spell_that_turns_your_summons_into_enemies_says_not_to_summon():
    replace = ["Tue la cible et remplace par l'invocation : Cavalier Porkass"]
    porkasserie = dict(spell("Porkasserie", 12, ["summon"], replace), id=6289)
    assert {"id": "no_summon", "param": "il les change en ennemis", "source": "spells"} in derive([porkasserie])["tags"]
    # the same effect on another spell (its own allies, a melee kill): not listed, no badge
    other = dict(spell("Twansmutation", 10, ["summon"], replace), id=3790)
    assert all(t["id"] != "no_summon" for t in derive([other])["tags"])


def tags_of(*spells):
    return {t["id"]: t.get("param") for t in derive(list(spells))["tags"]}


def test_a_rush_is_a_move():
    assert tags_of(sp("Charge", 1, 5, [eff("Avance de 4 cases", "all")]))["moves_self"] == "avance"


def test_shields_given_to_allies_are_a_buff():
    out = tags_of(sp("Carapace", 1, 5, [eff("Bouclier : 50% du niveau (2 tours)", "allies")]))
    assert out["buffs_allies"] == "Bouclier"


def test_hits_steals_and_zero_values_on_allies_are_not_buffs():
    out = tags_of(sp("Lance-boulettes", 1, 5, [eff("61 à 70 dommages Feu", "allies"), eff("21 à 30 vol Feu", "allies"),
                                              eff("0 Soin", "allies")]))
    assert "buffs_allies" not in out


def test_heals_cut_on_players_is_a_removal():
    assert tags_of(sp("Triste Cire", 1, 5, [eff("Soins reçus x50%")]))["removes"] == "Soins reçus"
    assert "removes" not in tags_of(sp("Soin", 1, 5, [eff("Soins reçus x150%")]))


def test_a_double_of_the_caster_is_a_summon():
    assert tags_of(sp("Mirage", 1, 5, [eff("Invoque un double du lanceur", "all")]))["summons"] == "un double"


def test_reflecting_a_share_of_spell_damage_is_reflect():
    assert "reflect" in tags_of(sp("Miroir", 0, 0, [eff("Renvoie 50% des dégâts des sorts de rang 2 maximum", "self")]))


def test_new_hindering_states():
    assert tags_of(sp("Ancrage", 1, 5, [eff("État Indéplaçable (1 tour)")]))["inflicts"] == "Indéplaçable"


def test_a_glyph_spell_that_only_triggers_or_removes_lays_no_glyph():
    assert "glyphs" not in tags_of(sp("Pistage", 1, 5, [eff("Déclenche les pièges")], ["glyph"]))
    assert "glyphs" not in tags_of(sp("Salsa", 1, 5, [eff("Supprime les glyphes du sort posés par la cible")], ["glyph"]))
    assert "glyphs" in tags_of(sp("Glyphe", 1, 5, [eff("Pose un glyphe de rang 1 : Brûlure (2 tours)")], ["glyph"]))
    # a glyph spell whose effects never mention it (the glyph's own effects only) still lays one
    assert "glyphs" in tags_of(sp("Flamme", 1, 5, [eff("10 à 12 dommages Feu")], ["glyph"]))


def test_a_glyph_spell_clearing_its_own_glyphs_still_lays_one():
    kaba = sp("Kabā", 1, 5, [eff("Supprime les glyphes du sort posés par la cible", "self"),
                             eff("Hogo (exécuté par la cible)", "self")], ["glyph"])
    assert "glyphs" in tags_of(kaba)


def test_a_removal_list_keeps_whole_items_within_32_characters():
    out = tags_of(sp("Coup", 1, 5, [eff(t) for t in ("-2 PA", "-2 PM", "-100 Puissance", "-20 Résistances Poussée")]))
    assert out["removes"] == "PA, PM, Puissance"
    around = tags_of(sp("Onde", 0, 0, [eff("-20 Résistances Poussée", zone="cercle 2")]))
    assert around["removes"] == "Rés. Poussée autour de lui"


def test_stealing_the_four_characteristics_is_said_in_short():
    out = tags_of(sp("Vol", 1, 5, [eff(f"Vole 50 {c}") for c in ("Force", "Intelligence", "Chance", "Agilité")]))
    assert out["steals"] == "les 4 caractéristiques"


def test_removing_dodge_is_not_a_danger():
    only_dodge = derive([spell("Glisse", 3, ["hinder"], ["-10 Esquive PA (1 tour)", "-10 Esquive PM (1 tour)"])])
    assert all(t["id"] != "removes" for t in only_dodge["tags"])
    out = derive([spell("Gel", 3, ["hinder"], ["-1 PM (1 tour)", "-10 Esquive PM (1 tour)"])])
    assert {"id": "removes", "param": "PM", "source": "spells"} in out["tags"]
