import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures" / "dofensive"


def load(name: str):
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))["Data"]


def spell_effects(spell_id: int) -> list[dict]:
    level = load(f"spells_{spell_id}")[0]["Levels"][-1]
    return [e for group in level.get("GroupEffects") or [] for e in group["Effects"]]


@pytest.fixture
def fixtures():
    return FIXTURES
