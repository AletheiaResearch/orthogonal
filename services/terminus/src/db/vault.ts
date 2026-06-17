/**
 * Credential vault (CON-50) — the encrypted-at-rest store over Terminus's own D1.
 *
 * All access goes through Drizzle (parameterized — no hand-rolled SQL). Secrets are
 * AES-256-GCM encrypted with the owner as AAD, so a row cannot be decrypted under a
 * different owner; plaintext exists only in-isolate, transiently. Platform and BYOK
 * credentials are the same rows, distinguished by `owner` (the Helicone model).
 */
import { decryptSecret, encryptSecret } from "@open-inspect/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import { type CredentialOwnerType, providerCredentials } from "./schema";

/** Synthetic provider id under which Codex OAuth credentials are stored. */
export const CODEX_PROVIDER = "codex";

export interface CredentialOwner {
  type: CredentialOwnerType;
  id: string;
}

const PLATFORM_OWNER: CredentialOwner = { type: "platform", id: "" };

/** A decrypted credential, discriminated by how its secret is shaped. */
export type DecryptedCredential =
  | { mode: "api_key"; apiKey: string }
  | {
      mode: "codex-oauth";
      refreshToken: string;
      accessToken?: string;
      accountId?: string;
      expiresAtMs?: number;
    };

/** The codex secret blob (encrypted as JSON in `secret_encrypted`). */
interface CodexSecret {
  refresh: string;
  access?: string;
  accountId?: string;
}

/** AES-GCM AAD binding ciphertext to its owner. */
function ownerAad(owner: CredentialOwner): string {
  return `${owner.type}:${owner.id}`;
}

