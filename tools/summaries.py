"""Dofight summaries: validate the per-dungeon files, build the app index.

python -m tools.summaries validate            # every data/summaries/dungeons/*.json and zones/*.json
python -m tools.summaries index               # data/summaries/index.json, zones.json and monsters.json for the app

A zone file (guild expeditions: « Expédition - Cour du Bouftou Royal ») has the same form as a dungeon file plus a
"zone" key; its monsters are the creatures living in that sub-area.

wanted.json holds the wanted-poster monsters (« On recherche » guides of DPLN): {"status", "monsters": {id: entry}},
each entry like a dungeon file's, plus its "guide" link; it replaces the badges derived from the monster's spells.
monsters-written.json holds entries written by hand for monsters met outside any dungeon or zone summary (same form
as wanted.json, "guide" optional); it also replaces the badges derived from their spells.
python -m tools.summaries check               # written badges vs spells: .cache/consistency.md (tools/consistency.py)
python -m tools.summaries accept <monsterId> <tag> <reason>   # a reviewed difference, into checked.json
python -m tools.summaries changes [gitRef]    # monsters added, removed or changed since gitRef (default HEAD)
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUMMARIES = ROOT / "data" / "summaries"
STATUSES = ("draft", "reviewed")
PARAM_FREE = ("none", "optional")


def load_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def validate(summary: dict, vocab: dict, snapshot: dict, mechanics: dict | None = None) -> list:
    """Errors in one dungeon summary (empty list when it is valid). With `mechanics` (mechanics.json), the sheets the
    room names must exist."""
    errors = []
    limits = vocab["limits"]
    tags = vocab["tags"]
    did = summary.get("dungeonId")
    zone = summary.get("zone")
    if zone:
        ids = [m["id"] for m in snapshot["monsters"] if zone in (m.get("subareas") or [])]
        if not ids:
            return [f"zone {zone!r}: no monster lives there"]
        dungeon = {"name": zone, "monsterIds": ids}
        where = f"zone {zone}"
    else:
        dungeon = next((d for d in snapshot["dungeons"] if d["id"] == did), None)
        if dungeon is None:
            return [f"dungeon {did}: not in the snapshot"]
        where = f"dungeon {did} ({dungeon['name']})"
    if summary.get("status") not in STATUSES:
        errors.append(f"{where}: status must be one of {STATUSES}")
    strategy = summary.get("strategy") or ""
    if len(strategy) > limits["strategyMaxChars"]:
        errors.append(f"{where}: strategy longer than {limits['strategyMaxChars']} characters")
    expected = {str(i) for i in dungeon["monsterIds"]}
    # « bossSummons »: {boss id: [summon ids]}, the summons that drive the boss fight, shown under the boss; each one
    # has its own entry in "monsters"
    known = {m["id"] for m in snapshot["monsters"]}
    for boss, summons in (summary.get("bossSummons") or {}).items():
        if boss not in expected:
            errors.append(f"{where}: bossSummons: {boss} is not a monster of this dungeon")
        for sid in summons:
            if sid not in known:
                errors.append(f"{where}: bossSummons: summon {sid} is not in the snapshot")
            expected.add(str(sid))
    given = set((summary.get("monsters") or {}).keys())
    for extra in sorted(given - expected):
        errors.append(f"{where}: monster {extra} is not in this dungeon")
    for missing in sorted(expected - given):
        errors.append(f"{where}: monster {missing} is missing (use \"tags\": [])")
    groups = [("room", summary.get("roomTags") or [])]
    groups += [(f"monster {mid}", entry.get("tags") or []) for mid, entry in (summary.get("monsters") or {}).items()]
    for owner, mtags in groups:
        mid = owner
        if len(mtags) > limits["tagsPerMonster"]:
            errors.append(f"{where}: {owner} has more than {limits['tagsPerMonster']} tags")
        for tag in mtags:
            tid = tag.get("id")
            spec = tags.get(tid)
            if spec is None:
                errors.append(f"{where}: {mid}: unknown tag {tid!r}")
                continue
            param = (tag.get("param") or "").strip()
            if spec["param"] not in PARAM_FREE and not param:
                errors.append(f"{where}: {mid}: tag {tid} needs a param ({spec['param']})")
            if spec["param"] == "none" and param:
                errors.append(f"{where}: {mid}: tag {tid} takes no param")
            if len(param) > limits["paramMaxChars"]:
                errors.append(f"{where}: {mid}: tag {tid} param longer than {limits['paramMaxChars']} characters")
    for mid, entry in (summary.get("monsters") or {}).items():
        if len(entry.get("detail") or "") > limits["detailMaxChars"]:
            errors.append(f"{where}: monster {mid}: detail longer than {limits['detailMaxChars']} characters")
    if mechanics is not None:
        errors += [f"{where}: unknown mechanic {mid!r}" for mid in summary.get("mechanics") or [] if mid not in mechanics]
        for mid, entry in (summary.get("monsters") or {}).items():
            errors += [f"{where}: monster {mid}: unknown mechanic {k!r}" for k in entry.get("mechanics") or []
                       if k not in mechanics]
    return errors


MECHANIC_POINTS_MAX = 12
MECHANIC_TEXT_MAX = 160


def validate_mechanics(mechanics: dict) -> list:
    """Errors in mechanics.json: each sheet has a title, a gist, 1 to 12 points (160 characters at most, like the
    gist), an https guide link when it has one, and a status."""
    errors = []
    for mid, sheet in mechanics.items():
        where = f"mechanic {mid}"
        if not (sheet.get("title") or "").strip():
            errors.append(f"{where}: no title")
        gist = sheet.get("gist") or ""
        if not gist.strip() or len(gist) > MECHANIC_TEXT_MAX:
            errors.append(f"{where}: gist missing or longer than {MECHANIC_TEXT_MAX} characters")
        points = sheet.get("points") or []
        if not 1 <= len(points) <= MECHANIC_POINTS_MAX:
            errors.append(f"{where}: needs 1 to {MECHANIC_POINTS_MAX} points")
        errors += [f"{where}: point longer than {MECHANIC_TEXT_MAX} characters: {p[:40]}…" for p in points if len(p) > MECHANIC_TEXT_MAX]
        guide = sheet.get("guide")
        if guide is not None and not str(guide).startswith("https://"):
            errors.append(f"{where}: guide must be an https link")
        if sheet.get("status") not in STATUSES:
            errors.append(f"{where}: status must be one of {STATUSES}")
    return errors


def untranslated_mechanics(mechanics: dict, english: dict) -> list:
    """The sheets' texts (title, gist, points) with no English in data/summaries/en.json."""
    texts = []
    for sheet in mechanics.values():
        texts += [sheet.get("title"), sheet.get("gist"), *(sheet.get("points") or [])]
    return [t for t in texts if t and t not in english]


