/**
 * SandboxLifecycleManager - orchestrates sandbox lifecycle operations.
 *
 * This class coordinates spawn, restore, snapshot, and timeout logic by:
 * 1. Using pure decision functions to make decisions (no side effects)
 * 2. Executing side effects through injected dependencies (storage, broadcast, etc.)
 * 3. Delegating provider operations to the SandboxProvider abstraction
 *
 * The manager owns the in-memory `isSpawningSandbox` flag to prevent concurrent
 * spawn attempts within the same request.
 */

import {
  mintGatewayToken,
  withoutLlmProviderCredentials,
  type McpServerConfig,
  type SandboxSettings,
} from "@open-inspect/shared";

import { hashToken } from "../../auth/crypto";
import { mintJwt } from "../../auth/jwt";
import { createLogger, type Logger } from "../../logger";
import type { SandboxRow, SessionRow } from "../../session/types";
import type { SandboxStatus } from "../../types";
import { extractProviderAndModel } from "../../utils/models";
import { SandboxProviderError, type SandboxProvider, type CreateSandboxConfig } from "../provider";
import { normalizeSandboxSettings } from "../settings";
import {
  evaluateCircuitBreaker,
  evaluateSpawnDecision,
  evaluateInactivityTimeout,
  evaluateHeartbeatHealth,
  evaluateConnectingTimeout,
  evaluateWarmDecision,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_SPAWN_CONFIG,
  DEFAULT_INACTIVITY_CONFIG,
  DEFAULT_HEARTBEAT_CONFIG,
  DEFAULT_CONNECTING_TIMEOUT_CONFIG,
  type CircuitBreakerConfig,
  type SpawnConfig,
  type InactivityConfig,
  type HeartbeatConfig,
  type ConnectingTimeoutConfig,
} from "./decisions";

const log = createLogger("lifecycle-manager");

/** TTL for terminal auth JWTs (24 hours, matching typical sandbox lifetime). */
const TERMINAL_TOKEN_TTL_SECONDS = 86400;

// ==================== Dependency Interfaces ====================

/**
 * Sandbox state with circuit breaker info (subset of full SandboxRow).
 */
export interface SandboxCircuitBreakerInfo {
  status: string;
  created_at: number;
  modal_object_id: string | null;
  snapshot_image_id: string | null;
  spawn_failure_count: number | null;
  last_spawn_failure: number | null;
}

/**
 * Storage adapter for sandbox data operations.
 */
export interface SandboxStorage {
  /** Get current sandbox state */
  getSandbox(): SandboxRow | null;
  /** Get sandbox with circuit breaker state (subset of fields) */
  getSandboxWithCircuitBreaker(): SandboxCircuitBreakerInfo | null;
  /** Get current session */
  getSession(): SessionRow | null;
  /** Get user env vars for sandbox injection */
  getUserEnvVars(): Promise<Record<string, string> | undefined>;
  /** Update sandbox status */
  updateSandboxStatus(status: SandboxStatus): void;
  /** Update sandbox for spawn (status, auth token, sandbox ID, created_at) */
  updateSandboxForSpawn(data: {
    status: SandboxStatus;
    createdAt: number;
    authTokenHash: string;
    modalSandboxId: string;
  }): void;
  /** Update sandbox state for in-place resume without rotating auth/token identity */
  updateSandboxForResume?(data: { status: SandboxStatus; createdAt: number }): void;
  /** Update sandbox Modal object ID (for snapshot API) */
  updateSandboxModalObjectId(modalObjectId: string): void;
  /** Update sandbox snapshot image ID */
  updateSandboxSnapshotImageId(sandboxId: string, imageId: string): void;
  /** Drop the stale snapshot pointer when a fresh spawn boots a new image (CON-72) */
  clearSandboxSnapshotImageId(): void;
  /** Persist whether this sandbox's boot image bakes the gateway plugin (CON-72) */
  setRuntimeGatewayCapable(capable: boolean): void;
  /** Update last activity timestamp */
  updateSandboxLastActivity(timestamp: number): void;
  /** Increment circuit breaker failure count */
  incrementCircuitBreakerFailure(timestamp: number): void;
  /** Reset circuit breaker failure count */
  resetCircuitBreaker(): void;
  /** Persist last spawn error */
  setLastSpawnError(error: string | null, timestamp: number | null): void;
  /** Update code-server URL and (encrypted) password on the sandbox row */
  updateSandboxCodeServer(url: string, password: string): void | Promise<void>;
  /** Clear stale code-server URL and password (e.g. on sandbox teardown) */
  clearSandboxCodeServer(): void;
  /** Clear the code-server URL while preserving the stored password */
  clearSandboxCodeServerUrl?(): void;
  /** Update tunnel URLs for extra ports on the sandbox row */
  updateSandboxTunnelUrls(urls: Record<string, string>): void | Promise<void>;
  /** Clear stale tunnel URLs (e.g. on sandbox teardown) */
  clearSandboxTunnelUrls(): void;
  /** Update ttyd proxy URL and (encrypted) JWT token on the sandbox row */
  updateSandboxTtyd(url: string, token: string): void | Promise<void>;
  /** Clear stale ttyd URL and token (e.g. on sandbox teardown) */
  clearSandboxTtyd(): void;
}

/**
 * Broadcaster for sending messages to connected clients.
 */
export interface SandboxBroadcaster {
  /** Broadcast a message to all connected clients */
  broadcast(message: object): void;
}

/**
 * WebSocket manager for sandbox communication.
 */
export interface WebSocketManager {
  /** Get the sandbox WebSocket (with hibernation recovery) */
  getSandboxWebSocket(): WebSocket | null;
  /** Close the sandbox WebSocket */
  closeSandboxWebSocket(code: number, reason: string): void;
  /** Send a message to the sandbox */
  sendToSandbox(message: object): boolean;
  /** Get count of connected client WebSockets (excludes sandbox) */
  getConnectedClientCount(): number;
}

/**
 * Alarm scheduler for timeouts.
 */
export interface AlarmScheduler {
  /** Schedule an alarm at the given timestamp */
  scheduleAlarm(timestamp: number): Promise<void>;
}

/**
 * ID generator for sandbox and token IDs.
 */
export interface IdGenerator {
  /** Generate a unique ID */
  generateId(): string;
}

