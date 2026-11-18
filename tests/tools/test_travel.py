from tools.travel import zone_spot


def _map(x, y, world=1):
    return {"posX": x, "posY": y, "worldMap": world}


def test_zone_spot_is_the_map_nearest_the_middle_on_the_main_world_map():
    maps = [_map(0, 0), _map(1, 0), _map(2, 0), _map(1, 1), _map(50, 50, world=7)]
    assert zone_spot(maps) == {"x": 1, "y": 0, "world": 1}


def test_zone_spot_without_maps():
    assert zone_spot([]) is None
    assert zone_spot([_map(0, 0, world=-1)]) is None
