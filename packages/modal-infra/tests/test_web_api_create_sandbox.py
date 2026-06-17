"""Tests for Modal create-sandbox API request assembly."""

from types import SimpleNamespace

import pytest

from sandbox_runtime.types import SandboxStatus
from src import web_api
from src.sandbox import manager as manager_module


def _patch_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(web_api, "require_auth", lambda _authorization: None)
    monkeypatch.setattr(web_api, "require_valid_control_plane_url", lambda _url: None)


def _patch_manager(monkeypatch: pytest.MonkeyPatch, captured: dict) -> None:
    class FakeManager:
        async def create_sandbox(self, config):
            captured["config"] = config
            return SimpleNamespace(
                sandbox_id="sandbox-123",
                modal_object_id="obj-123",
                status=SandboxStatus.WARMING,
                created_at=123.0,
                code_server_url=None,
                code_server_password=None,
                ttyd_url=None,
                tunnel_urls=None,
            )

    monkeypatch.setattr(manager_module, "SandboxManager", FakeManager)


async def _call_create_sandbox(request: dict) -> dict:
    return await web_api.api_create_sandbox.get_raw_f()(
        request,
        authorization="Bearer test",
        x_trace_id=None,
        x_request_id=None,
        x_session_id=None,
        x_sandbox_id=None,
    )


@pytest.mark.asyncio
async def test_create_sandbox_does_not_resolve_clone_token_for_fresh_boot(monkeypatch):
    """Fresh base-image boots authenticate via the credential helper only."""
    captured = {}
    calls = []

    _patch_auth(monkeypatch)
    _patch_manager(monkeypatch, captured)
    monkeypatch.setattr(web_api, "_resolve_clone_token", lambda: calls.append(True) or "ghs_token")

    result = await _call_create_sandbox(
        {
            "session_id": "sess-1",
            "repo_owner": "acme",
            "repo_name": "repo",
            "control_plane_url": "https://control-plane.example",
            "sandbox_auth_token": "sandbox-token",
        }
    )

    assert result["success"] is True
    assert calls == []
    assert captured["config"].clone_token is None


@pytest.mark.asyncio
async def test_create_sandbox_resolves_clone_token_for_prebuilt_boot(monkeypatch):
    """Repo images may run pre-migration entrypoints, so they still need a fallback token."""
    captured = {}
    calls = []

    _patch_auth(monkeypatch)
    _patch_manager(monkeypatch, captured)

    def resolve_clone_token(
        repo_owner: str | None = None,
        installation_id: str | None = None,
    ) -> str:
        calls.append((repo_owner, installation_id))
        return "ghs_prebuilt"

    monkeypatch.setattr(web_api, "_resolve_clone_token", resolve_clone_token)

    result = await _call_create_sandbox(
        {
            "session_id": "sess-1",
            "repo_owner": "acme",
            "repo_name": "repo",
            "control_plane_url": "https://control-plane.example",
            "sandbox_auth_token": "sandbox-token",
            "repo_image_id": "repo-image-1",
        }
    )

    assert result["success"] is True
    assert calls == [("acme", None)]
    assert captured["config"].clone_token == "ghs_prebuilt"


@pytest.mark.asyncio
async def test_create_sandbox_passes_gateway_fields_to_config(monkeypatch):
    """Gateway token/base URL (snake_case payload) thread into SandboxConfig."""
    captured = {}

    _patch_auth(monkeypatch)
    _patch_manager(monkeypatch, captured)
    monkeypatch.setattr(web_api, "_resolve_clone_token", lambda *a, **kw: None)

    result = await _call_create_sandbox(
        {
            "session_id": "sess-1",
            "repo_owner": "acme",
            "repo_name": "repo",
            "control_plane_url": "https://control-plane.example",
            "sandbox_auth_token": "sandbox-token",
            "gateway_token": "jwt-token-abc",
            "gateway_base_url": "https://gateway.example",
        }
    )

    assert result["success"] is True
    assert captured["config"].gateway_token == "jwt-token-abc"
    assert captured["config"].gateway_base_url == "https://gateway.example"


@pytest.mark.asyncio
async def test_create_sandbox_gateway_fields_default_to_none(monkeypatch):
    """Absent gateway fields leave SandboxConfig.gateway_* as None."""
    captured = {}

    _patch_auth(monkeypatch)
    _patch_manager(monkeypatch, captured)
    monkeypatch.setattr(web_api, "_resolve_clone_token", lambda *a, **kw: None)

    result = await _call_create_sandbox(
        {
            "session_id": "sess-1",
            "repo_owner": "acme",
            "repo_name": "repo",
            "control_plane_url": "https://control-plane.example",
            "sandbox_auth_token": "sandbox-token",
        }
    )

    assert result["success"] is True
    assert captured["config"].gateway_token is None
    assert captured["config"].gateway_base_url is None


def _patch_restore_manager(monkeypatch: pytest.MonkeyPatch, captured: dict) -> None:
    class FakeManager:
        async def restore_from_snapshot(self, **kwargs):
            captured["kwargs"] = kwargs
            return SimpleNamespace(
                sandbox_id="sandbox-123",
                modal_object_id="obj-123",
                status=SandboxStatus.WARMING,
                code_server_url=None,
                code_server_password=None,
                ttyd_url=None,
                tunnel_urls=None,
            )

    monkeypatch.setattr(manager_module, "SandboxManager", FakeManager)


async def _call_restore_sandbox(request: dict) -> dict:
    return await web_api.api_restore_sandbox.get_raw_f()(
        request,
        authorization="Bearer test",
        x_trace_id=None,
        x_request_id=None,
        x_session_id=None,
        x_sandbox_id=None,
    )


@pytest.mark.asyncio
async def test_restore_sandbox_passes_gateway_fields(monkeypatch):
    """Gateway token/base URL (snake_case payload) thread into restore_from_snapshot."""
    captured = {}

    _patch_auth(monkeypatch)
    _patch_restore_manager(monkeypatch, captured)
    monkeypatch.setattr(web_api, "_resolve_clone_token", lambda *a, **kw: None)

    result = await _call_restore_sandbox(
        {
            "snapshot_image_id": "img-abc",
            "session_config": {"repo_owner": "acme", "repo_name": "repo"},
            "control_plane_url": "https://control-plane.example",
            "sandbox_auth_token": "sandbox-token",
            "gateway_token": "jwt-token-restore",
            "gateway_base_url": "https://gateway.example",
        }
    )

    assert result["success"] is True
    assert captured["kwargs"]["gateway_token"] == "jwt-token-restore"
    assert captured["kwargs"]["gateway_base_url"] == "https://gateway.example"
