import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";

import { broadcastDestinations } from "../../src/db/schema";
import type { Env } from "../../src/env";
import { buildAdminApp } from "../../src/routes/admin";

const db = drizzle(env.DB);
const ADMIN = "admin-secret-please-rotate";
const adminEnv = {
  DB: env.DB,
  CREDENTIALS_ENCRYPTION_KEY: env.CREDENTIALS_ENCRYPTION_KEY,
  TERMINUS_ADMIN_SECRET: ADMIN,
} as unknown as Env;

afterEach(async () => {
  await db.delete(broadcastDestinations);
});

function req(path: string, init: RequestInit & { auth?: string } = {}): Promise<Response> {
  const { auth = ADMIN, headers, ...rest } = init;
  return buildAdminApp().request(
    path,
    {
      ...rest,
      headers: {
        Authorization: `Bearer ${auth}`,
        "content-type": "application/json",
        ...(headers as Record<string, string> | undefined),
      },
    },
    adminEnv
  );
}

describe("admin broadcast destinations API (CON-73)", () => {
  it("rejects missing or wrong bearer with 401", async () => {
    expect((await buildAdminApp().request("/destinations", {}, adminEnv)).status).toBe(401);
    expect((await req("/destinations", { auth: "nope" })).status).toBe(401);
  });

  it("creates, lists (never leaking the secret), disables, and deletes a destination", async () => {
    const create = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "posthog",
        config: { host: "https://us.i.posthog.com" },
        secret: { projectApiKey: "phc_secret" },
        samplingRate: 0.5,
        label: "a",
      }),
    });
    expect(create.status).toBe(201);
    const { id } = (await create.json()) as { id: string };
    expect(id).toBeTruthy();

    const list = await req("/destinations");
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      destinations: {
        id: string;
        type: string;
        label: string;
        enabled: boolean;
        samplingRate: number;
        config: unknown;
      }[];
    };
    expect(body.destinations).toHaveLength(1);
    expect(body.destinations[0]).toMatchObject({
      type: "posthog",
      label: "a",
      enabled: true,
      samplingRate: 0.5,
    });
    // `config` comes back as the parsed object that was POSTed, not a JSON string.
    expect(body.destinations[0].config).toEqual({ host: "https://us.i.posthog.com" });
    expect(JSON.stringify(body)).not.toContain("phc_secret");

    const patch = await req(`/destinations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
    });
    expect(patch.status).toBe(204);

    expect((await req(`/destinations/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await req(`/destinations/${id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("rejects a create missing type/config/secret with 400", async () => {
    expect(
      (await req("/destinations", { method: "POST", body: JSON.stringify({ type: "otlp" }) }))
        .status
    ).toBe(400);
    expect(await db.select().from(broadcastDestinations)).toEqual([]);
  });

  it("rejects an unsupported destination type with 400", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({ type: "mystery", config: {}, secret: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a secret-looking header in plaintext config with 400 (no write)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "otlp",
        config: { endpoint: "https://c.example.com", headers: { authorization: "Bearer leak" } },
        secret: {},
      }),
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(broadcastDestinations)).toEqual([]);
  });

  it("rejects an unsafe webhook url with 400 (SSRF guard at create)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({ type: "webhook", config: { url: "https://10.0.0.1/x" }, secret: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a samplingRate outside [0,1] with 400", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "otlp",
        config: { endpoint: "https://c.example.com" },
        secret: {},
        samplingRate: 2,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 on a duplicate type+label", async () => {
    const make = () =>
      req("/destinations", {
        method: "POST",
        body: JSON.stringify({
          type: "otlp",
          config: { endpoint: "https://c.example.com" },
          secret: {},
          label: "dup",
        }),
      });
    expect((await make()).status).toBe(201);
    expect((await make()).status).toBe(409);
  });

  it("404s test-connection for a missing destination", async () => {
    expect((await req("/destinations/missing/test", { method: "POST" })).status).toBe(404);
  });

  it("rejects an unsafe OTLP endpoint with 400 (SSRF at create)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "otlp",
        config: { endpoint: "https://169.254.169.254/v1/traces" },
        secret: {},
      }),
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(broadcastDestinations)).toEqual([]);
  });

  it("rejects an unsafe PostHog host with 400 (SSRF at create)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "posthog",
        config: { host: "https://10.0.0.1" },
        secret: { projectApiKey: "phc_x" },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a secret-looking field anywhere in plaintext config with 400 (no write)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "posthog",
        config: { host: "https://us.i.posthog.com", projectApiKey: "phc_leak" },
        secret: { projectApiKey: "phc_x" },
      }),
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(broadcastDestinations)).toEqual([]);
  });

  it("rejects a PostHog destination created without a project key (400, no write)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "posthog",
        config: { host: "https://us.i.posthog.com" },
        secret: {},
      }),
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(broadcastDestinations)).toEqual([]);
  });

  it("PATCH updates samplingRate + rotates the secret (encrypted, never listed)", async () => {
    const create = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "posthog",
        config: { host: "https://us.i.posthog.com" },
        secret: { projectApiKey: "phc_old" },
      }),
    });
    const { id } = (await create.json()) as { id: string };

    const patch = await req(`/destinations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ samplingRate: 0.2, secret: { projectApiKey: "phc_new" } }),
    });
    expect(patch.status).toBe(204);

    const list = await req("/destinations");
    const body = (await list.json()) as { destinations: { samplingRate: number }[] };
    expect(body.destinations[0].samplingRate).toBe(0.2);
    expect(JSON.stringify(body)).not.toContain("phc_new");
    const [rotated] = await db.select().from(broadcastDestinations);
    expect(rotated.secretEncrypted).not.toContain("phc_new");
  });

  it("PATCH rejects an unsafe URL in the updated config (400)", async () => {
    const create = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "webhook",
        config: { url: "https://hooks.example.com/x" },
        secret: {},
      }),
    });
    const { id } = (await create.json()) as { id: string };
    const patch = await req(`/destinations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ config: { url: "https://10.0.0.1/x" } }),
    });
    expect(patch.status).toBe(400);
  });

  it("PATCH rejects an empty patch (400)", async () => {
    const create = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "webhook",
        config: { url: "https://hooks.example.com/x" },
        secret: {},
      }),
    });
    const { id } = (await create.json()) as { id: string };
    const patch = await req(`/destinations/${id}`, { method: "PATCH", body: JSON.stringify({}) });
    expect(patch.status).toBe(400);
  });

  it("PATCH merges config (a partial update can't drop the required endpoint)", async () => {
    const create = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "otlp",
        config: { endpoint: "https://collector.example.com" },
        secret: {},
      }),
    });
    const { id } = (await create.json()) as { id: string };

    // Patch only serviceName — the endpoint must survive (merge, not wholesale overwrite).
    const patch = await req(`/destinations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ config: { serviceName: "gateway" } }),
    });
    expect(patch.status).toBe(204);

    const [row] = await db.select().from(broadcastDestinations);
    const config = JSON.parse(row.config) as Record<string, unknown>;
    expect(config.endpoint).toBe("https://collector.example.com");
    expect(config.serviceName).toBe("gateway");
  });

  it("PATCH rejects rotating a PostHog secret to an empty project key (400)", async () => {
    const create = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "posthog",
        config: { host: "https://us.i.posthog.com" },
        secret: { projectApiKey: "phc_old" },
      }),
    });
    const { id } = (await create.json()) as { id: string };
    const [before] = await db.select().from(broadcastDestinations);

    const patch = await req(`/destinations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ secret: { projectApiKey: "" } }),
    });
    expect(patch.status).toBe(400);
    // The rejected PATCH must have left the encrypted secret byte-for-byte untouched.
    const [after] = await db.select().from(broadcastDestinations);
    expect(after.secretEncrypted).toBe(before.secretEncrypted);
  });

  it("404s a PATCH config/secret on a missing destination", async () => {
    const patch = await req("/destinations/no-such-id", {
      method: "PATCH",
      body: JSON.stringify({ config: { url: "https://hooks.example.com/y" } }),
    });
    expect(patch.status).toBe(404);
  });

  // ---- CON-79 Phase-2 destination types (s3 / langsmith / langfuse / datadog) ----

  it("creates each Phase-2 destination type (201)", async () => {
    const cases: Array<{ type: string; config: unknown; secret: unknown }> = [
      {
        type: "s3",
        config: {
          endpoint: "https://s3.us-east-1.amazonaws.com",
          bucket: "traces",
          region: "us-east-1",
        },
        secret: { accessKeyId: "AKIAEXAMPLE", secretAccessKey: "shh" },
      },
      { type: "langsmith", config: {}, secret: { apiKey: "lsv2_pk_x" } },
      { type: "langfuse", config: {}, secret: { publicKey: "pk-lf", secretKey: "sk-lf" } },
      { type: "datadog", config: { mlApp: "orto" }, secret: { apiKey: "dd_key" } },
    ];
    for (const body of cases) {
      const res = await req("/destinations", { method: "POST", body: JSON.stringify(body) });
      expect(res.status, `${body.type} should create`).toBe(201);
    }
    // None of the secret material leaks through the list projection.
    expect(JSON.stringify(await (await req("/destinations")).json())).not.toMatch(
      /shh|lsv2_pk_x|sk-lf|dd_key/
    );
  });

  it("rejects an unsafe S3 endpoint with 400 (SSRF at create, no write)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "s3",
        config: { endpoint: "https://169.254.169.254", bucket: "b", region: "us-east-1" },
        secret: { accessKeyId: "AKIA", secretAccessKey: "s" },
      }),
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(broadcastDestinations)).toEqual([]);
  });

  it("rejects S3 missing required config (region) with 400", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "s3",
        config: { endpoint: "https://s3.us-east-1.amazonaws.com", bucket: "b" },
        secret: { accessKeyId: "AKIA", secretAccessKey: "s" },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects langsmith/langfuse/datadog missing their required secret with 400", async () => {
    const cases: Array<{ type: string; config: unknown; secret: unknown }> = [
      { type: "langsmith", config: {}, secret: {} },
      { type: "langfuse", config: {}, secret: { publicKey: "pk-lf" } }, // missing secretKey
      { type: "datadog", config: { mlApp: "orto" }, secret: {} }, // missing apiKey
    ];
    for (const body of cases) {
      const res = await req("/destinations", { method: "POST", body: JSON.stringify(body) });
      expect(res.status, `${body.type} should reject`).toBe(400);
    }
  });

  it("rejects an unsafe langsmith endpoint / langfuse host with 400 (SSRF on optional URLs)", async () => {
    const langsmith = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "langsmith",
        config: { endpoint: "https://10.0.0.1" },
        secret: { apiKey: "lsv2_pk_x" },
      }),
    });
    expect(langsmith.status).toBe(400);
    const langfuse = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "langfuse",
        config: { host: "https://169.254.169.254" },
        secret: { publicKey: "pk-lf", secretKey: "sk-lf" },
      }),
    });
    expect(langfuse.status).toBe(400);
    expect(await db.select().from(broadcastDestinations)).toEqual([]);
  });

  it("PATCH re-pointing a langfuse host to a private IP is rejected (merge-path SSRF re-check)", async () => {
    const create = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "langfuse",
        config: { host: "https://cloud.langfuse.com" },
        secret: { publicKey: "pk-lf", secretKey: "sk-lf" },
      }),
    });
    const { id } = (await create.json()) as { id: string };
    const patch = await req(`/destinations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ config: { host: "https://10.0.0.1" } }),
    });
    expect(patch.status).toBe(400);
  });

  it("rejects datadog missing required mlApp config with 400", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({ type: "datadog", config: {}, secret: { apiKey: "dd_key" } }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts an empty datadog site by falling back to the default (no inert row)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "datadog",
        config: { site: "", mlApp: "orto" },
        secret: { apiKey: "dd_key" },
      }),
    });
    // `site: ""` falls back to the default site (|| not ??) — a valid, non-inert destination.
    expect(res.status).toBe(201);
  });

  it("rejects an unsafe Datadog site (SSRF on the derived URL) with 400", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "datadog",
        config: { site: "169.254.169.254", mlApp: "orto" },
        secret: { apiKey: "dd_key" },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH on an s3 row can't drop a required field (merge re-validates)", async () => {
    const create = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "s3",
        config: {
          endpoint: "https://s3.us-east-1.amazonaws.com",
          bucket: "traces",
          region: "us-east-1",
        },
        secret: { accessKeyId: "AKIA", secretAccessKey: "s" },
      }),
    });
    const { id } = (await create.json()) as { id: string };
    // Patch only a prefix — endpoint/bucket/region survive the merge, so it's accepted.
    const ok = await req(`/destinations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ config: { prefix: "team-a/" } }),
    });
    expect(ok.status).toBe(204);
    // Rotating the secret to an empty access key id is rejected (would persist-but-inert).
    const bad = await req(`/destinations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ secret: { accessKeyId: "" } }),
    });
    expect(bad.status).toBe(400);
  });
});