// ==================== Configuration ====================

/**
 * Complete lifecycle configuration.
 */
export interface SandboxLifecycleConfig {
  circuitBreaker: CircuitBreakerConfig;
  spawn: SpawnConfig;
  inactivity: InactivityConfig;
  heartbeat: HeartbeatConfig;
  connectingTimeout: ConnectingTimeoutConfig;
  controlPlaneUrl: string;
  /** Default model ID used when the session has no model override. */
  model: string;
  /** HS256 secret for minting Terminus gateway tokens. Unset disables the gateway. */
  terminusJwtSecret?: string;
  /** Base URL of the Terminus LLM gateway. Unset disables the gateway. */
  terminusGatewayUrl?: string;
  /** Session ID for log correlation. Optional — logs will omit sessionId if not provided. */
  sessionId?: string;
  /** MCP server lookup for injecting servers into sandboxes. */
  mcpServerLookup?: McpServerLookup;
  /** Resolves the spawn-time agent-slack-notify gate. */
  slackAgentNotifyLookup?: SlackAgentNotifyLookup;
  /** Builds a provider dashboard URL for a persisted provider object ID. */
  sandboxDashboardUrlBuilder?: (providerObjectId: string) => string | null;
}

/**
 * Default lifecycle configuration.
 */
export const DEFAULT_LIFECYCLE_CONFIG: Omit<SandboxLifecycleConfig, "controlPlaneUrl" | "model"> = {
  circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
  spawn: DEFAULT_SPAWN_CONFIG,
  inactivity: DEFAULT_INACTIVITY_CONFIG,
  heartbeat: DEFAULT_HEARTBEAT_CONFIG,
  connectingTimeout: DEFAULT_CONNECTING_TIMEOUT_CONFIG,
};

/** Child (agent-spawned) sessions get a shorter sandbox timeout. */
const CHILD_SANDBOX_TIMEOUT_SECONDS = 3600; // 1 hour (vs default 2 hours)

// ==================== MCP Server Lookup ====================

/**
 * Lookup interface for MCP servers applicable to a session.
 * Keeps the lifecycle manager free of direct D1Database dependencies.
 */
export interface McpServerLookup {
  getDecryptedForSession(repoOwner: string, repoName: string): Promise<McpServerConfig[]>;
}

// ==================== Repo Image Lookup ====================

/**
 * Provider-scoped lookup interface for pre-built repo images.
 * The Durable Object binds this to the active sandbox backend before injection.
 */
export interface RepoImageLookup {
  getLatestReady(
    repoOwner: string,
    repoName: string,
    baseBranch?: string
  ): Promise<{ provider_image_id: string; base_sha: string } | null>;
}

// ==================== Slack Agent-Notify Lookup ====================

/**
 * Resolves the spawn-time agent-slack-notify gate for a given repo.
 * False (or throwing) means do not install the tool in this sandbox.
 */
export interface SlackAgentNotifyLookup {
  isEnabledForRepo(repoOwner: string, repoName: string): Promise<boolean>;
}

// ==================== Callbacks ====================

/**
 * Optional callbacks from the lifecycle manager to the session DO.
 * Lightweight callback interface — the manager doesn't know what the callbacks do.
 */
export interface LifecycleCallbacks {
  /** Called when the sandbox is being terminated (heartbeat stale, inactivity timeout). */
  onSandboxTerminating?: () => Promise<void>;
}

// ==================== Manager ====================

/**
 * Manages sandbox lifecycle operations.
 *
 * Uses dependency injection for all external interactions, enabling unit testing
 * with mocked dependencies.
 */
export class SandboxLifecycleManager {
  /**
   * In-memory flag to prevent concurrent spawn attempts within the same request.
   * This is NOT persisted - it protects against multiple spawns in one DO method call.
   * The persisted sandbox status ("spawning", "connecting") handles cross-request protection.
   */
  private isSpawningSandbox = false;

  /** Session-scoped logger. Falls back to module-level logger if no sessionId configured. */
  private readonly log: Logger;

  constructor(
    private readonly provider: SandboxProvider,
    private readonly storage: SandboxStorage,
    private readonly broadcaster: SandboxBroadcaster,
    private readonly wsManager: WebSocketManager,
    private readonly alarmScheduler: AlarmScheduler,
    private readonly idGenerator: IdGenerator,
    private readonly config: SandboxLifecycleConfig,
    private readonly callbacks: LifecycleCallbacks = {},
    private readonly repoImageLookup?: RepoImageLookup
  ) {
    this.log = config.sessionId ? log.child({ session_id: config.sessionId }) : log;
  }

  /**
   * Spawn a sandbox (fresh or from snapshot).
   *
   * Uses decision functions to determine the appropriate action:
   * - Check circuit breaker
   * - Restore from snapshot if available and sandbox is stopped/stale/failed
   * - Fresh spawn if all conditions pass
   */
  async spawnSandbox(): Promise<void> {
    const sandboxState = this.storage.getSandboxWithCircuitBreaker();
    const now = Date.now();

    // Extract circuit breaker state
    const circuitBreakerState = {
      failureCount: sandboxState?.spawn_failure_count || 0,
      lastFailureTime: sandboxState?.last_spawn_failure || 0,
    };

    // Check circuit breaker
    const cbDecision = evaluateCircuitBreaker(circuitBreakerState, this.config.circuitBreaker, now);

    if (cbDecision.shouldReset) {
      this.log.info("Circuit breaker reset");
      this.storage.resetCircuitBreaker();
    }

    if (!cbDecision.shouldProceed) {
      this.log.warn("Circuit breaker open", {
        event: "sandbox.circuit_breaker_open",
        failure_count: circuitBreakerState.failureCount,
        wait_time_ms: cbDecision.waitTimeMs || 0,
      });
      this.broadcaster.broadcast({
        type: "sandbox_error",
        error: `Sandbox spawning temporarily disabled after ${circuitBreakerState.failureCount} failures. Try again in ${Math.ceil((cbDecision.waitTimeMs || 0) / 1000)} seconds.`,
      });
      return;
    }

    // Evaluate spawn decision
    const spawnState = {
      status: (sandboxState?.status || "pending") as SandboxStatus,
      createdAt: sandboxState?.created_at || 0,
      providerObjectId: sandboxState?.modal_object_id || null,
      snapshotImageId: sandboxState?.snapshot_image_id || null,
      hasActiveWebSocket: this.wsManager.getSandboxWebSocket() !== null,
    };

    const spawnDecision = evaluateSpawnDecision(
      spawnState,
      this.config.spawn,
      now,
      this.isSpawningSandbox,
      !!this.provider.capabilities.supportsPersistentResume
    );

    switch (spawnDecision.action) {
      case "skip":
        this.log.info("Spawn decision: skip", {
          reason: spawnDecision.reason,
          sandbox_status: spawnState.status,
        });
        return;

      case "wait":
        this.log.info("Spawn decision: wait", {
          reason: spawnDecision.reason,
          sandbox_status: spawnState.status,
        });
        return;

      case "restore":
        this.log.info("Spawn decision: restore", {
          snapshot_image_id: spawnDecision.snapshotImageId,
        });
        await this.restoreFromSnapshot(spawnDecision.snapshotImageId);
        return;

      case "resume":
        this.log.info("Spawn decision: resume", {
          provider_object_id: spawnDecision.providerObjectId,
        });
        await this.resumeSandbox(spawnDecision.providerObjectId);
        return;

      case "spawn":
        await this.doSpawn();
        return;
    }
  }

