/**
 * Policy store (CON-71 L2) — reads the active guardrail policy for an owner and
 * provides the admin CRUD over `policies` / `policy_versions`. The active-policy
 * lookup is cached in-isolate (module-level) with a short TTL, including the `null`
 * "none configured" result, so the default no-policy request path costs no per-request
 * D1 read. Lazy-seeds a `platform-default` policy from `TERMINUS_GATEWAY_POLICY`.
 *
 * Fail-closed: a configured-but-unloadable policy (D1 error, or a stored/seed blob
 * that fails validation) throws `policyUnavailable()` (503) — never a silent
 * pass-through. "Nothing configured" (no policy row + no seed secret) returns null.
 */
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import { type PolicyRow, policies, policyVersions } from "../db/schema";
import { type CredentialOwner, PLATFORM_OWNER } from "../db/vault";
import { GatewayError, policyUnavailable } from "../errors";
import { type GuardrailPolicy, parsePolicy } from "./blob";

/** In-isolate cache TTL for the active-policy lookup (ms). Policies change rarely. */
export const POLICY_CACHE_TTL_MS = 30_000;

/** Default policy name for the single platform-default policy seeded/managed in v1. */
const PLATFORM_DEFAULT_NAME = "platform-default";

interface CacheEntry {
  policy: GuardrailPolicy | null;
  fetchedAtMs: number;
}

/** Module-level cache shared across requests in one isolate (not KV; holds no secret). */
const defaultCache = new Map<string, CacheEntry>();

function ownerKey(owner: CredentialOwner): string {
  return `${owner.type}:${owner.id}`;
}

function trimmed(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t && t.length > 0 ? t : undefined;
}

export class PolicyStore {
  private readonly now: () => number;
  private readonly cache: Map<string, CacheEntry>;
  private readonly ttlMs: number;

  constructor(
    private readonly db: DrizzleD1Database,
    private readonly env: { TERMINUS_GATEWAY_POLICY?: string },
    opts?: { now?: () => number; cache?: Map<string, CacheEntry>; ttlMs?: number }
  ) {
    this.now = opts?.now ?? (() => Date.now());
    this.cache = opts?.cache ?? defaultCache;
    this.ttlMs = opts?.ttlMs ?? POLICY_CACHE_TTL_MS;
  }

  /**
   * The active guardrail policy for `owner`, or null when none is configured.
   * Cached per owner with a short TTL (null cached too). Throws `policyUnavailable()`
   * (503) when a configured policy can't be loaded/validated (fail-closed).
   */
  async getActivePolicy(owner: CredentialOwner = PLATFORM_OWNER): Promise<GuardrailPolicy | null> {
    const key = ownerKey(owner);
    const nowMs = this.now();
    const cached = this.cache.get(key);
    if (cached && nowMs - cached.fetchedAtMs < this.ttlMs) return cached.policy;

    let policy: GuardrailPolicy | null;
    try {
      policy = await this.loadActive(owner);
    } catch (err) {
      // A configured policy that can't load/parse is fail-closed (503), never pass-through.
      throw err instanceof GatewayError ? err : policyUnavailable();
    }
    this.cache.set(key, { policy, fetchedAtMs: nowMs });
    return policy;
  }

  /** Load + validate the active version's blob, or lazy-seed, or null. */
  private async loadActive(owner: CredentialOwner): Promise<GuardrailPolicy | null> {
    const rows = await this.db
      .select({ config: policyVersions.config })
      .from(policyVersions)
      .innerJoin(policies, eq(policyVersions.policyId, policies.id))
      .where(
        and(
          eq(policies.ownerType, owner.type),
          eq(policies.ownerId, owner.id),
          eq(policies.enabled, true),
          eq(policyVersions.isActive, true)
        )
      )
      .limit(1);
    if (rows.length > 0) return parsePolicy(JSON.parse(rows[0].config));
    return this.seedFromEnv(owner);
  }

