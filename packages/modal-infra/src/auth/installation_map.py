"""Resolve GitHub App installation IDs from owner login."""

from __future__ import annotations

import json
import os


def parse_installation_map() -> dict[str, str]:
    raw = os.environ.get("GITHUB_APP_INSTALLATION_MAP", "{}")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    return {str(owner).lower(): value for owner, value in parsed.items() if isinstance(value, str)}


def resolve_installation_id(repo_owner: str | None) -> str | None:
    default = os.environ.get("GITHUB_APP_INSTALLATION_ID")
    if not repo_owner:
        return default
    return parse_installation_map().get(repo_owner.lower(), default)
