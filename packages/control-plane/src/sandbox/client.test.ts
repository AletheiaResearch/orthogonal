import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildModalSandboxDashboardUrl,
  buildModalWorkspaceSlug,
  createModalClient,
} from "./client";

describe("buildModalWorkspaceSlug", () => {
  it("uses the raw workspace when the Modal environment has no web suffix", () => {
    expect(buildModalWorkspaceSlug("acme")).toBe("acme");
    expect(buildModalWorkspaceSlug("acme", "")).toBe("acme");
  });

  it("appends the Modal environment web suffix for endpoint URLs", () => {
    expect(buildModalWorkspaceSlug("acme", "prod-web")).toBe("acme-prod-web");
  });
});

describe("buildModalSandboxDashboardUrl", () => {
  it("builds a Modal dashboard URL for a sandbox object", () => {
    expect(
      buildModalSandboxDashboardUrl({
        workspace: "acme",
        providerObjectId: "sb-123",
      })
    ).toBe(
      "https://modal.com/apps/acme/main/deployed/open-inspect?activeTab=sandboxes&sandboxId=sb-123"
    );
  });

  it("supports an explicit Modal environment", () => {
    expect(
      buildModalSandboxDashboardUrl({
        workspace: "acme",
        environment: "production",
        providerObjectId: "sb-123",
      })
    ).toBe(
      "https://modal.com/apps/acme/production/deployed/open-inspect?activeTab=sandboxes&sandboxId=sb-123"
    );
  });

  it("encodes URL components", () => {
    expect(
      buildModalSandboxDashboardUrl({
        workspace: "acme team",
        environment: "prod/main",
        providerObjectId: "sb 123/456?x=1",
      })
    ).toBe(
      "https://modal.com/apps/acme%20team/prod%2Fmain/deployed/open-inspect?activeTab=sandboxes&sandboxId=sb%20123%2F456%3Fx%3D1"
    );
  });

  it("returns null when required inputs are missing", () => {
    expect(
      buildModalSandboxDashboardUrl({
        workspace: undefined,
        providerObjectId: "sb-123",
      })
    ).toBeNull();
    expect(
      buildModalSandboxDashboardUrl({
        workspace: "acme",
        providerObjectId: null,
      })
    ).toBeNull();
  });
});

describe("ModalClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the Modal environment web suffix in endpoint URLs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { status: "ok", service: "modal" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = createModalClient("secret", "acme", "prod-web");
    await client.health();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://acme-prod-web--open-inspect-api-health.modal.run"
    );
  });

  it("routes the restore session_config through buildSessionConfig (carries mcp_servers)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { sandbox_id: "sb-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = createModalClient("secret", "acme", "prod-web");
    await client.restoreSandbox({
      snapshotImageId: "img-1",
      sessionId: "session-123",
      sandboxId: "sandbox-456",
      sandboxAuthToken: "auth-token",
      controlPlaneUrl: "https://control-plane.test",
      repoOwner: "testowner",
      repoName: "testrepo",
      provider: "anthropic",
      model: "anthropic/claude-sonnet-4-5",
      mcpServers: [{ id: "mcp-1", name: "Tool", type: "local", enabled: true }],
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.session_config).toEqual({
      session_id: "session-123",
      repo_owner: "testowner",
      repo_name: "testrepo",
      provider: "anthropic",
      model: "anthropic/claude-sonnet-4-5",
      mcp_servers: [{ id: "mcp-1", name: "Tool", type: "local", enabled: true }],
    });
  });

  it("sends gateway_token and gateway_base_url in the create body when provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { sandbox_id: "sb-1", status: "ok", created_at: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const client = createModalClient("secret", "acme", "prod-web");
    await client.createSandbox({
      sessionId: "session-123",
      repoOwner: "testowner",
      repoName: "testrepo",
      controlPlaneUrl: "https://control-plane.test",
      sandboxAuthToken: "auth-token",
      gatewayToken: "gw-token",
      gatewayBaseUrl: "https://gateway.test",
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.gateway_token).toBe("gw-token");
    expect(body.gateway_base_url).toBe("https://gateway.test");
  });

  it("sends null gateway fields in the create body when omitted", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { sandbox_id: "sb-1", status: "ok", created_at: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const client = createModalClient("secret", "acme", "prod-web");
    await client.createSandbox({
      sessionId: "session-123",
      repoOwner: "testowner",
      repoName: "testrepo",
      controlPlaneUrl: "https://control-plane.test",
      sandboxAuthToken: "auth-token",
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.gateway_token).toBeNull();
    expect(body.gateway_base_url).toBeNull();
  });

  it("sends gateway_token and gateway_base_url in the restore body when provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { sandbox_id: "sb-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const client = createModalClient("secret", "acme", "prod-web");
    await client.restoreSandbox({
      snapshotImageId: "img-1",
      sessionId: "session-123",
      sandboxId: "sandbox-456",
      sandboxAuthToken: "auth-token",
      controlPlaneUrl: "https://control-plane.test",
      repoOwner: "testowner",
      repoName: "testrepo",
      provider: "anthropic",
      model: "anthropic/claude-sonnet-4-5",
      gatewayToken: "gw-token",
      gatewayBaseUrl: "https://gateway.test",
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.gateway_token).toBe("gw-token");
    expect(body.gateway_base_url).toBe("https://gateway.test");
  });
});
