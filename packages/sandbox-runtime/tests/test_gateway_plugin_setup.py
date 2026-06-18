"""Tests for SandboxSupervisor._deploy_gateway_plugin().

The entrypoint owns the single authoritative "the LLM gateway is live in this
sandbox" decision: it deploys gateway-plugin.js + re-keys the default model only
when the plugin is present in the image AND GATEWAY_TOKEN is set, and it marks
that state via GATEWAY_ACTIVE so the bridge re-keys per-prompt models too (CON-75).
"""

import os
from unittest.mock import patch

import pytest

import sandbox_runtime.entrypoint as entrypoint
from sandbox_runtime.constants import GATEWAY_ACTIVE_ENV, GATEWAY_PROVIDER_ID
from sandbox_runtime.entrypoint import SandboxSupervisor


@pytest.fixture(autouse=True)
def _isolate_environ():
    """Snapshot os.environ so the production write to GATEWAY_ACTIVE (which the real
    sandbox makes for the bridge subprocess to inherit) doesn't leak between tests."""
    with patch.dict(os.environ, {}, clear=False):
        yield


def _make_supervisor() -> SandboxSupervisor:
    """Create a SandboxSupervisor with default test config."""
    with patch.dict(
        "os.environ",
        {
            "SANDBOX_ID": "test-sandbox",
            "CONTROL_PLANE_URL": "https://cp.example.com",
            "SANDBOX_AUTH_TOKEN": "tok",
            "REPO_OWNER": "acme",
            "REPO_NAME": "app",
        },
    ):
        return SandboxSupervisor()


class TestDeployGatewayPlugin:
    """Cases for _deploy_gateway_plugin()."""

    def test_active_copies_plugin_marks_active_and_rekeys_model(self, tmp_path, monkeypatch):
        """Plugin present + token → copy plugin, set GATEWAY_ACTIVE, return routed model."""
        sup = _make_supervisor()
        source = tmp_path / "gateway-plugin.js"
        source.write_text("// gateway plugin")
        opencode_dir = tmp_path / ".opencode"

        monkeypatch.setenv("GATEWAY_TOKEN", "gw-tok")
        monkeypatch.delenv(GATEWAY_ACTIVE_ENV, raising=False)

        with patch.object(entrypoint, "GATEWAY_PLUGIN_SOURCE", source):
            routed = sup._deploy_gateway_plugin(opencode_dir, "anthropic", "claude-sonnet-4-6")

        assert routed == f"{GATEWAY_PROVIDER_ID}/anthropic/claude-sonnet-4-6"
        assert os.environ.get(GATEWAY_ACTIVE_ENV) == "1"
        assert (opencode_dir / "plugins" / "gateway-plugin.js").read_text() == "// gateway plugin"

    def test_no_token_returns_none_and_clears_stale_active(self, tmp_path, monkeypatch):
        """No token → no gateway; a stale/spoofed GATEWAY_ACTIVE is cleared, no copy."""
        sup = _make_supervisor()
        source = tmp_path / "gateway-plugin.js"
        source.write_text("// gateway plugin")
        opencode_dir = tmp_path / ".opencode"

        monkeypatch.delenv("GATEWAY_TOKEN", raising=False)
        monkeypatch.setenv(GATEWAY_ACTIVE_ENV, "1")

        with patch.object(entrypoint, "GATEWAY_PLUGIN_SOURCE", source):
            routed = sup._deploy_gateway_plugin(opencode_dir, "anthropic", "claude-sonnet-4-6")

        assert routed is None
        assert GATEWAY_ACTIVE_ENV not in os.environ
        assert not (opencode_dir / "plugins").exists()

    def test_missing_plugin_source_returns_none_even_with_token(self, tmp_path, monkeypatch):
        """Pre-gateway snapshot image (plugin file absent) → no gateway, clear active."""
        sup = _make_supervisor()
        source = tmp_path / "does-not-exist.js"
        opencode_dir = tmp_path / ".opencode"

        monkeypatch.setenv("GATEWAY_TOKEN", "gw-tok")
        monkeypatch.setenv(GATEWAY_ACTIVE_ENV, "1")

        with patch.object(entrypoint, "GATEWAY_PLUGIN_SOURCE", source):
            routed = sup._deploy_gateway_plugin(opencode_dir, "anthropic", "claude-sonnet-4-6")

        assert routed is None
        assert GATEWAY_ACTIVE_ENV not in os.environ
