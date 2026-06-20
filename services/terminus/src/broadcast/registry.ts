/**
 * Destination registry (CON-73) — maps a decrypted `ResolvedDestinationRow` to a
 * concrete `BroadcastDestination` adapter, and wires the runtime dispatcher.
 *
 * This is the one place that knows the per-type split between the non-secret `config`
 * (endpoint/host/url) and the decrypted `secret` (ALL auth material: the PostHog project
 * key, the OTLP/webhook request headers, the webhook HMAC key). Headers — auth or not —
 * come ONLY from `secret.headers`; `config` never carries a credential or a header (the
 * admin layer rejects `config.headers` outright).
 *
 * An unknown type or a row missing its required field yields `null` (skipped + logged),
 * so a single malformed destination can never break the fan-out for the others.
 */
import { drizzle } from "drizzle-orm/d1";

import type { BroadcastDestinationRow } from "../db/schema";
import { PLATFORM_OWNER } from "../db/vault";
import type { Env } from "../env";
import { DatadogDestination } from "./adapters/datadog";
import { LangfuseDestination } from "./adapters/langfuse";
import { LangsmithDestination } from "./adapters/langsmith";
import { OtlpDestination } from "./adapters/otlp";
import { PosthogDestination } from "./adapters/posthog";
import { S3Destination } from "./adapters/s3";
import { WebhookDestination } from "./adapters/webhook";
import type { BroadcastDestination } from "./destination";
import { type BroadcastDispatcher, CompositeDispatcher } from "./dispatcher";
import { DestinationStore, type ResolvedDestinationRow } from "./store";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asHeaders(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(asRecord(value))) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * Build a concrete adapter from a decrypted row, or `null` if the type is unknown or a
 * required field is absent. `fetchImpl` is injectable for tests; production passes none
 * (the adapters default to global `fetch`).
 */
export function buildDestination(
  row: ResolvedDestinationRow,
  fetchImpl?: typeof fetch
): BroadcastDestination | null {
  const config = asRecord(row.config);
  const secret = asRecord(row.secret);
  const base = { id: row.id, samplingRate: row.samplingRate };

  switch (row.type) {
    case "otlp": {
      const endpoint = asString(config.endpoint);
      if (!endpoint) return null;
      return new OtlpDestination(
        {
          ...base,
          endpoint,
          serviceName: asString(config.serviceName),
          headers: asHeaders(secret.headers),
        },
        fetchImpl
      );
    }
    case "posthog": {
      const projectApiKey = asString(secret.projectApiKey);
      if (!projectApiKey) return null;
      return new PosthogDestination(
        { ...base, host: asString(config.host), projectApiKey },
        fetchImpl
      );
    }
    case "webhook": {
      const url = asString(config.url);
      if (!url) return null;
      return new WebhookDestination(
        {
          ...base,
          url,
          hmacKey: asString(secret.hmacKey),
          headers: asHeaders(secret.headers),
        },
        fetchImpl
      );
    }
    case "s3": {
      const endpoint = asString(config.endpoint);
      const bucket = asString(config.bucket);
      const region = asString(config.region);
      const accessKeyId = asString(secret.accessKeyId);
      const secretAccessKey = asString(secret.secretAccessKey);
      if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey) return null;
      return new S3Destination(
        {
          ...base,
          endpoint,
          bucket,
          region,
          gzip: asBool(config.gzip),
          prefix: asString(config.prefix),
          accessKeyId,
          secretAccessKey,
        },
        fetchImpl
      );
    }
    case "langsmith": {
      const apiKey = asString(secret.apiKey);
      if (!apiKey) return null;
      return new LangsmithDestination(
        {
          ...base,
          endpoint: asString(config.endpoint),
          projectName: asString(config.projectName),
          apiKey,
        },
        fetchImpl
      );
    }
    case "langfuse": {
      const publicKey = asString(secret.publicKey);
      const secretKey = asString(secret.secretKey);
      if (!publicKey || !secretKey) return null;
      return new LangfuseDestination(
        { ...base, host: asString(config.host), publicKey, secretKey },
        fetchImpl
      );
    }
    case "datadog": {
      const mlApp = asString(config.mlApp);
      const apiKey = asString(secret.apiKey);
      if (!mlApp || !apiKey) return null;
      return new DatadogDestination(
        { ...base, site: asString(config.site), mlApp, apiKey },
        fetchImpl
      );
    }
    default:
      return null;
  }
}

/**
 * Build the runtime dispatcher: resolve the enabled destinations from D1 (decrypting
 * per call, off the response path) and map each to its adapter. A row that fails to
 * map is skipped, not fatal.
 */
/**
 * Resolve enabled rows to adapters, ISOLATING per-row failures: a row whose decryption
 * throws (corrupted ciphertext, a rotated/mismatched key, bad AAD) or whose type/fields
 * are invalid is skipped + logged, never aborting the others. Without this, a single bad
 * row would reject the whole resolve and silence every healthy destination.
 */
export async function resolveEnabled(
  rows: BroadcastDestinationRow[],
  decryptRow: (row: BroadcastDestinationRow) => Promise<ResolvedDestinationRow>
): Promise<BroadcastDestination[]> {
  const built = await Promise.all(
    rows.map(async (row) => {
      try {
        return buildDestination(await decryptRow(row));
      } catch (e) {
        console.error(
          JSON.stringify({
            event: "terminus.broadcast.resolve_row_error",
            destinationId: row.id,
            message: e instanceof Error ? e.message : String(e),
          })
        );
        return null;
      }
    })
  );
  return built.filter((d): d is BroadcastDestination => d !== null);
}

/** Short per-isolate TTL for the enabled-rows cache (CON-73). */
const ENABLED_ROWS_TTL_MS = 30_000;
const enabledRowsCache = new Map<string, { atMs: number; rows: BroadcastDestinationRow[] }>();

export function buildBroadcastDispatcher(env: Env): BroadcastDispatcher {
  const store = new DestinationStore(drizzle(env.DB), env.CREDENTIALS_ENCRYPTION_KEY);
  return new CompositeDispatcher({
    resolve: async () => {
      // Cache the ENCRYPTED enabled rows per isolate for a short TTL, so a zero- or
      // low-config deployment does not do a D1 read on every LLM call (this worker
      // fronts all traffic). Config edits propagate within ENABLED_ROWS_TTL_MS. No
      // decrypted secret is cached — decryption happens per call below, transiently.
      const key = `${PLATFORM_OWNER.type}:${PLATFORM_OWNER.id}`;
      const nowMs = Date.now();
      let entry = enabledRowsCache.get(key);
      if (!entry || nowMs - entry.atMs > ENABLED_ROWS_TTL_MS) {
        entry = { atMs: nowMs, rows: await store.listEnabledRaw() };
        enabledRowsCache.set(key, entry);
      }
      if (entry.rows.length === 0) return [];
      return resolveEnabled(entry.rows, (row) => store.decryptRow(row));
    },
  });
}
