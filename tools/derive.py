"""Badges proposed from a monster's Dofensive spells (the user validates them; they carry "source": "spells").

Each effect knows whom it hits ("target": enemies / allies / self / all) and where ("zone": "cercle 2"…); a spell with
range 0 and an area is centred on the monster ("autour de lui"). A monster whose spells all hit at melee range,
without moving, summoning, healing, hindering or glyphs, is harmless.
"""

import re

_MOVES = (("attire", "attire"), ("repousse", "pousse"), ("recule", "pousse"), ("téléporte", "se téléporte"),
          ("téléportation", "se téléporte"), ("échange de positions", "échange de place"), ("avance de", "avance"))
_DANGEROUS_CATEGORIES = {"move", "summon", "glyph", "heal", "hinder"}
_STAT_ORDER = ["PA", "PM", "PO"]
# losing dodge is no threat to a character: not a « Retire » badge (owner, 2026-11-18)
_HARMLESS_REMOVALS = {"Esquive PA", "Esquive PM"}
# a hit (« 61 à 70 dommages Feu », « 21 à 30 vol Air ») or a zero value (« 0 Soin »): not a characteristic
_NOT_A_STAT = re.compile(r"^-?0(?: à -?0)? |\b(?:dommages|vol) (?:Neutre|Terre|Feu|Eau|Air)\b")
# « Soins reçus x50% »: the target's heals are cut
_HEALS_CUT = re.compile(r"^Soins reçus x(\d+)%")
# « 12 dommages Feu pour 1 PA utilisé (2 tours) »: the target loses life for each PA (or PM) it spends
_POISON = re.compile(r"^\d+ dommages (\w+) pour \d+ (PA|PM) utilisé")
MAX_TAGS = 6  # vocabulary.json limits.tagsPerMonster
# states that hinder a player (the others in the game data are mostly internal markers)
HINDERING_STATES = ["Pesanteur", "Insoignable", "Affaibli", "Pacifiste", "Enraciné", "Infecté", "Lourd", "Silencieux",
                    "Maudit", "Endormi", "Empoisonné", "Indéplaçable", "Intacleur"]
# spells that kill a player's summon and put a monster of their own in its place (« Tue la cible et remplace par
# l'invocation »): summoning only feeds the enemy. Listed one by one: the same effect also turns the monster's own
# allies (the Wa Wobot's Cawottes, a Sadida's trees) or kills anyone in melee, and the data does not tell them apart.
TURNS_SUMMONS = {6289}  # Porkasserie (Bouss Baybe): owner, 2026-11-09


def _join(items: list, limit: int = 32) -> str:
    out = ""
    for item in items:
        nxt = item if not out else f"{out}, {item}"
        if len(nxt) > limit:
            break
        out = nxt
    return out


def _stat(text: str):
    """The characteristic an effect changes: "-2 Portée (1 tour)" → "PO", "-50 Force" → "Force"."""
    if _NOT_A_STAT.search(text):
        return None
    m = re.match(r"^-?\d+(?: à -?\d+)?%? ([A-Za-zÀ-ÿ]+(?: [A-Za-zÀ-ÿ]+)?)", text)
    if not m:
        return None
    word = m.group(1).split(" (")[0]
    return {"Portée": "PO", "PA": "PA", "PM": "PM"}.get(word.split()[0], word)


def _around(spell: dict, effect: dict) -> bool:
    zone = effect.get("zone")
    return spell.get("rangeMax", 1) == 0 and bool(zone) and zone != "toute la carte"


def _is_heal(effect: dict) -> bool:
    """A real heal of the monster or its allies: not « Soins reçus x50% » (a malus on the target), not a heal of
    whoever hits it (« Soin sur l'attaquant »), never an effect aimed at the player's team."""
    text = effect["text"]
    if not (text.startswith("Soin") or " soins " in text):
        return False
    if "reçus" in text or "attaquant" in text or "des dommages" in text:
        return False
    return effect.get("target") != "enemies"


def _sorted_stats(stats: list) -> list:
    return sorted(stats, key=lambda s: (_STAT_ORDER.index(s) if s in _STAT_ORDER else 9, stats.index(s)))


