"""Effect text and spell type categories from Dofensive spell effects."""

import re

CATEGORIES = ["dmg_n", "dmg_e", "dmg_f", "dmg_w", "dmg_a", "heal", "boost", "hinder", "move", "summon", "glyph"]
_ELEMENTS = (("EARTH", "e"), ("FIRE", "f"), ("WATER", "w"), ("AIR", "a"))


def _param_values(effect: dict) -> list:
    """Numbers for amounts; the readable name for parameters that point to a spell, monster or state."""
    out = []
    for p in effect.get("Parameters") or []:
        name = str(p.get("Name", ""))
        if p.get("Metadata") or "Value" not in p or (name and not name.lstrip("-").isdigit()):
            out.append(p.get("Name"))
        else:
            out.append(p["Value"])
    return out


def format_effect(effect: dict, lang: str = "fr") -> str:
    """Text of one effect in the API's language, e.g. "46 à 54 dommages Feu" or "-150 Puissance (1 tour)"."""
    text = effect.get("Name") or ""
    values = _param_values(effect)
    v1 = values[0] if values else ""
    v2 = values[1] if len(values) > 1 else 0
    # "#1{ à #2|~2}" or "-#1{ à -#2|~2}": a range when there is a second value, keeping the text before #2
    text = re.sub(r"#1\{([^}#|]*)#2[^}]*\}", lambda m: f"{v1}{m.group(1)}{v2}" if v2 else f"{v1}", text)
    # plural marks "{s|#1}" / "{s|||#1}": one "s" when the amount is above 1
    plural = "s" if (isinstance(v1, int) and abs(v1) > 1) or v2 else ""
    text = re.sub(r"\{s\|[^}]*\}", "@PLURAL@", text, count=1).replace("@PLURAL@", plural)
    text = re.sub(r"\{s\|[^}]*\}", "", text)
    for i, value in enumerate(values, start=1):
        text = text.replace(f"#{i}", str(value))
    text = re.sub(r"\{([^|}]*)\|[^}]*\}", r"\1", text)
    text = re.sub(r"#\d+", "", text)
    text = re.sub(r"[{}]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    duration = effect.get("Duration") or 0
    if duration > 0:
        word = "turn" if lang == "en" else "tour"
        text += f" ({duration} {word}{'s' if duration > 1 else ''})"
    return text


def effect_category(effect: dict) -> str | None:
    label = (effect.get("TechnicalLabel") or "").upper()
    if "MULTIPLY_RECEIVED_DAMAGE" in label:
        ints = [v for v in _param_values(effect) if isinstance(v, int)]
        return "boost" if ints and ints[0] < 100 else "hinder"
    if "LIFE_POINTS_LOST" in label or "LIFE_POINTS_STEAL" in label or "KILL_LIFE" in label or label.endswith("_KILL"):
        for key, code in _ELEMENTS:
            if key in label:
                return "dmg_" + code
        return "dmg_n"
    if "LIFE_POINTS_WIN" in label:
        return "heal"
    if any(k in label for k in ("PUSH", "PULL", "TELEPORT", "EXCHANGE_PLACES")) and "DAMAGE" not in label:
        return "move"
    if "SUMMON" in label:
        return "summon"
    if "DEBOOST" in label or "STEAL" in label:
        return "hinder"
    if "BOOST" in label or "SHIELD" in label:
        return "boost"
    if "GLYPH" in label or "TRAP" in label:
        return "glyph"
    return None


def spell_categories(effects: list[dict]) -> list[str]:
    found = {c for c in (effect_category(e) for e in effects) if c}
    return [c for c in CATEGORIES if c in found]
