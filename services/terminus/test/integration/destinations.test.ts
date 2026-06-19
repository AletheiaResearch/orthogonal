import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";

import { DestinationStore } from "../../src/broadcast/store";
import { broadcastDestinations } from "../../src/db/schema";

const db = drizzle(env.DB);
const KEY = env.CREDENTIALS_ENCRYPTION_KEY;
const store = () => new DestinationStore(db, KEY);

afterEach(async () => {
  await db.delete(broadcastDestinations);
});

describe("DestinationStore", () => {
  it("creates, lists without the secret, resolves decrypted, toggles, deletes", async () => {
    const { id } = await store().create({
      type: "posthog",
      config: { host: "https://us.i.posthog.com" },
      secret: { projectApiKey: "phc_secret" },
      samplingRate: 0.5,
      label: "a",
    });
    expect(id).toBeTruthy();

    const pub = await store().listForOwner();
    expect(pub).toHaveLength(1);
    expect(pub[0]).toMatchObject({ type: "posthog", label: "a", enabled: true, samplingRate: 0.5 });
    // `config` is returned as a parsed OBJECT, not the raw JSON string.
    expect(pub[0].config).toEqual({ host: "https://us.i.posthog.com" });
    // The public projection must never carry the secret.
    expect(JSON.stringify(pub)).not.toContain("phc_secret");

    const resolved = await store().listEnabled();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].config).toEqual({ host: "https://us.i.posthog.com" });
    expect(resolved[0].secret).toEqual({ projectApiKey: "phc_secret" });
    expect(resolved[0].samplingRate).toBe(0.5);
    expect(resolved[0].type).toBe("posthog");

    expect(await store().setEnabled(id, false)).toBe(true);
    expect(await store().listEnabled()).toHaveLength(0); // disabled is excluded from the fan-out set
    expect(await store().listForOwner()).toHaveLength(1); // still visible in admin list

    expect(await store().delete(id)).toBe(true);
    expect(await store().delete(id)).toBe(false); // already gone
  });

  it("resolves a single decrypted destination by id (for test-connection)", async () => {
    const { id } = await store().create({
      type: "webhook",
      config: { url: "https://hooks.example.com/x" },
      secret: { hmacKey: "k" },
    });
    const resolved = await store().getDecrypted(id);
    expect(resolved?.config).toEqual({ url: "https://hooks.example.com/x" });
    expect(resolved?.secret).toEqual({ hmacKey: "k" });
    expect(await store().getDecrypted("missing")).toBeNull();
  });

  it("rejects a duplicate (owner, type, label)", async () => {
    await store().create({ type: "otlp", config: {}, secret: {}, label: "dup" });
    await expect(
      store().create({ type: "otlp", config: {}, secret: {}, label: "dup" })
    ).rejects.toThrow();
  });

  it("encrypts the secret at rest; config stays plaintext", async () => {
    await store().create({
      type: "webhook",
      config: { url: "https://x.example.com" },
      secret: { hmacKey: "topsecret" },
    });
    const [row] = await db.select().from(broadcastDestinations);
    expect(row.secretEncrypted).not.toContain("topsecret");
    expect(row.config).toContain("x.example.com");
  });

  it("listEnabled skips a row that fails to decrypt and keeps the valid ones", async () => {
    await store().create({
      type: "posthog",
      config: { host: "https://us.i.posthog.com" },
      secret: { projectApiKey: "phc_ok" },
      label: "good",
    });
    // A deliberately-corrupt row (invalid ciphertext) — must not drop the healthy one.
    await db.insert(broadcastDestinations).values({
      id: "corrupt",
      ownerType: "platform",
      ownerId: "",
      type: "posthog",
      enabled: true,
      samplingRate: 1,
      config: "{}",
      secretEncrypted: "not-valid-ciphertext",
      label: "bad",
      createdAt: 0,
      updatedAt: 0,
    });

    const resolved = await store().listEnabled();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].secret).toEqual({ projectApiKey: "phc_ok" });
  });
});
