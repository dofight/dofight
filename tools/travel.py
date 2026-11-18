"""Where to travel for each dungeon and zone, and the zaaps (dev time only): data/travel.json.

Dofensive has no positions for zaaps nor dungeon entrances, DofusDB (api.dofusdb.fr, the game data) has them: the
zaaps are the map hints of category 9 named « Zaap », a dungeon has its entrance map, a sub-area its maps; every
map's coordinates come from map-positions. Responses are cached in .cache/dofusdb (never fetched twice unless
--refresh).

Output: {"zaaps": [{"x", "y", "world", "zone": {"fr", "en"}}],
         "dungeons": {"<dungeon id>": {"x", "y", "world"}},   # the entrance
         "zones": {"<French sub-area name>": {"x", "y", "world"}},  # the zone's map nearest to its middle
         "zoneNames": ["<French sub-area name>", …],
         "zoneAreas": [["<French area name>", "<English>"], …],  # each zone's area (« Île de Frigost »), same order
         "places": {"<x>,<y>": [<index in zoneNames>, …]}}  # the zones with monsters at those map coordinates
The places let the zone reading find a zone by the coordinates of the map header when the OCR garbles its name.
"""

import argparse
import json
import time
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://api.dofusdb.fr/"
USER_AGENT = "Dofight-snapshot"
PAGE = 50  # DofusDB's largest page


