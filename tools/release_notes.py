"""Drafts a release's player notes from the commits since the last tag: docs/release-notes/vX.Y.Z.md.

Commits are English and technical; the notes are for players, in French and English. So a commit that changes what
a player sees carries trailer lines, at the end of its message, written for players:

    Notes-kind: new          (optional: new, change or fix; « change » by default)
    Notes-fr: Les invocations des boss s'affichent sous eux, avec leur fiche.
    Notes-en: Bosses' summons now show under them, with their card.

Several Notes-fr / Notes-en pairs may follow each other in one commit (they pair up in order); a commit without them
(tests, refactoring, docs) adds nothing. The file gets the one-line summary (it goes into latest.json and the in-app
update), then « ## Français » and « ## English », each note on a single line (GitHub and Discord keep line breaks).

Usage: python -m tools.release_notes v1.2.1 --summary-fr "…" --summary-en "…" [--force]
The maintainer rereads the file before tagging.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KINDS = ("new", "change", "fix")
HEADINGS = {
    "fr": {"new": "Nouveautés", "change": "Améliorations", "fix": "Corrections"},
    "en": {"new": "New", "change": "Improvements", "fix": "Fixes"},
}
TRAILER = re.compile(r"^Notes-(kind|fr|en):\s*(.*?)\s*$", re.MULTILINE)


class ReleaseNotesError(Exception):
    pass


def notes_of(message: str) -> list[tuple[str, str, str]]:
    """The (kind, French, English) notes a commit message carries, in order."""
    kind, fr, en = "change", [], []
    for key, value in TRAILER.findall(message):
        if key == "kind":
            if value not in KINDS:
                raise ReleaseNotesError(f"Notes-kind must be one of {', '.join(KINDS)}, not {value!r}")
            kind = value
        elif key == "fr":
            fr.append(value)
        else:
            en.append(value)
    if len(fr) != len(en):
        first = message.strip().splitlines()[0] if message.strip() else "?"
        raise ReleaseNotesError(f"« {first} »: {len(fr)} Notes-fr for {len(en)} Notes-en (each French note needs its English one)")
    return [(kind, f, e) for f, e in zip(fr, en)]


def build(notes: list[tuple[str, str, str]], summary_fr: str, summary_en: str) -> str:
    """The notes file: summary line, then the French and the English notes grouped by kind."""
    if not notes:
        raise ReleaseNotesError("no notes in these commits: add Notes-fr / Notes-en lines (a later commit can carry them)")
    out = [f"{summary_fr} / {summary_en}", ""]
    for lang, column in (("fr", 1), ("en", 2)):
        out += [f"## {'Français' if lang == 'fr' else 'English'}", ""]
        for kind in KINDS:
            lines = [n[column] for n in notes if n[0] == kind]
            if lines:
                out += [f"**{HEADINGS[lang][kind]}**", *(f"- {line}" for line in lines), ""]
    return "\n".join(out).rstrip("\n") + "\n"


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True, encoding="utf-8").stdout


def previous_tag(repo: Path, tag: str | None = None) -> str:
    """The last tag before the release being prepared (HEAD's own tag set aside, if it is already tagged)."""
    found = _git(repo, "describe", "--tags", "--abbrev=0", "HEAD").strip()
    if found == tag:
        found = _git(repo, "describe", "--tags", "--abbrev=0", "HEAD^").strip()
    return found


def commit_notes(repo: Path, since: str) -> list[tuple[str, str, str]]:
    """The notes of the commits since `since`, oldest first."""
    log = _git(repo, "log", "--reverse", "--format=%B%x1e", f"{since}..HEAD")
    notes = []
    for message in log.split("\x1e"):
        if message.strip():
            notes += notes_of(message)
    return notes


def write(repo: Path, tag: str, summary_fr: str, summary_en: str, force: bool = False) -> Path:
    if not re.fullmatch(r"v\d+\.\d+\.\d+", tag):
        raise ReleaseNotesError(f"the tag must look like v1.2.3, not {tag!r}")
    out = repo / "docs" / "release-notes" / f"{tag}.md"
    if out.exists() and not force:
        raise ReleaseNotesError(f"{out} exists (--force to write it again)")
    text = build(commit_notes(repo, previous_tag(repo, tag)), summary_fr, summary_en)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8", newline="\n")
    return out


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Draft docs/release-notes/vX.Y.Z.md from the commits' Notes-fr / Notes-en lines")
    parser.add_argument("tag", help="the release, e.g. v1.2.1")
    parser.add_argument("--summary-fr", required=True, help="one sentence, in French (latest.json, the in-app update)")
    parser.add_argument("--summary-en", required=True, help="the same sentence in English")
    parser.add_argument("--force", action="store_true", help="write the file again")
    args = parser.parse_args(argv)
    try:
        out = write(ROOT, args.tag, args.summary_fr, args.summary_en, args.force)
    except ReleaseNotesError as e:
        print(f"release notes: {e}", file=sys.stderr)
        return 1
    print(f"{out.relative_to(ROOT)}: reread it before tagging")
    return 0


if __name__ == "__main__":
    sys.exit(main())
