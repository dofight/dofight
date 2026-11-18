import subprocess

import pytest

from tools.release_notes import ReleaseNotesError, build, notes_of, previous_tag, write


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