def validate_wanted(wanted: dict, vocab: dict, snapshot: dict) -> list:
    """Errors in wanted.json: each key a wanted-poster monster of the snapshot, each entry valid as in a dungeon."""
    kinds = {str(m["id"]): m.get("kind") for m in snapshot["monsters"]}
    errors = [f"wanted: monster {mid} is not a wanted-poster monster" for mid in wanted.get("monsters") or {}
              if kinds.get(mid) != "wanted"]
    for mid, entry in (wanted.get("monsters") or {}).items():
        guide = entry.get("guide") or ""
        if guide and not guide.startswith("https://www.dofuspourlesnoobs.com/"):
            errors.append(f"wanted: monster {mid}: guide must be a DPLN link")
    # the same checks as a dungeon holding exactly these monsters
    dungeon = {"id": 0, "name": "wanted", "monsterIds": [int(m) for m in wanted.get("monsters") or {} if m.lstrip("-").isdigit()]}
    as_dungeon = {"dungeonId": 0, "status": wanted.get("status"), "monsters": wanted.get("monsters") or {}}
    return errors + validate(as_dungeon, vocab, {**snapshot, "dungeons": [dungeon]})


def validate_written(written: dict, vocab: dict, snapshot: dict) -> list:
    """Errors in monsters-written.json: each key a monster of the snapshot, each entry valid as in a dungeon."""
    known = {str(m["id"]) for m in snapshot["monsters"]}
    errors = [f"monsters-written: monster {mid} is not in the snapshot" for mid in written.get("monsters") or {}
              if mid not in known]
    for mid, entry in (written.get("monsters") or {}).items():
        guide = entry.get("guide") or ""
        if guide and not guide.startswith("https://www.dofuspourlesnoobs.com/"):
            errors.append(f"monsters-written: monster {mid}: guide must be a DPLN link")
    dungeon = {"id": 0, "name": "monsters-written", "monsterIds": [int(m) for m in written.get("monsters") or {} if m in known]}
    as_dungeon = {"dungeonId": 0, "status": written.get("status"), "monsters": {k: v for k, v in (written.get("monsters") or {}).items() if k in known}}
    return errors + validate(as_dungeon, vocab, {**snapshot, "dungeons": [dungeon]})


