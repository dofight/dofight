"""Reads the players' suggestions from the Dofight Discord (#suggestions-in-app), read-only.

python -m tools.discord          # the messages posted since the last read
python -m tools.discord --all    # the last 100 messages, read or not

Each message goes to .cache/discord/<message id>.md (its text, the embed the app sends: title, description, fields)
and its attachments (dofight-log.txt…) to .cache/discord/<message id>/. The ids printed at the end are the new ones.

The bot token and the channel id live outside the repo, in ~/.dofight/discord-token and ~/.dofight/discord-channel
(the « Dofight Engineer » bot, which can only view the channel and read its history). Nothing is ever written to Discord.
"""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / ".cache" / "discord"
STATE = OUT / "state.json"
API = "https://discord.com/api/v10"
TOKEN_FILE = Path.home() / ".dofight" / "discord-token"
CHANNEL_FILE = Path.home() / ".dofight" / "discord-channel"  # the id of #suggestions-in-app
USER_AGENT = "DiscordBot (https://github.com/dofight, 1.0)"


def channel() -> str:
    return CHANNEL_FILE.read_bytes().decode("utf-8-sig").strip()


def token() -> str:
    raw = TOKEN_FILE.read_bytes()
    for bom in (b"\xef\xbb\xbf", b"\xff\xfe"):
        if raw.startswith(bom):
            raw = raw[len(bom):]
    text = raw.decode("utf-16-le" if b"\x00" in raw else "utf-8")
    return text.strip()


def get(url: str, auth: bool = True) -> bytes:
    headers = {"User-Agent": USER_AGENT}
    if auth:
        headers["Authorization"] = f"Bot {token()}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as resp:
        return resp.read()


def as_markdown(m: dict) -> str:
    lines = [f"# Message {m['id']}", f"From: {m['author'].get('username', '?')} · {m['timestamp']}", ""]
    if m.get("content"):
        lines += [m["content"], ""]
    for e in m.get("embeds") or []:
        if e.get("title"):
            lines.append(f"## {e['title']}")
        if e.get("description"):
            lines += [e["description"], ""]
        for f in e.get("fields") or []:
            lines += [f"**{f.get('name', '')}**", f.get("value", ""), ""]
    for a in m.get("attachments") or []:
        lines.append(f"Attachment: {m['id']}/{a['filename']}")
    return "\n".join(lines).rstrip() + "\n"


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    OUT.mkdir(parents=True, exist_ok=True)
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    after = None if "--all" in argv else state.get("last")
    url = f"{API}/channels/{channel()}/messages?limit=100" + (f"&after={after}" if after else "")
    try:
        messages = sorted(json.loads(get(url)), key=lambda m: int(m["id"]))
    except urllib.error.HTTPError as e:
        reason = {401: "the token is wrong (~/.dofight/discord-token)",
                  403: "the bot cannot see #suggestions-in-app: give it View Channel and Read Message History there"}
        print(f"Discord said {e.code}: {reason.get(e.code, e.read()[:200])}")
        return 1
    for m in messages:
        (OUT / f"{m['id']}.md").write_text(as_markdown(m), encoding="utf-8")
        for a in m.get("attachments") or []:
            folder = OUT / m["id"]
            folder.mkdir(exist_ok=True)
            # Discord's CDN link is signed: no token needed (nor sent)
            (folder / Path(a["filename"]).name).write_bytes(get(a["url"], auth=False))
    if messages:
        state["last"] = max(messages[-1]["id"], state.get("last") or "0", key=int)
        STATE.write_text(json.dumps(state), encoding="utf-8")
    print(f"{len(messages)} message(s) in {OUT}")
    for m in messages:
        print(f"  {m['id']}  {m['timestamp'][:16]}  {(m.get('embeds') or [{}])[0].get('title') or (m.get('content') or '')[:60]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