  /**
   * Execute a fresh sandbox spawn.
   */
  private async doSpawn(): Promise<void> {
    this.isSpawningSandbox = true;

    try {
      const session = this.storage.getSession();
      if (!session) {
        this.log.error("Cannot spawn sandbox: no session");
        return;
      }

      this.storage.setLastSpawnError(null, null);

      const now = Date.now();
      const sessionId = session.session_name || session.id;
      const sandboxAuthToken = this.idGenerator.generateId();
      const sandboxAuthTokenHash = await hashToken(sandboxAuthToken);
      const expectedSandboxId = `sandbox-${session.repo_owner}-${session.repo_name}-${now}`;

      // Store expected sandbox ID and auth token BEFORE calling provider
      this.storage.updateSandboxForSpawn({
        status: "spawning",
        createdAt: now,
        authTokenHash: sandboxAuthTokenHash,
        modalSandboxId: expectedSandboxId,
      });
      this.broadcaster.broadcast({ type: "sandbox_status", status: "spawning" });

      this.log.info("Spawning sandbox", {
        event: "sandbox.spawn",
        expected_sandbox_id: expectedSandboxId,
        repo_owner: session.repo_owner,
        repo_name: session.repo_name,
      });

      const userEnvVars = await this.storage.getUserEnvVars();
      const { provider, model: modelId } = this.resolveProviderAndModel(session);

      // Look up pre-built repo image (graceful fallback on failure)
      let repoImageId: string | null = null;
      let repoImageSha: string | null = null;
      if (this.repoImageLookup) {
        try {
          const repoImage = await this.repoImageLookup.getLatestReady(
            session.repo_owner,
            session.repo_name,
            session.base_branch
          );
          if (repoImage) {
            repoImageId = repoImage.provider_image_id;
            repoImageSha = repoImage.base_sha;
            this.log.info("Using pre-built repo image", {
              provider_image_id: repoImageId,
              base_sha: repoImageSha,
            });
          }
        } catch (e) {
          this.log.warn("Failed to look up repo image, using base image", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // Child sessions get a shorter timeout
      const timeoutSeconds =
        session.spawn_source === "agent" ? CHILD_SANDBOX_TIMEOUT_SECONDS : undefined;

      const mcpServers = await this.loadMcpServers(session);

      const codeServerEnabled = session.code_server_enabled === 1;
      const agentSlackNotifyEnabled = await this.resolveAgentSlackNotifyEnabled(session);
      const sandboxSettings = this.parseSandboxSettings(session);

      // A fresh spawn from the base image always bakes the current gateway plugin;
      // a repo image is SHA-pinned and may predate it, so treat it as not-capable
      // (CON-72). Persisted only once the spawn succeeds (below) so a fresh spawn
      // that fails can't overwrite the capability of the snapshot still on the row
      // — a later restore must read the capability of the image it actually boots.
      const runtimeGatewayCapable = repoImageId === null;

      const { gatewayToken, gatewayBaseUrl } = await this.mintGatewayTokenIfEnabled(
        sessionId,
        sandboxSettings,
        runtimeGatewayCapable
      );
      // When the gateway is active, strip user-injected raw LLM credentials from the
      // top-level env and every MCP server env so no provider is reachable directly
      // (Modal already drops the platform llm_secrets).
      const { sandboxEnvVars, sandboxMcpServers } = this.stripProviderCredentialsForGateway(
        gatewayToken !== undefined,
        userEnvVars,
        mcpServers
      );
      const createConfig: CreateSandboxConfig = {
        sessionId,
        sandboxId: expectedSandboxId,
        repoOwner: session.repo_owner,
        repoName: session.repo_name,
        controlPlaneUrl: this.config.controlPlaneUrl,
        sandboxAuthToken,
        provider,
        model: modelId,
        userEnvVars: sandboxEnvVars,
        repoImageId,
        repoImageSha,
        timeoutSeconds,
        branch: session.base_branch,
        codeServerEnabled,
        agentSlackNotifyEnabled,
        mcpServers: sandboxMcpServers,
        sandboxSettings,
        githubAppInstallationId: session.github_app_installation_id ?? undefined,
        gatewayToken,
        gatewayBaseUrl,
      };

      const result = await this.provider.createSandbox(createConfig);

      // A fresh spawn boots a brand-new image, so on success record that image's
      // gateway capability and drop the prior snapshot pointer together (CON-72).
      // Doing both only after success keeps a failed spawn's restore-fallback
      // intact, and clearing the stale pointer guarantees a later restore never
      // reads a capability that describes a different image than the snapshot it
      // restores — which would mint a gateway token against a pre-gateway image and
      // black-hole the boot's LLM access (no raw keys, no gateway plugin).
      this.storage.setRuntimeGatewayCapable(runtimeGatewayCapable);
      this.storage.clearSandboxSnapshotImageId();

      this.log.info("Sandbox spawned", {
        event: "sandbox.spawned",
        sandbox_id: result.sandboxId,
        provider_object_id: result.providerObjectId,
      });

      if (result.providerObjectId) {
        this.storeAndBroadcastProviderObjectId(result.providerObjectId);
      }
      if (result.codeServerUrl && result.codeServerPassword) {
        await this.storeAndBroadcastCodeServer(result.codeServerUrl, result.codeServerPassword);
      }
      await this.storeAndBroadcastTunnelUrls(result.tunnelUrls);
      if (result.ttydUrl) {
        await this.storeAndBroadcastTtyd(
          result.ttydUrl,
          sandboxAuthToken,
          sessionId,
          expectedSandboxId
        );
      }

      this.storage.updateSandboxStatus("connecting");
      this.broadcaster.broadcast({ type: "sandbox_status", status: "connecting" });

      // Schedule connecting timeout watchdog — if the bridge doesn't connect
      // within the allowed window, handleAlarm() will fail the sandbox.
      // This alarm is naturally replaced by the inactivity alarm on successful connect.
      await this.alarmScheduler.scheduleAlarm(Date.now() + this.config.connectingTimeout.timeoutMs);

      // Reset circuit breaker on successful spawn initiation
      this.storage.resetCircuitBreaker();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to spawn sandbox";
      this.storage.setLastSpawnError(errorMessage, Date.now());
      this.log.error("Sandbox spawn failed", {
        event: "sandbox.spawn_failed",
        error: error instanceof Error ? error : String(error),
      });

      // Only increment circuit breaker for permanent errors
      if (error instanceof SandboxProviderError) {
        if (error.errorType === "permanent") {
          this.storage.incrementCircuitBreakerFailure(Date.now());
          this.log.info("Circuit breaker incremented", { error_type: "permanent" });
        } else {
          this.log.info("Transient error, not incrementing circuit breaker", {
            error_type: error.errorType,
          });
        }
      } else {
        // Unknown error type - treat as permanent
        this.storage.incrementCircuitBreakerFailure(Date.now());
        this.log.info("Circuit breaker incremented", { error_type: "unknown" });
      }

      this.storage.updateSandboxStatus("failed");
      this.broadcaster.broadcast({
        type: "sandbox_error",
        error: errorMessage,
      });
    } finally {
      this.isSpawningSandbox = false;
    }
  }

  private async resolveAgentSlackNotifyEnabled(session: SessionRow): Promise<boolean> {
    if (!this.config.slackAgentNotifyLookup) return false;
    try {
      return await this.config.slackAgentNotifyLookup.isEnabledForRepo(
        session.repo_owner,
        session.repo_name
      );
    } catch (err) {
      this.log.warn("Failed to resolve agent slack-notify gate; treating as disabled", {
        event: "slack_notify.gate_resolve_failed",
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Load MCP servers applicable to the current session's repository.
   * Returns undefined if none are found or DB is not configured.
   */
  private async loadMcpServers(session: SessionRow): Promise<McpServerConfig[] | undefined> {
    try {
      if (!this.config.mcpServerLookup) return undefined;
      const servers = await this.config.mcpServerLookup.getDecryptedForSession(
        session.repo_owner,
        session.repo_name
      );
      this.log.info("MCP servers loaded", {
        event: "mcp.loaded",
        count: servers?.length ?? 0,
        names: servers?.map((s) => s.name) ?? [],
      });
      return servers?.length ? servers : undefined;
    } catch (err) {
      this.log.warn("Failed to load MCP servers", {
        event: "mcp.load_failed",
        error: String(err),
      });
      return undefined;
    }
  }

  /**
   * On the gateway-active path, strip raw LLM-provider credentials from the
   * top-level user env and every MCP server's credential maps, so no provider is
   * reachable directly — the gateway's auth/routing/metering boundary holds
   * (CON-72). Both maps are serialized into the sandbox: a local server's `env` is
   * copied into the MCP process environment, and a remote server's `headers` (where
   * `rowToConfig` puts decrypted credentials) are sent on each request. A no-op when
   * the gateway is not active: a raw-fallback boot keeps the user's keys.
   */
  private stripProviderCredentialsForGateway(
    gatewayActive: boolean,
    userEnvVars: Record<string, string> | undefined,
    mcpServers: McpServerConfig[] | undefined
  ): {
    sandboxEnvVars: Record<string, string> | undefined;
    sandboxMcpServers: McpServerConfig[] | undefined;
  } {
    if (!gatewayActive) {
      return { sandboxEnvVars: userEnvVars, sandboxMcpServers: mcpServers };
    }
    return {
      sandboxEnvVars: userEnvVars ? withoutLlmProviderCredentials(userEnvVars) : userEnvVars,
      sandboxMcpServers: mcpServers?.map((server) => {
        let next = server;
        if (server.env) next = { ...next, env: withoutLlmProviderCredentials(server.env) };
        if (server.headers)
          next = { ...next, headers: withoutLlmProviderCredentials(server.headers) };
        return next;
      }),
    };
  }

  /**
   * Restore a sandbox from a filesystem snapshot.
   */
  private async restoreFromSnapshot(snapshotImageId: string): Promise<void> {
    if (!this.provider.restoreFromSnapshot) {
      this.log.info("Provider does not support restore, falling back to fresh spawn");
      // Fall back to fresh spawn
      await this.doSpawn();
      return;
    }

    this.isSpawningSandbox = true;

    try {
      const session = this.storage.getSession();
      if (!session) {
        this.log.error("Cannot restore: no session");
        return;
      }

      this.storage.setLastSpawnError(null, null);

      const now = Date.now();
      const sandboxAuthToken = this.idGenerator.generateId();
      const sandboxAuthTokenHash = await hashToken(sandboxAuthToken);
      const expectedSandboxId = `sandbox-${session.repo_owner}-${session.repo_name}-${now}`;

      // Store expected sandbox ID and auth token
      this.storage.updateSandboxForSpawn({
        status: "spawning",
        createdAt: now,
        authTokenHash: sandboxAuthTokenHash,
        modalSandboxId: expectedSandboxId,
      });
      this.broadcaster.broadcast({ type: "sandbox_status", status: "spawning" });

      this.log.info("Restoring from snapshot", {
        event: "sandbox.restore",
        snapshot_image_id: snapshotImageId,
      });

      const userEnvVars = await this.storage.getUserEnvVars();
      const { provider, model: modelId } = this.resolveProviderAndModel(session);

      // Child sessions get a shorter timeout (same logic as doSpawn)
      const timeoutSeconds =
        session.spawn_source === "agent" ? CHILD_SANDBOX_TIMEOUT_SECONDS : undefined;

      const codeServerEnabled = session.code_server_enabled === 1;
      const agentSlackNotifyEnabled = await this.resolveAgentSlackNotifyEnabled(session);
      const mcpServers = await this.loadMcpServers(session);
      const sandboxSettings = this.parseSandboxSettings(session);
      const restoreSessionId = session.session_name || session.id;

      // The snapshot's image carries the capability persisted on its producing
      // spawn (CON-72). NULL = legacy (pre-gateway) snapshot → not capable → no
      // mint → Modal keeps the raw llm_secrets → the sandbox still works. A restore
      // never changes the image, so the persisted value is left untouched here.
      const runtimeGatewayCapable = this.storage.getSandbox()?.runtime_gateway_capable === 1;
      const { gatewayToken, gatewayBaseUrl } = await this.mintGatewayTokenIfEnabled(
        restoreSessionId,
        sandboxSettings,
        runtimeGatewayCapable
      );
      const { sandboxEnvVars, sandboxMcpServers } = this.stripProviderCredentialsForGateway(
        gatewayToken !== undefined,
        userEnvVars,
        mcpServers
      );
      const result = await this.provider.restoreFromSnapshot({
        snapshotImageId,
        sessionId: restoreSessionId,
        sandboxId: expectedSandboxId,
        sandboxAuthToken,
        controlPlaneUrl: this.config.controlPlaneUrl,
        repoOwner: session.repo_owner,
        repoName: session.repo_name,
        provider,
        model: modelId,
        userEnvVars: sandboxEnvVars,
        timeoutSeconds,
        branch: session.base_branch,
        codeServerEnabled,
        agentSlackNotifyEnabled,
        mcpServers: sandboxMcpServers,
        sandboxSettings,
        githubAppInstallationId: session.github_app_installation_id ?? undefined,
        gatewayToken,
        gatewayBaseUrl,
      });

      if (result.success) {
        this.log.info("Sandbox restored", {
          event: "sandbox.restored",
          sandbox_id: result.sandboxId,
          provider_object_id: result.providerObjectId,
        });

        if (result.providerObjectId) {
          this.storeAndBroadcastProviderObjectId(result.providerObjectId);
        }
        if (result.codeServerUrl && result.codeServerPassword) {
          await this.storeAndBroadcastCodeServer(result.codeServerUrl, result.codeServerPassword);
        }
        await this.storeAndBroadcastTunnelUrls(result.tunnelUrls);
        if (result.ttydUrl) {
          await this.storeAndBroadcastTtyd(
            result.ttydUrl,
            sandboxAuthToken,
            session.session_name || session.id,
            expectedSandboxId
          );
        }

        this.storage.updateSandboxStatus("connecting");
        this.broadcaster.broadcast({ type: "sandbox_status", status: "connecting" });

        // Schedule connecting timeout watchdog
        await this.alarmScheduler.scheduleAlarm(
          Date.now() + this.config.connectingTimeout.timeoutMs
        );

        this.broadcaster.broadcast({
          type: "sandbox_restored",
          message: "Session restored from snapshot",
        });
      } else {
        this.log.error("Snapshot restore failed", {
          error: result.error,
          snapshot_image_id: snapshotImageId,
        });
        this.storage.setLastSpawnError(
          result.error || "Failed to restore from snapshot",
          Date.now()
        );
        this.storage.updateSandboxStatus("failed");
        this.broadcaster.broadcast({
          type: "sandbox_error",
          error: result.error || "Failed to restore from snapshot",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to restore sandbox";
      this.storage.setLastSpawnError(errorMessage, Date.now());
      this.log.error("Snapshot restore request failed", {
        error: error instanceof Error ? error : String(error),
        snapshot_image_id: snapshotImageId,
      });
      this.storage.updateSandboxStatus("failed");
      this.broadcaster.broadcast({
        type: "sandbox_error",
        error: errorMessage,
      });
    } finally {
      this.isSpawningSandbox = false;
    }
  }

  /**
   * Resume a provider-managed sandbox in place without rotating the logical sandbox ID.
   */
  private async resumeSandbox(providerObjectId: string): Promise<void> {
    if (!this.provider.resumeSandbox) {
      await this.doSpawn();
      return;
    }

    this.isSpawningSandbox = true;

    try {
      const session = this.storage.getSession();
      const sandbox = this.storage.getSandbox();
      if (!session || !sandbox?.modal_sandbox_id) {
        this.log.error("Cannot resume sandbox: missing session or logical sandbox ID");
        return;
      }

      const now = Date.now();
      this.storage.setLastSpawnError(null, null);
      this.storage.updateSandboxForResume?.({
        status: "connecting",
        createdAt: now,
      });
      if (!this.storage.updateSandboxForResume) {
        this.storage.updateSandboxStatus("connecting");
      }
      this.broadcaster.broadcast({ type: "sandbox_status", status: "connecting" });

      const timeoutSeconds =
        session.spawn_source === "agent" ? CHILD_SANDBOX_TIMEOUT_SECONDS : undefined;

      const result = await this.provider.resumeSandbox({
        providerObjectId,
        sessionId: session.session_name || session.id,
        sandboxId: sandbox.modal_sandbox_id,
        timeoutSeconds,
        codeServerEnabled: session.code_server_enabled === 1,
        sandboxSettings: this.parseSandboxSettings(session),
      });

      if (!result.success) {
        if (result.shouldSpawnFresh) {
          this.log.info("Resume fell back to fresh spawn", {
            provider_object_id: providerObjectId,
            error: result.error,
          });
          await this.doSpawn();
          return;
        }

        throw new Error(result.error || "Failed to resume sandbox");
      }

      const finalProviderObjectId = result.providerObjectId ?? providerObjectId;
      if (result.providerObjectId && result.providerObjectId !== providerObjectId) {
        this.storeProviderObjectId(result.providerObjectId);
      }
      this.broadcastSandboxDashboardUrl(finalProviderObjectId);

      if (result.codeServerUrl && result.codeServerPassword) {
        await this.storeAndBroadcastCodeServer(result.codeServerUrl, result.codeServerPassword);
      }

      await this.storeAndBroadcastTunnelUrls(result.tunnelUrls);
      await this.alarmScheduler.scheduleAlarm(Date.now() + this.config.connectingTimeout.timeoutMs);
      this.storage.resetCircuitBreaker();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to resume sandbox";
      this.storage.setLastSpawnError(errorMessage, Date.now());
      this.storage.updateSandboxStatus("failed");
      this.broadcaster.broadcast({
        type: "sandbox_error",
        error: errorMessage,
      });
      this.log.error("Sandbox resume failed", {
        error: error instanceof Error ? error : String(error),
      });
    } finally {
      this.isSpawningSandbox = false;
    }
  }

  /**
   * Trigger a filesystem snapshot of the sandbox.
   */
  async triggerSnapshot(reason: string): Promise<void> {
    if (!this.provider.takeSnapshot) {
      this.log.debug("Provider does not support snapshots");
      return;
    }

    const sandbox = this.storage.getSandbox();
    const session = this.storage.getSession();

    if (!sandbox?.modal_object_id || !session) {
      this.log.debug("Cannot snapshot: no modal_object_id or session");
      return;
    }

    // Don't snapshot if already snapshotting
    if (sandbox.status === "snapshotting") {
      this.log.debug("Already snapshotting, skipping");
      return;
    }

    // Track previous status for non-terminal states
    const isTerminalState =
      sandbox.status === "stopped" || sandbox.status === "stale" || sandbox.status === "failed";
    const previousStatus = sandbox.status;

    if (!isTerminalState) {
      this.storage.updateSandboxStatus("snapshotting");
      this.broadcaster.broadcast({ type: "sandbox_status", status: "snapshotting" });
    }

    try {
      this.log.info("Taking snapshot", {
        event: "sandbox.snapshot",
        reason,
        modal_object_id: sandbox.modal_object_id,
      });

      const result = await this.provider.takeSnapshot({
        providerObjectId: sandbox.modal_object_id,
        sessionId: session.session_name || session.id,
        reason,
      });

      if (result.success && result.imageId) {
        this.storage.updateSandboxSnapshotImageId(sandbox.id, result.imageId);
        this.log.info("Snapshot saved", {
          event: "sandbox.snapshot_saved",
          image_id: result.imageId,
          reason,
        });
        this.broadcaster.broadcast({
          type: "snapshot_saved",
          imageId: result.imageId,
          reason,
        });
      } else {
        this.log.error("Snapshot failed", { error: result.error, reason });
      }
    } catch (error) {
      this.log.error("Snapshot request failed", {
        error: error instanceof Error ? error : String(error),
        reason,
      });
    }

    // Restore previous status if we weren't in a terminal state
    if (!isTerminalState && reason !== "heartbeat_timeout") {
      this.storage.updateSandboxStatus(previousStatus as SandboxStatus);
      this.broadcaster.broadcast({ type: "sandbox_status", status: previousStatus });
    }
  }

  /**
   * Whether the active provider can stop a sandbox via its API.
   */
  private canStopProviderSandbox(): boolean {
    return !!this.provider.capabilities.supportsExplicitStop && !!this.provider.stopSandbox;
  }

  /**
   * Whether stopping should preserve provider-owned state for in-place resume.
   */
  private usesProviderManagedStop(): boolean {
    return this.canStopProviderSandbox() && !!this.provider.capabilities.supportsPersistentResume;
  }

  /**
   * Clear preview URLs after a sandbox is no longer reachable.
   */
  private clearSandboxAccessState(): void {
    this.storage.clearSandboxCodeServer();
    this.storage.clearSandboxTunnelUrls();
    this.storage.clearSandboxTtyd();
  }

  /**
   * Stop a provider-managed sandbox via its API.
   */
  private async stopProviderSandbox(reason: string): Promise<void> {
    if (!this.provider.stopSandbox) {
      return;
    }

    const sandbox = this.storage.getSandbox();
    const session = this.storage.getSession();
    if (!sandbox?.modal_object_id || !session) {
      return;
    }

    const result = await this.provider.stopSandbox({
      providerObjectId: sandbox.modal_object_id,
      sessionId: session.session_name || session.id,
      reason,
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to stop provider sandbox");
    }
  }

  /**
   * Handle alarm for inactivity and heartbeat monitoring.
   */
  async handleAlarm(): Promise<void> {
    const sandbox = this.storage.getSandbox();
    if (!sandbox) {
      this.log.debug("Alarm fired: no sandbox found");
      return;
    }

    const now = Date.now();

    this.log.debug("Alarm fired", {
      sandbox_status: sandbox.status,
      last_activity: sandbox.last_activity,
      last_heartbeat: sandbox.last_heartbeat,
    });

    // Skip if sandbox is already in terminal state
    if (sandbox.status === "stopped" || sandbox.status === "failed" || sandbox.status === "stale") {
      this.log.debug("Alarm: sandbox in terminal state, skipping", {
        sandbox_status: sandbox.status,
      });
      return;
    }

    // Check connecting timeout — sandbox failed to connect within allowed time
    const connectingResult = evaluateConnectingTimeout(
      sandbox.status as SandboxStatus,
      sandbox.created_at,
      this.config.connectingTimeout,
      now
    );

    if (connectingResult.isTimedOut) {
      this.log.warn("Connecting timeout", {
        event: "sandbox.connecting_timeout",
        elapsed_ms: connectingResult.elapsedMs,
        timeout_ms: this.config.connectingTimeout.timeoutMs,
      });
      await this.callbacks.onSandboxTerminating?.();
      this.storage.updateSandboxStatus("failed");
      this.clearSandboxAccessState();
      if (this.canStopProviderSandbox()) {
        try {
          await this.stopProviderSandbox("connecting_timeout");
        } catch (error) {
          this.log.warn("Provider stop failed after connecting timeout", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      this.broadcaster.broadcast({ type: "sandbox_status", status: "failed" });
      this.broadcaster.broadcast({
        type: "sandbox_error",
        error:
          "Sandbox failed to connect within the allowed time. It will be retried on your next message.",
      });
      return;
    }

    // Check heartbeat health
    const heartbeatHealth = evaluateHeartbeatHealth(
      sandbox.last_heartbeat,
      this.config.heartbeat,
      now
    );

    if (heartbeatHealth.isStale) {
      this.log.warn("Heartbeat stale", {
        event: "sandbox.heartbeat_stale",
        last_heartbeat_ms: heartbeatHealth.ageMs || 0,
        threshold_ms: this.config.heartbeat.timeoutMs,
      });
      // Fail any stuck processing message before terminating
      await this.callbacks.onSandboxTerminating?.();
      this.storage.updateSandboxStatus("stale");
      this.clearSandboxAccessState();
      this.broadcaster.broadcast({ type: "sandbox_status", status: "stale" });

      if (this.usesProviderManagedStop()) {
        try {
          await this.stopProviderSandbox("heartbeat_timeout");
        } catch (error) {
          this.log.warn("Provider stop failed after heartbeat timeout", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        if (this.canStopProviderSandbox()) {
          await this.triggerSnapshot("heartbeat_timeout");
          try {
            await this.stopProviderSandbox("heartbeat_timeout");
          } catch (error) {
            this.log.warn("Provider stop failed after heartbeat timeout", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          // Fire-and-forget snapshot so status broadcast isn't delayed.
          this.triggerSnapshot("heartbeat_timeout").catch((e) =>
            this.log.error("Heartbeat snapshot failed", {
              error: e instanceof Error ? e : String(e),
            })
          );
        }
        this.wsManager.sendToSandbox({ type: "shutdown" });
      }

      this.wsManager.closeSandboxWebSocket(1000, "Heartbeat stale");
      return;
    }

    // Evaluate inactivity timeout
    const connectedClients = this.getConnectedClientCount();
    const inactivityState = {
      lastActivity: sandbox.last_activity,
      status: sandbox.status as SandboxStatus,
      connectedClientCount: connectedClients,
    };

    const inactivityDecision = evaluateInactivityTimeout(
      inactivityState,
      this.config.inactivity,
      now
    );

    switch (inactivityDecision.action) {
      case "timeout":
        this.log.info("Inactivity timeout", {
          event: "sandbox.timeout",
          last_activity: sandbox.last_activity,
          timeout_ms: this.config.inactivity.timeoutMs,
        });
        // Fail any stuck processing message before terminating
        await this.callbacks.onSandboxTerminating?.();
        // Set status to stopped FIRST to block reconnection attempts
        this.storage.updateSandboxStatus("stopped");
        this.clearSandboxAccessState();
        this.broadcaster.broadcast({ type: "sandbox_status", status: "stopped" });

        if (this.usesProviderManagedStop()) {
          try {
            await this.stopProviderSandbox("inactivity_timeout");
          } catch (error) {
            this.log.error("Provider stop failed after inactivity timeout", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          await this.triggerSnapshot("inactivity_timeout");
          this.wsManager.sendToSandbox({ type: "shutdown" });
          if (this.canStopProviderSandbox()) {
            try {
              await this.stopProviderSandbox("inactivity_timeout");
            } catch (error) {
              this.log.error("Provider stop failed after inactivity timeout", {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }

        this.wsManager.closeSandboxWebSocket(1000, "Inactivity timeout");

        this.broadcaster.broadcast({
          type: "sandbox_warning",
          message: this.usesProviderManagedStop()
            ? "Sandbox stopped due to inactivity"
            : "Sandbox stopped due to inactivity, snapshot saved",
        });
        return;

      case "extend":
        this.log.info("Inactivity extended", {
          connected_clients: connectedClients,
          extension_ms: inactivityDecision.extensionMs,
        });
        if (inactivityDecision.shouldWarn) {
          this.broadcaster.broadcast({
            type: "sandbox_warning",
            message:
              "Sandbox will stop in 5 minutes due to inactivity. Send a message to keep it alive.",
          });
        }
        await this.alarmScheduler.scheduleAlarm(now + inactivityDecision.extensionMs);
        return;

      case "schedule":
        this.log.debug("Scheduling next alarm", { next_check_ms: inactivityDecision.nextCheckMs });
        await this.alarmScheduler.scheduleAlarm(now + inactivityDecision.nextCheckMs);
        return;
    }
  }

  /**
   * Warm sandbox proactively (e.g., when user starts typing).
   */
  async warmSandbox(): Promise<void> {
    const sandbox = this.storage.getSandbox();

    const warmState = {
      hasActiveWebSocket: this.wsManager.getSandboxWebSocket() !== null,
      status: sandbox?.status as SandboxStatus | null,
      isSpawningInMemory: this.isSpawningSandbox,
    };

    const warmDecision = evaluateWarmDecision(warmState);

    if (warmDecision.action === "skip") {
      this.log.debug("Warm skipped", { reason: warmDecision.reason });
      return;
    }

    this.log.info("Warming sandbox");
    this.broadcaster.broadcast({ type: "sandbox_warming" });
    await this.spawnSandbox();
  }

  /**
   * Update last activity timestamp.
   */
  updateLastActivity(timestamp: number): void {
    this.storage.updateSandboxLastActivity(timestamp);
  }

  /**
   * Schedule an inactivity check alarm.
   */
  async scheduleInactivityCheck(): Promise<void> {
    const alarmTime = Date.now() + this.config.inactivity.timeoutMs;
    this.log.debug("Scheduling inactivity check", { timeout_ms: this.config.inactivity.timeoutMs });
    await this.alarmScheduler.scheduleAlarm(alarmTime);
  }

  /**
   * Schedule a disconnect check alarm (heartbeat timeout from now).
   * Used after abnormal WebSocket close to ensure dead sandboxes are detected
   * promptly. If the bridge reconnects, scheduleInactivityCheck() will override
   * this alarm (Cloudflare DOs support only one alarm at a time).
   */
  async scheduleDisconnectCheck(): Promise<void> {
    const alarmTime = Date.now() + this.config.heartbeat.timeoutMs;
    this.log.debug("Scheduling disconnect check", { timeout_ms: this.config.heartbeat.timeoutMs });
    await this.alarmScheduler.scheduleAlarm(alarmTime);
  }

  /**
   * Resolve the provider and model ID from the session or config default.
   * e.g., "openai/gpt-5.2-codex" -> { provider: "openai", model: "gpt-5.2-codex" }
   */
  private resolveProviderAndModel(session: SessionRow): { provider: string; model: string } {
    return extractProviderAndModel(session.model || this.config.model);
  }

  /**
   * Get the count of connected client WebSockets.
   */
  private getConnectedClientCount(): number {
    return this.wsManager.getConnectedClientCount();
  }

  private storeAndBroadcastProviderObjectId(providerObjectId: string): void {
    this.storeProviderObjectId(providerObjectId);
    this.broadcastSandboxDashboardUrl(providerObjectId);
  }

  private storeProviderObjectId(providerObjectId: string): void {
    this.storage.updateSandboxModalObjectId(providerObjectId);
  }

  private broadcastSandboxDashboardUrl(providerObjectId: string): void {
    const url = this.config.sandboxDashboardUrlBuilder?.(providerObjectId);
    if (url) {
      this.log.debug("Broadcasting sandbox dashboard URL", {
        provider_object_id: providerObjectId,
      });
      this.broadcaster.broadcast({ type: "sandbox_dashboard_url", url });
    }
  }

  /**
   * Store code-server details in the database and push to connected clients.
   * Shared by doSpawn() and restoreFromSnapshot().
   *
   * The storage adapter may encrypt the password before persisting;
   * the plaintext is broadcast over the already-authenticated WebSocket.
   */
  private async storeAndBroadcastCodeServer(url: string, password: string): Promise<void> {
    this.log.info("Storing and broadcasting code-server info", { url });
    await this.storage.updateSandboxCodeServer(url, password);
    this.broadcaster.broadcast({
      type: "code_server_info",
      url,
      password,
    });
  }

  private parseSandboxSettings(session: SessionRow): SandboxSettings {
    if (!session.sandbox_settings) return {};
    try {
      const parsed: unknown = JSON.parse(session.sandbox_settings);
      return normalizeSandboxSettings(parsed, { invalid: "omit" });
    } catch {
      this.log.warn("Failed to parse sandbox_settings, using defaults");
      return {};
    }
  }

  /**
   * Mint a gateway token when the session opted into the LLM gateway.
   *
   * Fails CLOSED on misconfiguration: if the gateway is requested but unconfigured
   * (or minting throws), this throws so the spawn aborts — never silently falling
   * back to raw provider-key injection.
   *
   * Fails OPEN on image incapability (CON-72): the gateway only works when the
   * sandbox's boot image bakes `gateway-plugin.js`. A restore of a pre-gateway
   * snapshot — or a repo image — can't register the gateway provider, so minting a
   * token there would make Modal drop the raw `llm_secrets` and leave the sandbox
   * with no usable provider. For that one boot we return empty fields (raw-key
   * fallback) and warn. This is a deliberate, bounded fail-open: the boot image is
   * selected by the control plane (not attacker-injectable), so the only "leak" is
   * the session's own pre-gateway status quo. (Such a session never routes through
   * the gateway and keeps snapshotting its legacy image — the gateway applies to
   * sessions whose first spawn is plugin-bearing.)
   *
   * When the gateway is not requested, returns empty fields and the sandbox spawns
   * normally with raw keys.
   */
  private async mintGatewayTokenIfEnabled(
    sid: string,
    sandboxSettings: SandboxSettings,
    runtimeGatewayCapable: boolean
  ): Promise<{ gatewayToken?: string; gatewayBaseUrl?: string }> {
    if (!sandboxSettings.llmGatewayEnabled) {
      return {};
    }

    const { terminusJwtSecret, terminusGatewayUrl } = this.config;
    if (!terminusJwtSecret || !terminusGatewayUrl) {
      throw new Error(
        "llmGatewayEnabled is set but the LLM gateway is not configured " +
          "(TERMINUS_JWT_SECRET / TERMINUS_GATEWAY_URL missing); refusing to spawn with raw keys"
      );
    }

    if (!runtimeGatewayCapable) {
      this.log.warn(
        "llmGatewayEnabled but the boot image lacks the gateway plugin; " +
          "falling back to raw provider keys for this boot",
        { event: "sandbox.gateway_not_capable" }
      );
      return {};
    }

    const gatewayToken = await mintGatewayToken(
      { sid, tenant: null, allowed_models: [] },
      terminusJwtSecret
    );
    this.log.info("Minted gateway token", { event: "sandbox.gateway_token_minted" });
    return { gatewayToken, gatewayBaseUrl: terminusGatewayUrl };
  }

  private async storeAndBroadcastTunnelUrls(
    urls: Record<string, string> | undefined
  ): Promise<void> {
    if (!urls || Object.keys(urls).length === 0) return;
    this.log.info("Storing and broadcasting tunnel URLs", { ports: Object.keys(urls) });
    await this.storage.updateSandboxTunnelUrls(urls);
    this.broadcaster.broadcast({ type: "tunnel_urls", urls });
  }

  /**
   * Mint a terminal JWT, persist the ttyd proxy URL + token, and broadcast to clients.
   * The storage adapter encrypts the token before persisting (same pattern as code-server).
   */
  private async storeAndBroadcastTtyd(
    url: string,
    sandboxAuthToken: string,
    sessionId: string,
    sandboxId: string
  ): Promise<void> {
    const token = await mintJwt(
      {
        sub: sessionId,
        sid: sandboxId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + TERMINAL_TOKEN_TTL_SECONDS,
      },
      sandboxAuthToken
    );

    this.log.info("Storing and broadcasting ttyd info", { url });
    await this.storage.updateSandboxTtyd(url, token);
    this.broadcaster.broadcast({ type: "ttyd_info", url, token });
  }

  /**
   * Check if a sandbox spawn is currently in progress.
   * Used by SessionDO to coordinate spawn decisions.
   */
  isSpawning(): boolean {
    return this.isSpawningSandbox;
  }

  /**
   * Notify the manager that a sandbox has connected.
   * Resets the in-memory spawning flag and clears any stale spawn error.
   *
   * Called by SessionDO when sandbox WebSocket connects successfully.
   */
  onSandboxConnected(): void {
    this.isSpawningSandbox = false;
    this.storage.setLastSpawnError(null, null);
  }
}
