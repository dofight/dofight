import json
import re
from pathlib import Path


def test_committed_snapshot_has_no_raw_ids_or_templates():
    """The effect texts read as text: no template marks left, no bare number in place of a spell, monster or state."""
    spells = json.loads((Path(__file__).resolve().parents[2] / "data" / "snapshot" / "spells.json").read_text(encoding="utf-8"))
    def walk(effects):  # the effects of a spell an effect casts are nested under it (`then`)
        for e in effects:
            yield e
            yield from walk(e.get("then", []))

    effects = [e for s in spells for e in walk(s["effects"])]
    texts = [e["text"] for e in effects] + [e["trigger"] for e in effects if "trigger" in e] + [c for s in spells for c in s["conditions"]]
    bad = [t for t in texts if re.search(r"^(Invoque : |État )\d+( \(\d+ tours?\))?$|^\d{3,} \(|Dommagess|[#{}|~]", t)]
    assert bad == []
