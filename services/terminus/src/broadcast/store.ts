/**
 * Destination store (CON-73) — the encrypted-at-rest registry over Terminus's own D1,
 * a sibling of `CredentialVault`. Each destination's auth material is AES-256-GCM
 * encrypted with the owner as AAD (so a row can't be decrypted under another owner);
 * the non-secret `config` is stored plaintext. Access is owner-scoped and goes through
 * Drizzle (parameterized — no hand-rolled SQL).
 *
 * `listEnabled` is what the dispatcher reads per call: it decrypts + parses the enabled
 * rows into `ResolvedDestinationRow`s, which the registry maps to adapter instances.
 * `listForOwner` is the admin projection and NEVER includes the secret.
 */
import { decryptSecret, encryptSecret } from "@open-inspect/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import { type BroadcastDestinationRow, broadcastDestinations } from "../db/schema";
import { type CredentialOwner, PLATFORM_OWNER } from "../db/vault";

/** Owner-visible destination metadata for the admin API — never includes the secret. */
export type PublicDestinationRow = Pick<
  BroadcastDestinationRow,
  | "id"
  | "ownerType"
  | "ownerId"
  | "type"
  | "label"
  | "enabled"
  | "samplingRate"
  | "config"
  | "createdAt"
  | "updatedAt"
>;

/** A decrypted + parsed destination row — what the registry turns into an adapter. */
export interface ResolvedDestinationRow {
  id: string;
  type: string;
  label: string;
  enabled: boolean;
  samplingRate: number;
  /** Parsed non-secret config JSON. */
  config: unknown;
  /** Parsed decrypted auth-material JSON. */
  secret: unknown;
}

export interface CreateDestinationInput {
  type: string;
  /** Non-secret config — stored as JSON plaintext. */
  config: unknown;
  /** Auth material — JSON-encoded then AES-256-GCM encrypted at rest. */
  secret: unknown;
  label?: string;
  samplingRate?: number;
  enabled?: boolean;
  owner?: CredentialOwner;
}

/** AES-GCM AAD binding ciphertext to its owner (mirrors `CredentialVault`). */
function ownerAad(owner: CredentialOwner): string {
  return `${owner.type}:${owner.id}`;
}

export class DestinationStore {
  constructor(
    private readonly db: DrizzleD1Database,
    private readonly encryptionKey: string,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Insert a new destination. Throws on a duplicate (owner, type, label). */
  async create(input: CreateDestinationInput): Promise<{ id: string }> {
    const owner = input.owner ?? PLATFORM_OWNER;
    const nowMs = this.now();
    const id = crypto.randomUUID();
    const secretEncrypted = await encryptSecret(
      JSON.stringify(input.secret ?? {}),
      this.encryptionKey,
      ownerAad(owner)
    );
    await this.db.insert(broadcastDestinations).values({
      id,
      ownerType: owner.type,
      ownerId: owner.id,
      type: input.type,
      enabled: input.enabled ?? true,
      samplingRate: input.samplingRate ?? 1,
      config: JSON.stringify(input.config ?? {}),
      secretEncrypted,
      label: input.label ?? "default",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { id };
  }

  /** Owner-scoped metadata for the admin API — never includes the secret. */
  async listForOwner(owner: CredentialOwner = PLATFORM_OWNER): Promise<PublicDestinationRow[]> {
    return this.db
      .select({
        id: broadcastDestinations.id,
        ownerType: broadcastDestinations.ownerType,
        ownerId: broadcastDestinations.ownerId,
        type: broadcastDestinations.type,
        label: broadcastDestinations.label,
        enabled: broadcastDestinations.enabled,
        samplingRate: broadcastDestinations.samplingRate,
        config: broadcastDestinations.config,
        createdAt: broadcastDestinations.createdAt,
        updatedAt: broadcastDestinations.updatedAt,
      })
      .from(broadcastDestinations)
      .where(
        and(
          eq(broadcastDestinations.ownerType, owner.type),
          eq(broadcastDestinations.ownerId, owner.id)
        )
      );
  }

  /**
   * Enabled rows, still encrypted (no decryption). The registry caches THESE per-isolate
   * with a short TTL so a zero-destination deployment costs no per-request D1 read and no
   * decrypted secret is ever held in a cache (decryption happens per call, transiently).
   */
  async listEnabledRaw(
    owner: CredentialOwner = PLATFORM_OWNER
  ): Promise<BroadcastDestinationRow[]> {
    return this.db
      .select()
      .from(broadcastDestinations)
      .where(
        and(
          eq(broadcastDestinations.ownerType, owner.type),
          eq(broadcastDestinations.ownerId, owner.id),
          eq(broadcastDestinations.enabled, true)
        )
      );
  }

  /** Enabled destinations, decrypted + parsed — the dispatcher's per-call fan-out set. */
  async listEnabled(owner: CredentialOwner = PLATFORM_OWNER): Promise<ResolvedDestinationRow[]> {
    const rows = await this.listEnabledRaw(owner);
    return Promise.all(rows.map((row) => this.decryptRow(row, owner)));
  }

  /** Decrypt one destination by id (owner-scoped) — for the admin test-connection action. */
  async getDecrypted(
    id: string,
    owner: CredentialOwner = PLATFORM_OWNER
  ): Promise<ResolvedDestinationRow | null> {
    const [row] = await this.db
      .select()
      .from(broadcastDestinations)
      .where(
        and(
          eq(broadcastDestinations.id, id),
          eq(broadcastDestinations.ownerType, owner.type),
          eq(broadcastDestinations.ownerId, owner.id)
        )
      )
      .limit(1);
    return row ? this.decryptRow(row, owner) : null;
  }

  /** Enable/disable a destination (owner-scoped). Returns whether a row matched. */
  async setEnabled(
    id: string,
    enabled: boolean,
    owner: CredentialOwner = PLATFORM_OWNER
  ): Promise<boolean> {
    const updated = await this.db
      .update(broadcastDestinations)
      .set({ enabled, updatedAt: this.now() })
      .where(
        and(
          eq(broadcastDestinations.id, id),
          eq(broadcastDestinations.ownerType, owner.type),
          eq(broadcastDestinations.ownerId, owner.id)
        )
      )
      .returning({ id: broadcastDestinations.id });
    return updated.length > 0;
  }

  /** Delete a destination (owner-scoped). Returns whether a row matched. */
  async delete(id: string, owner: CredentialOwner = PLATFORM_OWNER): Promise<boolean> {
    const deleted = await this.db
      .delete(broadcastDestinations)
      .where(
        and(
          eq(broadcastDestinations.id, id),
          eq(broadcastDestinations.ownerType, owner.type),
          eq(broadcastDestinations.ownerId, owner.id)
        )
      )
      .returning({ id: broadcastDestinations.id });
    return deleted.length > 0;
  }

  /** Decrypt + parse one raw row (owner-scoped). Used by `listEnabled`/`getDecrypted`
   * and by the registry when resolving cached raw rows. */
  async decryptRow(
    row: BroadcastDestinationRow,
    owner: CredentialOwner = PLATFORM_OWNER
  ): Promise<ResolvedDestinationRow> {
    const secretPlain = await decryptSecret(
      row.secretEncrypted,
      this.encryptionKey,
      ownerAad(owner)
    );
    return {
      id: row.id,
      type: row.type,
      label: row.label,
      enabled: row.enabled,
      samplingRate: row.samplingRate,
      config: JSON.parse(row.config),
      secret: JSON.parse(secretPlain),
    };
  }
}
