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
    """The (kind, French, English) notes a commit message carries, in order. A Notes-kind line applies to the notes
    after it (one commit can carry a new feature and a fix)."""
    kind, fr, en = "change", [], []
    for key, value in TRAILER.findall(message):
        if key == "kind":
            if value not in KINDS:
                raise ReleaseNotesError(f"Notes-kind must be one of {', '.join(KINDS)}, not {value!r}")
            kind = value
        elif key == "fr":
            fr.append((kind, value))
        else:
            en.append(value)
    if len(fr) != len(en):
        first = message.strip().splitlines()[0] if message.strip() else "?"
        raise ReleaseNotesError(f"« {first} »: {len(fr)} Notes-fr for {len(en)} Notes-en (each French note needs its English one)")
    return [(k, f, e) for (k, f), e in zip(fr, en)]


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


# ---------- the commit check: the commit-msg hook (.githooks/) and the CI, on each push ----------

# what players see: the app's code and pages, and the data it shows (not its tests, the tools, docs or CI)
PLAYER_FACING = ("app/src/", "app/src-tauri/src/", "app/index.html", "app/preview.html", "app/peek.html", "data/summaries/",
                 "data/snapshot/", "data/guide/", "data/travel.json", "data/overrides.json")
NONE = re.compile(r"^Notes:\s*none\s*$", re.MULTILINE | re.IGNORECASE)


def player_facing(files: list[str]) -> list[str]:
    return [f for f in files if f.replace("\\", "/").startswith(PLAYER_FACING)]


def check_commit(message: str, files: list[str]) -> list[str]:
    """What is wrong with a commit's notes: malformed lines, or player-facing files with neither notes nor an explicit
    « Notes: none ». Merges and reverts pass."""
    first = message.strip().splitlines()[0] if message.strip() else ""
    if first.startswith(("Merge ", 'Revert "')):
        return []
    try:
        notes = notes_of(message)
    except ReleaseNotesError as e:
        return [str(e)]
    touched = player_facing(files)
    if touched and not notes and not NONE.search(message):
        shown = ", ".join(touched[:3]) + (f" (+{len(touched) - 3})" if len(touched) > 3 else "")
        return [f"« {first} » changes what players see ({shown}): end the message with Notes-fr: / Notes-en: lines "
                "written for players (Notes-kind: new | change | fix optional), or « Notes: none » if players will not "
                "notice it. See CONTRIBUTING.md, « Release notes »."]
    return []


def check_range(repo: Path, rev_range: str) -> list[str]:
    """The check on every commit of a range (the CI, after a push or on a pull request)."""
    errors = []
    for sha in _git(repo, "rev-list", "--reverse", "--no-merges", rev_range).split():
        message = _git(repo, "log", "-1", "--format=%B", sha)
        files = _git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", sha).split("\n")
        errors += [f"{sha[:7]}: {e}" for e in check_commit(message, [f for f in files if f])]
    return errors


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Draft docs/release-notes/vX.Y.Z.md from the commits' Notes-fr / Notes-en lines")
    parser.add_argument("tag", nargs="?", help="the release, e.g. v1.2.1")
    parser.add_argument("--summary-fr", help="one sentence, in French (latest.json, the in-app update)")
    parser.add_argument("--summary-en", help="the same sentence in English")
    parser.add_argument("--force", action="store_true", help="write the file again")
    parser.add_argument("--check-commit", metavar="MSGFILE", help="commit-msg hook: check the commit being made (its staged files)")
    parser.add_argument("--check-range", metavar="A..B", help="CI: check every commit of a range")
    args = parser.parse_args(argv)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # the « » quotes, in a Windows console too
    if args.check_commit or args.check_range:
        if args.check_commit:
            message = Path(args.check_commit).read_text(encoding="utf-8")
            # the commit's own message, without git's « # » help lines
            message = "\n".join(line for line in message.splitlines() if not line.startswith("#"))
            files = _git(ROOT, "diff", "--cached", "--name-only").split("\n")
            errors = check_commit(message, [f for f in files if f])
        else:
            errors = check_range(ROOT, args.check_range)
        for e in errors:
            print(f"release notes: {e}", file=sys.stderr)
        return 1 if errors else 0
    if not (args.tag and args.summary_fr and args.summary_en):
        parser.error("a tag, --summary-fr and --summary-en are needed to write the notes")
    try:
        out = write(ROOT, args.tag, args.summary_fr, args.summary_en, args.force)
    except ReleaseNotesError as e:
        print(f"release notes: {e}", file=sys.stderr)
        return 1
    print(f"{out.relative_to(ROOT)}: reread it before tagging")
    return 0


if __name__ == "__main__":
    sys.exit(main())