def derive(spells: list) -> dict:
    pairs = [(s, e) for s in spells for e in s.get("effects", [])]
    texts = [e["text"] for _, e in pairs]
    cats = {c for s in spells for c in s.get("categories", [])}
    melee_only = all(s.get("rangeMax", 0) <= 1 for s in spells)
    tags = []

    def add(tid, param=None):
        if any(t["id"] == tid for t in tags):
            return
        tag = {"id": tid}
        if param:
            tag["param"] = param
        tag["source"] = "spells"
        tags.append(tag)

    # reviving the last dead ally: the monster to take down first, shown before everything else
    revive = next((t for t in texts if t.startswith("Ressuscite")), None)
    if revive:
        pct = re.search(r"(\d+)% de ses PV", revive)
        add("revives", f"à {pct.group(1)} % de ses PV" if pct else None)

    states = []
    for s, e in pairs:
        if e["text"].startswith("État ") and e.get("target") in (None, "enemies", "all"):
            name = e["text"][5:].split(" (")[0].strip()
            if name in HINDERING_STATES and name not in states:
                states.append(name)
    if states:
        add("inflicts", _join(states))

    # AP / MP poisons: playing (or moving) hurts while they last
    for unit, tid in (("PA", "poison_ap"), ("PM", "poison_mp")):
        elements = []
        for _, e in pairs:
            m = _POISON.match(e["text"])
            if m and m.group(2) == unit and e.get("target") in (None, "enemies", "all") and m.group(1) not in elements:
                elements.append(m.group(1))
        if elements:
            add(tid, ", ".join(elements))

    if any(s.get("id") in TURNS_SUMMONS for s in spells):
        add("no_summon", "il les change en ennemis")

    summoned = list(dict.fromkeys(t.split(":", 1)[1].strip() if t.startswith("Invoque :") else "un double"
                                  for t in texts if t.startswith("Invoque :") or t.startswith("Invoque un double")))
    summoned = [name for name in summoned if name]  # « Invoque : » with no name in the data
    if summoned:
        add("summons", _join(summoned))

    heals = [(s, e) for s, e in pairs if _is_heal(e)]
    if heals:
        targets = {e.get("target") for _, e in heals}
        if targets == {None}:
            who = "lui ou ses alliés"  # the data does not say which
        elif targets <= {"self"}:
            who = "lui-même"
        else:
            who = "lui et ses alliés"
        if who != "lui ou ses alliés" and all(_around(s, e) for s, e in heals):
            who += " autour de lui"
        add("heals", who)
    # « Soin sur l'attaquant » aimed at the players: a debuff on a character, whoever hits it heals (its monsters,
    # DPLN: Harpirate, Toxoliath, Kabahal…). Capitaine Ekarlatte's is the other way round (hitting him heals you,
    # owner 2026-11-09): his written entry says so, and the data does not tell them apart.
    elif any(e["text"].startswith("Soin sur l'attaquant") and e.get("target") in ("enemies", "all") for _, e in pairs):
        add("heals", "ceux qui frappent sa cible")

    removed, removal_pairs = [], []
    for s, e in pairs:
        if e["text"].startswith("-") and e.get("target") in (None, "enemies", "all") and "reçus" not in e["text"]                 and (st := _stat(e["text"])) and st not in _HARMLESS_REMOVALS:
            if st not in removed:
                removed.append(st)
            removal_pairs.append((s, e))
        elif e.get("target") in (None, "enemies", "all") and (m := _HEALS_CUT.match(e["text"]))                 and int(m.group(1)) < 100:
            if "Soins reçus" not in removed:
                removed.append("Soins reçus")
            removal_pairs.append((s, e))
    if removed:
        stats = _sorted_stats(removed)
        around = " autour de lui" if all(_around(s, e) for s, e in removal_pairs) else ""
        # as many whole characteristics as fit in 32 characters, most important first (never cut in a word)
        n = len(stats)
        while n > 1 and len(", ".join(stats[:n]) + around) > 32:
            n -= 1
        param = ", ".join(stats[:n]) + around
        if len(param) > 32:  # one long characteristic: « Résistances Poussée autour de lui »
            param = param.replace("Résistances", "Rés.", 1)
        add("removes", param)

    stolen = []
    for t in texts:
        if t.startswith("Vole ") and (st := _stat(t[5:])) and st not in stolen:
            stolen.append(st)
    if stolen:
        if {"Force", "Intelligence", "Chance", "Agilité"} <= set(stolen):  # too long to list in 32 characters
            stolen = [s for s in stolen if s not in ("Force", "Intelligence", "Chance", "Agilité")]
            stolen.append("les 4 caractéristiques")
        add("steals", ", ".join(_sorted_stats(stolen)))

    reflect = next((e["text"] for _, e in pairs if "renvoy" in e["text"].lower() or e["text"].startswith("Renvoie ")),
                   None)
    if reflect:
        add("reflect", (re.match(r"^\d+", reflect) or [None])[0])

    dispel = [(s, e) for s, e in pairs if e.get("target") in ("enemies", "all")
              and (e["text"].startswith("Durée des effets : -") or e["text"].startswith("Enlève les envoûtements"))]
    if dispel:
        add("dispels_you", "autour de lui" if all(_around(s, e) for s, e in dispel) else None)

    boosts = []
    for s, e in pairs:
        if e.get("target") == "allies" and not e["text"].startswith("-") and " soins " not in e["text"] \
                and not e["text"].startswith("Soin") and (st := _stat(e["text"])) and st not in boosts:
            boosts.append(st)
        elif e.get("target") == "allies" and e["text"].startswith("Bouclier") and "Bouclier" not in boosts:
            boosts.append("Bouclier")
    if boosts:
        add("buffs_allies", _join(boosts))

    moves = []
    for _, e in pairs:
        low = e["text"].lower()
        for key, label in _MOVES:
            # a teleport aimed at enemies moves the player, not the monster
            if label == "se téléporte" and e.get("target") == "enemies":
                label = "te téléporte"
            if key in low and label not in moves:
                moves.append(label)
    if moves:
        add("moves", _join(moves))
    if any("Érosion" in t for t in texts):
        add("erodes")
    if any("invisible" in t.lower() and not t.startswith("Dévoile") for t in texts):
        add("invisible")
    # a « glyph » spell that only sets off traps or bombs, or removes the target's glyphs, lays none (Pistage, Salsa)
    def lays_glyph(s):
        # removing its own glyphs (target « self ») clears the previous one before laying the next: still a glyph
        about = [e["text"] for e in s.get("effects", []) if not (e["text"].startswith("Supprime") and
                                                                  e.get("target") == "self")
                 and (e["text"].startswith(("Déclenche", "Supprime", "Pose")) or "glyphe" in e["text"].lower())]
        return not (about and all(t.startswith(("Déclenche", "Supprime")) for t in about))

    if any("glyph" in s.get("categories", []) and lays_glyph(s) for s in spells):
        add("glyphs")  # what the glyph does is not in the spell data: no parameter rather than a placeholder

    harmless = melee_only and not tags and not (cats & _DANGEROUS_CATEGORIES)
    return {"harmless": harmless, "tags": tags[:MAX_TAGS]}
