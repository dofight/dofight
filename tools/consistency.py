"""Written badges checked against the game data, and what a game update changed.

check: for every monster with a written entry (a dungeon, a zone, wanted.json), the badges `tools/derive.py` reads
from its spells are compared with the written ones. Two kinds of difference:
- « no badge »: the spells show it (a heal, a removal, a move…), the entry has no such badge;
- « no spell »: the entry has a badge the spells could show, but none of its spells does (it may come from the guide:
  a dungeon mechanic, a passive the data lacks; or the guide may be out of date).
A difference the owner reviewed goes in data/summaries/checked.json with the reason, and with a fingerprint of the
monster's spells: when a game update changes them, the difference is asked again.

changes: monsters added, removed or whose spells changed between two snapshots (after a game update).
"""

import hashlib
import json
from pathlib import Path

# the badges derive.py can give; the others (one_shot, invulnerable, tips…) come from guides only
DERIVABLE = {"revives", "inflicts", "poison_ap", "poison_mp", "no_summon", "summons", "heals", "removes", "steals",
             "reflect", "dispels_you", "buffs_allies", "moves", "moves_self", "erodes", "invisible", "glyphs"}


def fingerprint(monster: dict, spells: dict) -> str:
    """A short hash of what the monster's spells do: changes when a game update changes them."""
    data = [spells.get(i, {}).get("effects") for i in sorted(monster.get("spellIds", []))]
    return hashlib.sha1(json.dumps(data, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:10]


def entries(summaries: Path):
    """(file name, monster id, entry) for every written entry: dungeons, zones, then wanted.json."""
    files = sorted((summaries / "dungeons").glob("*.json")) + sorted((summaries / "zones").glob("*.json"))
    if (summaries / "wanted.json").exists():
        files.append(summaries / "wanted.json")
    for file in files:
        for mid, entry in (json.loads(file.read_text(encoding="utf-8")).get("monsters") or {}).items():
            yield file.name, mid, entry


def differences(summaries: Path, snapshot: dict, checked: dict) -> dict:
    """{"open": [...], "accepted": n, "stale": n}: each open difference is {file, id, name, tag, kind, param};
    « stale » counts reviewed differences asked again because the monster's spells changed since."""
    from tools.derive import derive

    spells = {s["id"]: s for s in snapshot["spells"]}
    monsters = {str(m["id"]): m for m in snapshot["monsters"]}
    out, accepted, stale = [], 0, 0
    for file, mid, entry in entries(summaries):
        m = monsters.get(mid)
        if m is None:
            continue
        derived = {t["id"]: t.get("param") for t in derive([spells[i] for i in m["spellIds"] if i in spells])["tags"]}
        written = {t["id"] for t in entry.get("tags", [])}
        found = [(t, "no badge", derived[t]) for t in derived if t not in written]
        found += [(t, "no spell", None) for t in sorted(written & DERIVABLE) if t not in derived]
        review = checked.get(mid) or {}
        fresh = review.get("spells") == fingerprint(m, spells)
        for tag, kind, param in found:
            if tag in (review.get("tags") or {}):
                if fresh:
                    accepted += 1
                    continue
                stale += 1
            out.append({"file": file, "id": mid, "name": m["name"], "tag": tag, "kind": kind, "param": param,
                        **({"spellsChanged": True} if tag in (review.get("tags") or {}) else {})})
    return {"open": out, "accepted": accepted, "stale": stale}


def report(result: dict) -> str:
    """The open differences as Markdown, by file."""
    lines = [f"# Badges vs spells: {len(result['open'])} open, {result['accepted']} reviewed, "
             f"{result['stale']} asked again (spells changed)", ""]
    current = None
    for d in result["open"]:
        if d["file"] != current:
            current = d["file"]
            lines += ["", f"## {current}", ""]
        what = (f"spells show `{d['tag']}`" + (f" « {d['param']} »" if d["param"] else "") + ", no badge"
                if d["kind"] == "no badge" else f"badge `{d['tag']}`, no spell shows it")
        again = " (spells changed since reviewed)" if d.get("spellsChanged") else ""
        lines.append(f"- {d['name']} ({d['id']}): {what}{again}")
    return "\n".join(lines) + "\n"


def accept(checked: dict, snapshot: dict, monster_id: str, tag: str, reason: str) -> dict:
    """Records a reviewed difference (with the monster's current spells fingerprint)."""
    spells = {s["id"]: s for s in snapshot["spells"]}
    m = next(m for m in snapshot["monsters"] if str(m["id"]) == str(monster_id))
    review = checked.setdefault(str(monster_id), {"name": m["name"], "spells": "", "tags": {}})
    fp = fingerprint(m, spells)
    if review["spells"] != fp:
        review["spells"], review["tags"] = fp, {}  # the older reviews were about other spells
    review["tags"][tag] = reason
    return checked


def changes(old: dict, new: dict) -> dict:
    """Monsters added, removed, and those whose spells changed (by fingerprint), from one snapshot to the next."""
    def index(snap):
        spells = {s["id"]: s for s in snap["spells"]}
        return {m["id"]: (m["name"], fingerprint(m, spells)) for m in snap["monsters"]}

    a, b = index(old), index(new)
    return {
        "added": sorted((b[i][0], i) for i in b.keys() - a.keys()),
        "removed": sorted((a[i][0], i) for i in a.keys() - b.keys()),
        "changed": sorted((b[i][0], i) for i in a.keys() & b.keys() if a[i][1] != b[i][1]),
    }