class DofusDB:
    def __init__(self, cache_dir: Path, delay: float = 0.3, refresh: bool = False, opener=urllib.request.urlopen):
        self.cache_dir = Path(cache_dir)
        self.delay = delay
        self.refresh = refresh
        self.opener = opener

    def page(self, table: str, skip: int, query: str = "") -> dict:
        path = self.cache_dir / f"{table}{query.replace('&', '_').replace('=', '-')}_{skip}.json"
        if path.exists() and not self.refresh:
            return json.loads(path.read_text(encoding="utf-8"))
        url = f"{BASE}{table}?$limit={PAGE}&$skip={skip}{'&' + query if query else ''}"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with self.opener(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        time.sleep(self.delay)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return data

    def all(self, table: str, query: str = "", log=print) -> list:
        first = self.page(table, 0, query)
        rows, total = list(first["data"]), first["total"]
        for skip in range(PAGE, total, PAGE):
            rows += self.page(table, skip, query)["data"]
            if skip % 2000 == 0:
                log(f"{table}: {skip}/{total}")
        return rows


def _spot(pos: dict) -> dict:
    return {"x": pos["posX"], "y": pos["posY"], "world": pos["worldMap"]}


def zone_spot(maps: list) -> dict | None:
    """A zone's map nearest to the middle of its maps, on the world map most of them are on (a zone may hold a few
    maps elsewhere: a house, a cave)."""
    maps = [m for m in maps if m.get("worldMap", -1) >= 0]
    if not maps:
        return None
    world = Counter(m["worldMap"] for m in maps).most_common(1)[0][0]
    on = [m for m in maps if m["worldMap"] == world]
    cx = sum(m["posX"] for m in on) / len(on)
    cy = sum(m["posY"] for m in on) / len(on)
    return _spot(min(on, key=lambda m: ((m["posX"] - cx) ** 2 + (m["posY"] - cy) ** 2, m["posX"], m["posY"])))


def build(db: DofusDB, snapshot: Path, log=print) -> dict:
    positions = {p["id"]: p for p in db.all("map-positions", log=log)}
    subareas = {s["id"]: s for s in db.all("subareas", log=log)}
    dungeons = db.all("dungeons", log=log)
    hints = db.all("hints", "categoryId=9", log=log)
    areas = {a["id"]: a["name"] for a in db.all("areas", log=log)}

    zaaps = []
    for h in hints:
        if h["name"].get("fr") != "Zaap":
            continue
        zone = subareas.get(h["subareaId"], {}).get("name", {})
        zaaps.append({"x": h["x"], "y": h["y"], "world": h["worldMapId"], "zone": {"fr": zone.get("fr", ""), "en": zone.get("en", "")}})
    zaaps.sort(key=lambda z: (z["world"], z["x"], z["y"]))

    # Dofensive's dungeon ids are the game's, like DofusDB's: checked by name
    ours = {d["id"]: d["name"] for d in json.loads((snapshot / "dungeons.json").read_text(encoding="utf-8"))}
    # an entrance is often an indoor map (no world map), still at the coordinates of the place outside: the world is
    # then the one of the outdoor maps at those coordinates
    worlds: dict[tuple, Counter] = {}
    for p in positions.values():
        if p.get("worldMap", -1) >= 0:
            worlds.setdefault((p["posX"], p["posY"]), Counter())[p["worldMap"]] += 1
    entrances = {}
    for d in dungeons:
        pos = positions.get(d.get("entranceMapId"))
        if pos and pos.get("worldMap", -1) < 0 and (pos["posX"], pos["posY"]) in worlds:
            pos = dict(pos, worldMap=worlds[(pos["posX"], pos["posY"])].most_common(1)[0][0])
        if d["id"] in ours and pos and pos.get("worldMap", -1) >= 0:
            if d["name"].get("fr") != ours[d["id"]]:
                log(f"dungeon {d['id']}: « {ours[d['id']]} » here, « {d['name'].get('fr')} » on DofusDB")
            entrances[str(d["id"])] = _spot(pos)

    by_zone: dict[int, list] = {}
    for p in positions.values():
        by_zone.setdefault(p.get("subAreaId"), []).append(p)
    names = {z for m in json.loads((snapshot / "monsters.json").read_text(encoding="utf-8")) for z in m["subareas"]}
    zones = {}
    for sid, s in subareas.items():
        name = s["name"].get("fr", "")
        spot = zone_spot(by_zone.get(sid, []))
        if name in names and spot and name not in zones:
            zones[name] = spot
    # every map's coordinates (indoor maps too: the header shows the coordinates of the place outside) → its zones
    zone_names = sorted({subareas[p["subAreaId"]]["name"].get("fr", "") for p in positions.values()
                         if p.get("subAreaId") in subareas} & names)
    index = {n: i for i, n in enumerate(zone_names)}
    # the area a zone belongs to: the map header shows « <area> (<zone>) », and sometimes only the area is read
    area_of = {}
    for sa in subareas.values():
        name = sa["name"].get("fr", "")
        if name in index and name not in area_of:
            area = areas.get(sa.get("areaId"), {})
            area_of[name] = [area.get("fr", ""), area.get("en", "")]
    zone_areas = [area_of.get(n, ["", ""]) for n in zone_names]
    places: dict[str, set] = {}
    for p in positions.values():
        name = subareas.get(p.get("subAreaId"), {}).get("name", {}).get("fr", "")
        if name in index:
            places.setdefault(f"{p['posX']},{p['posY']}", set()).add(index[name])
    missing = sorted(names - zones.keys())
    log(f"{len(zaaps)} zaaps, {len(entrances)}/{len(ours)} dungeon entrances, {len(zones)}/{len(names)} zones"
        + (f" (no place: {', '.join(missing[:12])}{'…' if len(missing) > 12 else ''})" if missing else ""))
    return {"zaaps": zaaps, "dungeons": dict(sorted(entrances.items(), key=lambda kv: int(kv[0]))), "zones": dict(sorted(zones.items())),
            "zoneNames": zone_names, "zoneAreas": zone_areas, "places": {k: sorted(v) for k, v in sorted(places.items())}}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args(argv)
    out = build(DofusDB(ROOT / ".cache" / "dofusdb", refresh=args.refresh), ROOT / "data" / "snapshot")
    (ROOT / "data" / "travel.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # the zaap's map icon, shown on the zaap button (the game's hint icon 410)
    icon = ROOT / "data" / "icons" / "hud" / "zaap.png"
    if not icon.exists():
        req = urllib.request.Request(BASE + "img/hints/410.png", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp:
            icon.write_bytes(resp.read())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
