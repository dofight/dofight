import io

import pytest

from tools.dofensive import Dofensive, DofensiveError

OK = b'{"Data":[{"Id":1}],"Errors":[]}'


def recording_opener(calls, body=OK):
    def opener(req):
        calls.append(req)
        return io.BytesIO(body)
    return opener


def test_get_builds_url_with_lang_and_caches(tmp_path):
    calls = []
    api = Dofensive(tmp_path, delay=0, opener=recording_opener(calls))
    assert api.get("monsters/1") == [{"Id": 1}]
    assert api.get("monsters/1") == [{"Id": 1}]
    assert [c.full_url for c in calls] == ["https://dofensive.com/api/dofus2/bestiary/monsters/1?lang=fr"]


def test_refresh_fetches_again(tmp_path):
    calls = []
    Dofensive(tmp_path, delay=0, opener=recording_opener(calls)).get("monsters/1")
    Dofensive(tmp_path, delay=0, refresh=True, opener=recording_opener(calls)).get("monsters/1")
    assert len(calls) == 2


def test_errors_raise_and_are_not_cached(tmp_path):
    body = b'{"Data":[],"Errors":[{"Code":2001,"Message":"The lang is missing or not supported."}]}'
    calls = []
    api = Dofensive(tmp_path, delay=0, opener=recording_opener(calls, body))
    with pytest.raises(DofensiveError) as e:
        api.get("dungeons/preview")
    assert e.value.code == 2001
    with pytest.raises(DofensiveError):
        api.get("dungeons/preview")
    assert len(calls) == 2


def test_user_agent(tmp_path):
    calls = []
    Dofensive(tmp_path, delay=0, opener=recording_opener(calls)).get("monsters/1")
    assert calls[0].get_header("User-agent") == "Dofight-snapshot"