  /**
   * Insert a `platform-default` policy + active version 1 from the env seed blob, only
   * when no policy row exists for the owner (so an admin-managed policy is never clobbered).
   * Idempotent + race-safe via insert-if-absent. Returns the seeded policy, or null when
   * there is no seed secret (or a policy already exists with no active version → pass-through).
   */
  private async seedFromEnv(owner: CredentialOwner): Promise<GuardrailPolicy | null> {
    const raw = trimmed(this.env.TERMINUS_GATEWAY_POLICY);
    if (!raw) return null;

    const [existing] = await this.db
      .select({ id: policies.id })
      .from(policies)
      .where(
        and(
          eq(policies.ownerType, owner.type),
          eq(policies.ownerId, owner.id),
          eq(policies.name, PLATFORM_DEFAULT_NAME)
        )
      )
      .limit(1);
    if (existing) return null; // admin (or a prior seed) owns it; don't seed over it

    const policy = parsePolicy(JSON.parse(raw)); // invalid seed → throws → fail-closed (503)
    const nowMs = this.now();
    await this.db
      .insert(policies)
      .values({
        id: crypto.randomUUID(),
        ownerType: owner.type,
        ownerId: owner.id,
        name: PLATFORM_DEFAULT_NAME,
        enabled: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      })
      .onConflictDoNothing({ target: [policies.ownerType, policies.ownerId, policies.name] });

    // Re-read the winner's id (a concurrent seeder may have inserted it first).
    const [seeded] = await this.db
      .select({ id: policies.id })
      .from(policies)
      .where(
        and(
          eq(policies.ownerType, owner.type),
          eq(policies.ownerId, owner.id),
          eq(policies.name, PLATFORM_DEFAULT_NAME)
        )
      )
      .limit(1);
    if (seeded) {
      await this.db
        .insert(policyVersions)
        .values({
          id: crypto.randomUUID(),
          policyId: seeded.id,
          version: 1,
          config: JSON.stringify(policy),
          isActive: true,
          createdAt: nowMs,
        })
        .onConflictDoNothing();
    }
    return policy;
  }

  /** Admin: create a new (empty) policy. */
  async createPolicy(input: { name?: string; owner?: CredentialOwner }): Promise<{ id: string }> {
    const owner = input.owner ?? PLATFORM_OWNER;
    const id = crypto.randomUUID();
    const nowMs = this.now();
    await this.db.insert(policies).values({
      id,
      ownerType: owner.type,
      ownerId: owner.id,
      name: input.name ?? PLATFORM_DEFAULT_NAME,
      enabled: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    this.cache.clear();
    return { id };
  }

  /**
   * Admin: validate `config` (throws a plain error on a bad blob → caller maps to 400),
   * append it as `max(version)+1`, optionally activating it (atomic deactivate+insert).
   */
  async createVersion(
    policyId: string,
    config: unknown,
    activate = false
  ): Promise<{ id: string; version: number }> {
    const policy = parsePolicy(config);
    const stored = JSON.stringify(policy);
    const nowMs = this.now();
    const [{ max }] = await this.db
      .select({ max: sql<number>`COALESCE(MAX(${policyVersions.version}), 0)` })
      .from(policyVersions)
      .where(eq(policyVersions.policyId, policyId));
    const version = (max ?? 0) + 1;
    const id = crypto.randomUUID();
    const insert = this.db
      .insert(policyVersions)
      .values({ id, policyId, version, config: stored, isActive: activate, createdAt: nowMs });
    if (activate) {
      await this.db.batch([this.deactivateActive(policyId), insert]);
    } else {
      await insert;
    }
    this.cache.clear();
    return { id, version };
  }

  /** Admin: make `version` the active one (atomic). Returns false when it doesn't exist. */
  async setActiveVersion(policyId: string, version: number): Promise<boolean> {
    const [target] = await this.db
      .select({ id: policyVersions.id })
      .from(policyVersions)
      .where(and(eq(policyVersions.policyId, policyId), eq(policyVersions.version, version)))
      .limit(1);
    if (!target) return false;
    await this.db.batch([
      this.deactivateActive(policyId),
      this.db
        .update(policyVersions)
        .set({ isActive: true })
        .where(eq(policyVersions.id, target.id)),
    ]);
    this.cache.clear();
    return true;
  }

  /** Admin: policies for an owner. */
  async listPolicies(owner: CredentialOwner = PLATFORM_OWNER): Promise<PolicyRow[]> {
    return this.db
      .select()
      .from(policies)
      .where(and(eq(policies.ownerType, owner.type), eq(policies.ownerId, owner.id)));
  }

  /** Admin: versions of a policy (newest first), config included (it is not a secret). */
  async listVersions(
    policyId: string
  ): Promise<Array<{ version: number; isActive: boolean; createdAt: number; config: string }>> {
    return this.db
      .select({
        version: policyVersions.version,
        isActive: policyVersions.isActive,
        createdAt: policyVersions.createdAt,
        config: policyVersions.config,
      })
      .from(policyVersions)
      .where(eq(policyVersions.policyId, policyId))
      .orderBy(sql`${policyVersions.version} DESC`);
  }

  private deactivateActive(policyId: string) {
    return this.db
      .update(policyVersions)
      .set({ isActive: false })
      .where(and(eq(policyVersions.policyId, policyId), eq(policyVersions.isActive, true)));
  }
}