export class CredentialVault {
  constructor(
    private readonly db: DrizzleD1Database,
    private readonly encryptionKey: string,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Store (or replace) a plain provider API key. */
  async putApiKey(input: {
    provider: string;
    apiKey: string;
    owner?: CredentialOwner;
    enabled?: boolean;
  }): Promise<void> {
    if (!input.apiKey) throw new Error("CredentialVault.putApiKey: apiKey must be non-empty");
    await this.upsert({
      owner: input.owner ?? PLATFORM_OWNER,
      provider: input.provider,
      credentialMode: "api_key",
      secret: input.apiKey,
      expiresAt: null,
      enabled: input.enabled ?? true,
    });
  }

  /** Store (or replace) the Codex OAuth components for an owner. */
  async putCodexCredential(input: {
    refreshToken: string;
    accessToken?: string;
    accountId?: string;
    expiresAtMs?: number;
    owner?: CredentialOwner;
    enabled?: boolean;
  }): Promise<void> {
    if (!input.refreshToken) {
      throw new Error("CredentialVault.putCodexCredential: refreshToken must be non-empty");
    }
    const secret: CodexSecret = {
      refresh: input.refreshToken,
      access: input.accessToken,
      accountId: input.accountId,
    };
    await this.upsert({
      owner: input.owner ?? PLATFORM_OWNER,
      provider: CODEX_PROVIDER,
      credentialMode: "codex-oauth",
      secret: JSON.stringify(secret),
      expiresAt: input.expiresAtMs ?? null,
      enabled: input.enabled ?? true,
    });
  }

  /**
   * Resolve + decrypt an **enabled** credential for `(owner, provider)`, or null.
   * Disabled rows are terminal — they never serve a request and are never refreshed
   * by the cron (revocation = set `enabled` false).
   */
  async getCredential(
    provider: string,
    owner: CredentialOwner = PLATFORM_OWNER
  ): Promise<DecryptedCredential | null> {
    const [row] = await this.db
      .select()
      .from(providerCredentials)
      .where(
        and(
          eq(providerCredentials.ownerType, owner.type),
          eq(providerCredentials.ownerId, owner.id),
          eq(providerCredentials.provider, provider),
          eq(providerCredentials.enabled, true)
        )
      )
      .limit(1);
    if (!row) return null;

    const plaintext = await decryptSecret(row.secretEncrypted, this.encryptionKey, ownerAad(owner));
    if (row.credentialMode === "codex-oauth") {
      const secret = JSON.parse(plaintext) as CodexSecret;
      return {
        mode: "codex-oauth",
        refreshToken: secret.refresh,
        accessToken: secret.access,
        accountId: secret.accountId,
        expiresAtMs: row.expiresAt ?? undefined,
      };
    }
    return { mode: "api_key", apiKey: plaintext };
  }

  /** Provider ids with an enabled credential for `owner` (no decryption — for the catalog). */
  async listEnabledProviders(owner: CredentialOwner = PLATFORM_OWNER): Promise<string[]> {
    const rows = await this.db
      .select({ provider: providerCredentials.provider })
      .from(providerCredentials)
      .where(
        and(
          eq(providerCredentials.ownerType, owner.type),
          eq(providerCredentials.ownerId, owner.id),
          eq(providerCredentials.enabled, true)
        )
      );
    return rows.map((r) => r.provider);
  }

  /** All provider ids with a row for `owner`, regardless of `enabled` — the env-seed guard. */
  async listAllProviders(owner: CredentialOwner = PLATFORM_OWNER): Promise<string[]> {
    const rows = await this.db
      .select({ provider: providerCredentials.provider })
      .from(providerCredentials)
      .where(
        and(
          eq(providerCredentials.ownerType, owner.type),
          eq(providerCredentials.ownerId, owner.id)
        )
      );
    return rows.map((r) => r.provider);
  }

  /**
   * Seed Codex creds only if no row exists yet (insert-if-absent). Idempotent and
   * race-safe: a concurrent writer that already rotated the single-use token is never
   * clobbered by a late seed carrying the original (now-consumed) refresh token.
   */
  async seedCodexCredential(input: {
    refreshToken: string;
    accountId?: string;
    owner?: CredentialOwner;
  }): Promise<void> {
    if (!input.refreshToken) {
      throw new Error("CredentialVault.seedCodexCredential: refreshToken must be non-empty");
    }
    const owner = input.owner ?? PLATFORM_OWNER;
    const nowMs = this.now();
    const secret: CodexSecret = { refresh: input.refreshToken, accountId: input.accountId };
    const secretEncrypted = await encryptSecret(
      JSON.stringify(secret),
      this.encryptionKey,
      ownerAad(owner)
    );
    await this.db
      .insert(providerCredentials)
      .values({
        id: crypto.randomUUID(),
        ownerType: owner.type,
        ownerId: owner.id,
        provider: CODEX_PROVIDER,
        credentialMode: "codex-oauth",
        secretEncrypted,
        expiresAt: null,
        enabled: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      })
      .onConflictDoNothing({
        target: [
          providerCredentials.ownerType,
          providerCredentials.ownerId,
          providerCredentials.provider,
        ],
      });
  }

  private async upsert(args: {
    owner: CredentialOwner;
    provider: string;
    credentialMode: "api_key" | "codex-oauth";
    secret: string;
    expiresAt: number | null;
    enabled: boolean;
  }): Promise<void> {
    const nowMs = this.now();
    const secretEncrypted = await encryptSecret(
      args.secret,
      this.encryptionKey,
      ownerAad(args.owner)
    );
    await this.db
      .insert(providerCredentials)
      .values({
        id: crypto.randomUUID(),
        ownerType: args.owner.type,
        ownerId: args.owner.id,
        provider: args.provider,
        credentialMode: args.credentialMode,
        secretEncrypted,
        expiresAt: args.expiresAt,
        enabled: args.enabled,
        createdAt: nowMs,
        updatedAt: nowMs,
      })
      .onConflictDoUpdate({
        target: [
          providerCredentials.ownerType,
          providerCredentials.ownerId,
          providerCredentials.provider,
        ],
        set: {
          secretEncrypted,
          credentialMode: args.credentialMode,
          expiresAt: args.expiresAt,
          enabled: args.enabled,
          updatedAt: nowMs,
        },
      });
  }
}
