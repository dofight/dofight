import subprocess

import pytest

from tools.release_notes import ReleaseNotesError, build, check_commit, notes_of, player_facing, previous_tag, write


def test_reads_the_trailer_lines_of_a_commit_message():
    message = """Boss summons shown under their boss

Technical details that players never read.

Notes-kind: new
Notes-fr: Les invocations des boss s'affichent sous eux.
Notes-en: Bosses' summons now show under them.
"""
    assert notes_of(message) == [("new", "Les invocations des boss s'affichent sous eux.", "Bosses' summons now show under them.")]


def test_a_commit_without_notes_gives_nothing_and_kind_defaults_to_change():
    assert notes_of("Tests: one more case\n\nNo player-visible change.") == []
    assert notes_of("x\n\nNotes-fr: Un texte.\nNotes-en: A text.") == [("change", "Un texte.", "A text.")]


def test_several_notes_in_one_commit_pair_up_in_order():
    message = "x\n\nNotes-fr: Un.\nNotes-en: One.\nNotes-fr: Deux.\nNotes-en: Two."
    assert notes_of(message) == [("change", "Un.", "One."), ("change", "Deux.", "Two.")]


def test_a_kind_line_applies_to_the_notes_after_it():
    message = "x\n\nNotes-kind: new\nNotes-fr: Un.\nNotes-en: One.\nNotes-kind: fix\nNotes-fr: Deux.\nNotes-en: Two."
    assert notes_of(message) == [("new", "Un.", "One."), ("fix", "Deux.", "Two.")]


def test_a_french_note_without_its_english_one_is_refused():
    with pytest.raises(ReleaseNotesError, match="English"):
        notes_of("x\n\nNotes-fr: Seulement en français.")
    with pytest.raises(ReleaseNotesError, match="kind"):
        notes_of("x\n\nNotes-kind: big\nNotes-fr: Un.\nNotes-en: One.")


def test_builds_the_notes_file_summary_then_french_then_english_one_line_per_bullet():
    notes = [("fix", "Gros Med apparaît.", "Gros Med shows up."), ("new", "Les invocations s'affichent.", "Summons show.")]
    text = build(notes, "Dofight 1.2.1 : les invocations.", "Dofight 1.2.1: summons.")
    assert text == (
        "Dofight 1.2.1 : les invocations. / Dofight 1.2.1: summons.\n"
        "\n"
        "## Français\n"
        "\n"
        "**Nouveautés**\n"
        "- Les invocations s'affichent.\n"
        "\n"
        "**Corrections**\n"
        "- Gros Med apparaît.\n"
        "\n"
        "## English\n"
        "\n"
        "**New**\n"
        "- Summons show.\n"
        "\n"
        "**Fixes**\n"
        "- Gros Med shows up.\n"
    )


def test_nothing_to_say_is_refused():
    with pytest.raises(ReleaseNotesError, match="no notes"):
        build([], "a", "b")


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True, encoding="utf-8").stdout


def test_gathers_the_notes_of_the_commits_since_the_last_tag(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q")
    git(repo, "config", "user.email", "t@example.com")
    git(repo, "config", "user.name", "T")
    git(repo, "commit", "-q", "--allow-empty", "-m", "Old\n\nNotes-fr: Ancien.\nNotes-en: Old.")
    git(repo, "tag", "v1.0.0")
    git(repo, "commit", "-q", "--allow-empty", "-m", "Internal only")
    git(repo, "commit", "-q", "--allow-empty", "-m", "Feature\n\nNotes-kind: new\nNotes-fr: Nouveau.\nNotes-en: New one.")
    assert previous_tag(repo) == "v1.0.0"
    out = write(repo, "v1.1.0", "Résumé.", "Summary.")
    text = out.read_text(encoding="utf-8")
    assert out == repo / "docs" / "release-notes" / "v1.1.0.md"
    assert "- Nouveau." in text and "- New one." in text and "Ancien" not in text
    with pytest.raises(ReleaseNotesError, match="exists"):
        write(repo, "v1.1.0", "Résumé.", "Summary.")


# ---------- the commit check (.githooks/commit-msg, and the CI on each push) ----------


def test_player_facing_files_are_the_app_and_the_data_players_see():
    assert player_facing(["app/src/main.ts", "tests/tools/test_x.py"]) == ["app/src/main.ts"]
    assert player_facing(["app/src-tauri/src/screen.rs", "data/summaries/dungeons/57.json", "data/guide/corner-fr.png"])
    assert player_facing(["app/tests/guide.test.ts", "tools/release_notes.py", "private/docs/TODO.md", "README.md", ".github/workflows/tests.yml"]) == []


def test_a_commit_touching_what_players_see_needs_notes_or_an_explicit_none():
    files = ["app/src/main.ts"]
    assert check_commit("Fix\n\nNotes-fr: Un.\nNotes-en: One.", files) == []
    assert check_commit("Refactor\n\nNotes: none", files) == []
    errors = check_commit("Refactor the panel", files)
    assert len(errors) == 1 and "Notes: none" in errors[0] and "app/src/main.ts" in errors[0]


def test_an_internal_commit_needs_nothing_but_malformed_notes_are_always_refused():
    assert check_commit("Tests: one more case", ["tests/tools/test_x.py"]) == []
    assert "English" in check_commit("x\n\nNotes-fr: Seul.", ["tests/tools/test_x.py"])[0]


def test_merges_and_reverts_pass():
    assert check_commit("Merge branch 'x'", ["app/src/main.ts"]) == []
    assert check_commit('Revert "Something"', ["app/src/main.ts"]) == []