def untranslated(summary: dict, english: dict) -> list:
    """The written texts of a summary with no English in data/summaries/en.json (strategy, details, badge parameters
    written by hand; parameters derived from spells are translated piece by piece and not checked here)."""
    texts = [summary.get("strategy")]
    texts += [t.get("param") for t in summary.get("roomTags") or [] if t.get("source") != "spells"]
    for entry in (summary.get("monsters") or {}).values():
        texts.append(entry.get("detail"))
        texts += [t.get("param") for t in entry.get("tags") or [] if t.get("source") != "spells"]
    return [t for t in texts if t and t not in english]


def build_index(folder: Path, out: Path) -> int:
    """Merges dungeons/*.json into one file keyed by dungeon id; returns how many dungeons."""
    index = {}
    for file in sorted(Path(folder).glob("*.json")):
        data = load_json(file)
        index[str(data["dungeonId"])] = data
    Path(out).write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(index)


def build_zones(folder: Path, out: Path) -> int:
    """Merges zones/*.json into one file keyed by zone name (the sub-area as the game writes it)."""
    index = {}
    for file in sorted(Path(folder).glob("*.json")):
        data = load_json(file)
        index[data["zone"]] = data
    Path(out).write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(index)


REFLECT_BADGE = 20  # damage sent back from which a monster gets the « Renvoie » badge (the Krokilles' 5 or 10 do not)


def build_monsters(folder: Path, snapshot: dict, out: Path) -> int:
    """Badges for every monster, wherever it is met (a zone, a wanted poster…): its entry in a dungeon summary, in
    wanted.json or in monsters-written.json when it has one, else the badges derived from its spells
    (`tools/derive.py`). Every monster gets an entry (`{"tags": []}` when nothing applies: the card then says there is
    nothing dangerous). Returns how many monsters have an entry."""
    from tools.derive import derive

    spells = {s["id"]: s for s in snapshot["spells"]}
    from_dungeons = {}
    for file in sorted(Path(folder).glob("*.json")) + sorted((Path(folder).parent / "zones").glob("*.json")):
        for mid, entry in (load_json(file).get("monsters") or {}).items():
            from_dungeons.setdefault(mid, entry)
    for name in ("wanted.json", "monsters-written.json"):
        path = Path(folder).parent / name
        if path.exists():
            for mid, entry in (load_json(path).get("monsters") or {}).items():
                from_dungeons.setdefault(mid, entry)
    result = {}
    for m in snapshot["monsters"]:
        key = str(m["id"])
        if key in from_dungeons:
            result[key] = from_dungeons[key]
        else:
            derived = derive([spells[i] for i in m["spellIds"] if i in spells])
            result[key] = {"tags": derived["tags"], **({"harmless": True} if derived["harmless"] else {})}
        # the damage it sends back (a stat of the monster, not a spell: Gros Med 50), when it hurts
        reflect = m.get("reflect", 0)
        tags = result[key].get("tags") or []
        if reflect >= REFLECT_BADGE and not any(t["id"] == "reflect" for t in tags) and len(tags) < 6:
            entry = dict(result[key])
            entry["tags"] = tags + [{"id": "reflect", "param": f"{reflect} dommages", "source": "stat"}]
            entry.pop("harmless", None)
            result[key] = entry
    Path(out).write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(result)


