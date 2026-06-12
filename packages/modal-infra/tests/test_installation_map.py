import json

import pytest

from src.auth.installation_map import parse_installation_map, resolve_installation_id


@pytest.fixture(autouse=True)
def clear_installation_env(monkeypatch):
    monkeypatch.delenv("GITHUB_APP_INSTALLATION_MAP", raising=False)
    monkeypatch.delenv("GITHUB_APP_INSTALLATION_ID", raising=False)


def test_parse_installation_map_returns_empty_for_invalid_json(monkeypatch):
    monkeypatch.setenv("GITHUB_APP_INSTALLATION_MAP", "{bad json")
    assert parse_installation_map() == {}


def test_parse_installation_map_lowercases_owner_keys(monkeypatch):
    monkeypatch.setenv(
        "GITHUB_APP_INSTALLATION_MAP",
        json.dumps({"Org-A": "111111", "org_b": "222222", "skip": 123}),
    )
    assert parse_installation_map() == {"org-a": "111111", "org_b": "222222"}


def test_resolve_installation_id_uses_map_then_default(monkeypatch):
    monkeypatch.setenv("GITHUB_APP_INSTALLATION_ID", "999999")
    monkeypatch.setenv(
        "GITHUB_APP_INSTALLATION_MAP",
        json.dumps({"org-a": "111111"}),
    )

    assert resolve_installation_id("Org-A") == "111111"
    assert resolve_installation_id("other-org") == "999999"
    assert resolve_installation_id(None) == "999999"
