"""Tests for LLM gateway env-var injection and raw-secret dropping.

When the LLM gateway is enabled (a non-empty gateway_token is supplied), the
sandbox must receive GATEWAY_TOKEN / GATEWAY_BASE_URL and the raw llm_secrets
(containing ANTHROPIC_API_KEY) must NOT be passed to the sandbox. Empty-string
tokens are treated the same as None (gateway off). Both the create path and the
restore path must behave identically.
"""

import pytest

from src.sandbox.manager import SandboxConfig, SandboxManager


def _fake_sandbox_create(captured):
    """Return a fake Sandbox.create that supports .aio and captures env + secrets."""

    async def fake_create_aio(*args, **kwargs):
        captured["env"] = kwargs.get("env")
        captured["secrets"] = kwargs.get("secrets")

        class FakeSandbox:
            object_id = "obj-gateway"
            stdout = None

        return FakeSandbox()

    fake_create_aio.aio = fake_create_aio
    return fake_create_aio


# ---------------------------------------------------------------------------
# create_sandbox
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_gateway_enabled_injects_vars_and_drops_secrets(monkeypatch):
    """Gateway on → GATEWAY_TOKEN/GATEWAY_BASE_URL in env, raw llm_secrets dropped."""
    captured = {}
    monkeypatch.setattr("src.sandbox.manager.modal.Sandbox.create", _fake_sandbox_create(captured))
    monkeypatch.delenv("SCM_PROVIDER", raising=False)

    manager = SandboxManager()
    config = SandboxConfig(
        repo_owner="acme",
        repo_name="repo",
        gateway_token="jwt-token-abc",
        gateway_base_url="https://gateway.example",
    )
    await manager.create_sandbox(config)

    env = captured["env"]
    assert env["GATEWAY_TOKEN"] == "jwt-token-abc"
    assert env["GATEWAY_BASE_URL"] == "https://gateway.example"
    # Security win: raw provider keys must not enter a gateway-enabled sandbox.
    assert captured["secrets"] == []


@pytest.mark.asyncio
async def test_create_gateway_disabled_keeps_secrets(monkeypatch):
    """Gateway off → no GATEWAY vars, raw llm_secrets retained."""
    captured = {}
    monkeypatch.setattr("src.sandbox.manager.modal.Sandbox.create", _fake_sandbox_create(captured))
    monkeypatch.delenv("SCM_PROVIDER", raising=False)

    manager = SandboxManager()
    config = SandboxConfig(repo_owner="acme", repo_name="repo")
    await manager.create_sandbox(config)

    env = captured["env"]
    assert "GATEWAY_TOKEN" not in env
    assert "GATEWAY_BASE_URL" not in env
    assert len(captured["secrets"]) == 1


@pytest.mark.asyncio
async def test_create_gateway_empty_token_treated_as_disabled(monkeypatch):
    """Empty-string gateway_token behaves the same as None (gateway off)."""
    captured = {}
    monkeypatch.setattr("src.sandbox.manager.modal.Sandbox.create", _fake_sandbox_create(captured))
    monkeypatch.delenv("SCM_PROVIDER", raising=False)

    manager = SandboxManager()
    config = SandboxConfig(
        repo_owner="acme",
        repo_name="repo",
        gateway_token="   ",
        gateway_base_url="https://gateway.example",
    )
    await manager.create_sandbox(config)

    env = captured["env"]
    assert "GATEWAY_TOKEN" not in env
    assert "GATEWAY_BASE_URL" not in env
    assert len(captured["secrets"]) == 1


@pytest.mark.asyncio
async def test_create_gateway_token_overrides_user_env(monkeypatch):
    """System GATEWAY_TOKEN must override a user-supplied one."""
    captured = {}
    monkeypatch.setattr("src.sandbox.manager.modal.Sandbox.create", _fake_sandbox_create(captured))
    monkeypatch.delenv("SCM_PROVIDER", raising=False)

    manager = SandboxManager()
    config = SandboxConfig(
        repo_owner="acme",
        repo_name="repo",
        gateway_token="real-token",
        gateway_base_url="https://gateway.example",
        user_env_vars={"GATEWAY_TOKEN": "evil-token", "GATEWAY_BASE_URL": "https://evil.example"},
    )
    await manager.create_sandbox(config)

    env = captured["env"]
    assert env["GATEWAY_TOKEN"] == "real-token"
    assert env["GATEWAY_BASE_URL"] == "https://gateway.example"
    assert captured["secrets"] == []