def load_snapshot() -> dict:
    snap = ROOT / "data" / "snapshot"
    return {
        "dungeons": load_json(snap / "dungeons.json"),
        "monsters": load_json(snap / "monsters.json"),
        "spells": load_json(snap / "spells.json"),
    }


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    command = argv[0] if argv else "validate"
    if command == "validate":
        vocab, snapshot = load_json(SUMMARIES / "vocabulary.json"), load_snapshot()
        errors = []
        files = sorted((SUMMARIES / "dungeons").glob("*.json")) + sorted((SUMMARIES / "zones").glob("*.json"))
        english = (load_json(SUMMARIES / "en.json") if (SUMMARIES / "en.json").exists() else {}).get("text", {})
        mechanics = load_json(SUMMARIES / "mechanics.json") if (SUMMARIES / "mechanics.json").exists() else {}
        errors += validate_mechanics(mechanics)
        errors += [f"mechanics.json: no English in en.json for « {t} »" for t in untranslated_mechanics(mechanics, english)]
        for file in files:
            summary = load_json(file)
            errors += validate(summary, vocab, snapshot, mechanics)
            # every written text has its English (official Ankama names only, see docs/reading-grid.md)
            errors += [f"{file.name}: no English in en.json for « {t} »" for t in untranslated(summary, english)]
        if (SUMMARIES / "wanted.json").exists():
            files.append(SUMMARIES / "wanted.json")
            wanted = load_json(SUMMARIES / "wanted.json")
            errors += validate_wanted(wanted, vocab, snapshot)
            errors += [f"wanted.json: no English in en.json for « {t} »" for t in untranslated(wanted, english)]
        if (SUMMARIES / "monsters-written.json").exists():
            files.append(SUMMARIES / "monsters-written.json")
            written = load_json(SUMMARIES / "monsters-written.json")
            errors += validate_written(written, vocab, snapshot)
            # badges marked "source": "spells" are skipped by untranslated(), but these are written by hand
            texts = [t.get("param") for e in (written.get("monsters") or {}).values() for t in e.get("tags") or []]
            texts += [e.get("detail") for e in (written.get("monsters") or {}).values()]
            errors += [f"monsters-written.json: no English in en.json for « {t} »" for t in texts if t and t not in english]
        print("\n".join(errors) if errors else f"{len(files)} files valid")
        return 1 if errors else 0
    if command == "index":
        print(f"{build_index(SUMMARIES / 'dungeons', SUMMARIES / 'index.json')} dungeons indexed")
        print(f"{build_zones(SUMMARIES / 'zones', SUMMARIES / 'zones.json')} zones indexed")
        n = build_monsters(SUMMARIES / "dungeons", load_snapshot(), SUMMARIES / "monsters.json")
        print(f"{n} monsters (dungeon summaries, wanted.json, monsters-written.json, else derived from spells)")
        return 0
    if command in ("check", "accept", "changes"):
        from tools import consistency

        checked_path = SUMMARIES / "checked.json"
        checked = load_json(checked_path) if checked_path.exists() else {}
        snapshot = load_snapshot()
        if command == "check":
            result = consistency.differences(SUMMARIES, snapshot, checked)
            out = ROOT / ".cache" / "consistency.md"
            out.parent.mkdir(exist_ok=True)
            out.write_text(consistency.report(result), encoding="utf-8")
            print(f"{len(result['open'])} open differences ({result['stale']} asked again, spells changed), "
                  f"{result['accepted']} reviewed: {out}")
            return 1 if result["open"] else 0
        if command == "accept":
            mid, tag, reason = argv[1], argv[2], " ".join(argv[3:])
            if not reason:
                print("accept <monsterId> <tag> <reason>: the reason is required")
                return 2
            consistency.accept(checked, snapshot, mid, tag, reason)
            text = json.dumps(dict(sorted(checked.items(), key=lambda kv: int(kv[0]))), ensure_ascii=False, indent=1)
            checked_path.write_bytes((text + "\n").encode("utf-8"))
            print(f"{mid} {tag}: reviewed")
            return 0
        import subprocess

        ref = argv[1] if len(argv) > 1 else "HEAD"
        old = {k: json.loads(subprocess.run(["git", "show", f"{ref}:data/snapshot/{k}.json"], cwd=ROOT, check=True,
                                            capture_output=True).stdout.decode("utf-8"))
               for k in ("monsters", "spells")}
        diff = consistency.changes(old, snapshot)
        for kind in ("added", "removed", "changed"):
            print(f"{kind}: {len(diff[kind])}")
            for name, mid in diff[kind]:
                print(f"  {name} ({mid})")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
