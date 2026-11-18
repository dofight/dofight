"""Cached, rate-limited client for the Dofensive bestiary API (dev time only)."""

import json
import time
import urllib.request
from pathlib import Path

BASE = "https://dofensive.com/api/dofus2/bestiary/"
USER_AGENT = "Dofight-snapshot"


class DofensiveError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(f"Dofensive error {code}: {message}")
        self.code = code
        self.message = message


class Dofensive:
    def __init__(self, cache_dir: Path, delay: float = 0.3, refresh: bool = False, opener=urllib.request.urlopen,
                 lang: str = "fr"):
        self.cache_dir = Path(cache_dir)
        self.lang = lang
        self.delay = delay
        self.refresh = refresh
        self.opener = opener
        self._refreshed: set[str] = set()

    def get(self, path: str):
        """The response's Data for `path` (e.g. "monsters/101"), from the cache when present."""
        file = self.cache_dir / (path.replace("/", "_") + ".json")
        use_cache = file.exists() and (not self.refresh or path in self._refreshed)
        if use_cache:
            raw = file.read_bytes()
        else:
            raw = self._fetch(path)
        body = json.loads(raw)
        errors = body.get("Errors") or []
        if errors:
            raise DofensiveError(errors[0].get("Code"), errors[0].get("Message", ""))
        if not use_cache:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            file.write_bytes(raw)
            self._refreshed.add(path)
        return body["Data"]

    def _fetch(self, path: str) -> bytes:
        if self.delay:
            time.sleep(self.delay)
        req = urllib.request.Request(f"{BASE}{path}?lang={self.lang}", headers={"User-Agent": USER_AGENT})
        with self.opener(req) as resp:
            return resp.read()