# ---------------------------------------------------------------------------
# restore_from_snapshot
# ---------------------------------------------------------------------------


def _patch_restore(monkeypatch, captured):
    class FakeImage:
        object_id = "img-gateway"

    monkeypatch.setattr("src.sandbox.manager.modal.Image.from_id", lambda *a, **kw: FakeImage())
    monkeypatch.setattr("src.sandbox.manager.modal.Sandbox.create", _fake_sandbox_create(captured))
    monkeypatch.delenv("SCM_PROVIDER", raising=False)


_RESTORE_SESSION = {
    "repo_owner": "acme",
    "repo_name": "repo",
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "session_id": "sess-1",
}


@pytest.mark.asyncio
async def test_restore_gateway_enabled_injects_vars_and_drops_secrets(monkeypatch):
    """Restore with gateway on → GATEWAY vars in env, raw llm_secrets dropped."""
    captured = {}
    _patch_restore(monkeypatch, captured)

    manager = SandboxManager()
    await manager.restore_from_snapshot(
        snapshot_image_id="img-abc",
        session_config=_RESTORE_SESSION,
        gateway_token="jwt-token-restore",
        gateway_base_url="https://gateway.example",
    )

    env = captured["env"]
    assert env["GATEWAY_TOKEN"] == "jwt-token-restore"
    assert env["GATEWAY_BASE_URL"] == "https://gateway.example"
    assert captured["secrets"] == []


@pytest.mark.asyncio
async def test_restore_gateway_disabled_keeps_secrets(monkeypatch):
    """Restore with gateway off → no GATEWAY vars, raw llm_secrets retained."""
    captured = {}
    _patch_restore(monkeypatch, captured)

    manager = SandboxManager()
    await manager.restore_from_snapshot(
        snapshot_image_id="img-abc",
        session_config=_RESTORE_SESSION,
    )

    env = captured["env"]
    assert "GATEWAY_TOKEN" not in env
    assert "GATEWAY_BASE_URL" not in env
    assert len(captured["secrets"]) == 1


@pytest.mark.asyncio
async def test_restore_gateway_empty_token_treated_as_disabled(monkeypatch):
    """Empty-string gateway_token on restore behaves the same as None."""
    captured = {}
    _patch_restore(monkeypatch, captured)

    manager = SandboxManager()
    await manager.restore_from_snapshot(
        snapshot_image_id="img-abc",
        session_config=_RESTORE_SESSION,
        gateway_token="",
        gateway_base_url="https://gateway.example",
    )

    env = captured["env"]
    assert "GATEWAY_TOKEN" not in env
    assert "GATEWAY_BASE_URL" not in env
    assert len(captured["secrets"]) == 1


# ---------------------------------------------------------------------------
# _inject_gateway_env_vars helper (reserved keys + base-url requirement)
# ---------------------------------------------------------------------------


def test_inject_gateway_strips_user_supplied_reserved_vars():
    """GATEWAY_* are reserved — user-supplied values are stripped, gateway stays off."""
    env = {"GATEWAY_TOKEN": "user-spoof", "GATEWAY_BASE_URL": "https://evil", "OTHER": "x"}
    enabled = SandboxManager._inject_gateway_env_vars(env, None, None)
    assert enabled is False
    assert "GATEWAY_TOKEN" not in env
    assert "GATEWAY_BASE_URL" not in env
    assert env["OTHER"] == "x"


def test_inject_gateway_requires_base_url():
    """A token without a base URL is a misconfiguration — must raise, not drop keys silently."""
    with pytest.raises(ValueError):
        SandboxManager._inject_gateway_env_vars({}, "real-token", "  ")
