/**
 * Destination registry (CON-73) — maps a decrypted `ResolvedDestinationRow` to a
 * concrete `BroadcastDestination` adapter, and wires the runtime dispatcher.
 *
 * This is the one place that knows the per-type split between the non-secret `config`
 * (endpoint/host/url + non-secret headers) and the decrypted `secret` (auth material:
 * the PostHog project key, OTLP/webhook auth headers, the webhook HMAC key). Auth
 * material is taken ONLY from `secret`; `config` never carries a credential. Secret
 * headers win over config headers on a key clash.
 *
 * An unknown type or a row missing its required field yields `null` (skipped + logged),
 * so a single malformed destination can never break the fan-out for the others.
 */
import { drizzle } from "drizzle-orm/d1";

import type { Env } from "../env";
import { OtlpDestination } from "./adapters/otlp";
import { PosthogDestination } from "./adapters/posthog";
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
          headers: { ...asHeaders(config.headers), ...asHeaders(secret.headers) },
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
          headers: { ...asHeaders(config.headers), ...asHeaders(secret.headers) },
        },
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
export function buildBroadcastDispatcher(env: Env): BroadcastDispatcher {
  const store = new DestinationStore(drizzle(env.DB), env.CREDENTIALS_ENCRYPTION_KEY);
  return new CompositeDispatcher({
    resolve: async () => {
      const rows = await store.listEnabled();
      return rows
        .map((row) => buildDestination(row))
        .filter((d): d is BroadcastDestination => d !== null);
    },
  });
}
