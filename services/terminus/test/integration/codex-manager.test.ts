import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodexTokenManager } from "../../src/credentials/codex-manager";
import { CodexRefreshUnauthorizedError } from "../../src/credentials/codex-oauth";
import { providerCredentials } from "../../src/db/schema";
import { CredentialVault } from "../../src/db/vault";

const db = drizzle(env.DB);
const vault = new CredentialVault(db, env.CREDENTIALS_ENCRYPTION_KEY);

afterEach(async () => {
  await db.delete(providerCredentials);
});

function manager(refresh: () => Promise<unknown>, now: () => number = () => 0) {
  return new CodexTokenManager(vault, {
    refresh: refresh as never,
    now,
    rereadDelayMs: 0,
  });
}

const HOUR_MS = 60 * 60 * 1000;

describe("CodexTokenManager", () => {
  it("returns null when Codex is not configured", async () => {
    const refresh = vi.fn();
    expect(await manager(refresh).getAccessToken()).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns the cached access token without refreshing when it is fresh", async () => {
    await vault.putCodexCredential({
      refreshToken: "rt",
      accessToken: "at-fresh",
      accountId: "acc",
      expiresAtMs: HOUR_MS,
    });
    const refresh = vi.fn();
    expect(await manager(refresh, () => 0).getAccessToken()).toEqual({
      accessToken: "at-fresh",
      accountId: "acc",
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes + persists rotated tokens when near expiry", async () => {
    await vault.putCodexCredential({
      refreshToken: "rt-old",
      accessToken: "at-old",
      accountId: "acc",
      expiresAtMs: 1000,
    });
    const refresh = vi.fn(async () => ({
      accessToken: "at-new",
      refreshToken: "rt-new",
      accountId: "acc",
      expiresInSeconds: 3600,
    }));
    expect(await manager(refresh, () => 10_000).getAccessToken()).toEqual({
      accessToken: "at-new",
      accountId: "acc",
    });
    expect(refresh).toHaveBeenCalledWith("rt-old");
    expect(await vault.getCredential("codex")).toMatchObject({
      mode: "codex-oauth",
      refreshToken: "rt-new",
      accessToken: "at-new",
    });
  });

  it("on a 401 (already rotated) re-reads the vault and uses the fresh token", async () => {
    await vault.putCodexCredential({
      refreshToken: "rt-old",
      accessToken: "at-old",
      accountId: "acc",
      expiresAtMs: 1000,
    });
    const refresh = vi.fn(async () => {
      // a concurrent writer rotated the vault first
      await vault.putCodexCredential({
        refreshToken: "rt-concurrent",
        accessToken: "at-concurrent",
        accountId: "acc",
        expiresAtMs: HOUR_MS,
      });
      throw new CodexRefreshUnauthorizedError("already rotated");
    });
    expect(await manager(refresh, () => 10_000).getAccessToken()).toEqual({
      accessToken: "at-concurrent",
      accountId: "acc",
    });
  });

  it("refreshIfNearExpiry refreshes a near-expiry token (cron path)", async () => {
    await vault.putCodexCredential({
      refreshToken: "rt",
      accessToken: "at-old",
      expiresAtMs: 1000,
    });
    const refresh = vi.fn(async () => ({
      accessToken: "at-new",
      refreshToken: "rt2",
      expiresInSeconds: 3600,
    }));
    await manager(refresh, () => 10_000).refreshIfNearExpiry();
    expect(refresh).toHaveBeenCalled();
    expect(await vault.getCredential("codex")).toMatchObject({
      accessToken: "at-new",
      refreshToken: "rt2",
    });
  });

  it("refreshIfNearExpiry refreshes every owner's near-expiry token (cron, multi-owner)", async () => {
    await vault.putCodexCredential({
      refreshToken: "rt-plat",
      accessToken: "at-old",
      expiresAtMs: 1000,
    });
    await vault.putCodexCredential({
      refreshToken: "rt-tenant",
      accessToken: "at-old-t",
      expiresAtMs: 1000,
      owner: { type: "tenant", id: "t1" },
    });
    const refreshed: string[] = [];
    const refresh = vi.fn(async (rt: string) => {
      refreshed.push(rt);
      return { accessToken: `new-${rt}`, refreshToken: `rot-${rt}`, expiresInSeconds: 3600 };
    });

    await manager(refresh, () => 10_000).refreshIfNearExpiry();

    expect(refreshed.toSorted()).toEqual(["rt-plat", "rt-tenant"]);
    expect(await vault.getCredential("codex")).toMatchObject({ refreshToken: "rot-rt-plat" });
    expect(await vault.getCredential("codex", { type: "tenant", id: "t1" })).toMatchObject({
      refreshToken: "rot-rt-tenant",
    });
  });
});
