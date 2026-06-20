/**
 * Object-storage broadcast destination (CON-73) — writes one JSON object per LLM call to
 * an S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, …) using path-style addressing
 * and AWS Signature Version 4 (the de-facto auth for every S3-compatible API).
 *
 * Phase-1 metrics-only: the stored object is `{ metrics }` built from `record.metrics`
 * ONLY. Raw `record.content` is gated off (CON-43) and never read here.
 *
 * Partitioning is EVENT-TIME, not write-time: the key embeds `YYYY/MM/DD` derived from
 * `metrics.startedAtMs` (UTC), so the same record always lands at the same key (idempotent
 * re-delivery) and a day's traces colocate regardless of when they were flushed. The
 * injected `now` clock is used ONLY for the SigV4 `x-amz-date`, keeping signing tests
 * deterministic without touching the (event-time) key.
 *
 * Auth material (`accessKeyId` / `secretAccessKey`) arrives merged into the config by the
 * registry, which splits the non-secret D1 config from the decrypted secret. SigV4 signing
 * lives in `../sigv4` (a self-contained `crypto.subtle` signer — zero AWS SDK).
 */
import type { BroadcastDestination, TestConnectionResult } from "../destination";
import { fetchWithTimeout } from "../probe";
import type { EmissionMetrics, EmissionRecord } from "../record";
import { signS3Request } from "../sigv4";
import { checkDestinationUrl } from "../ssrf";

export interface S3Config {
  /** Stable destination id (the D1 row id) — also the sampling salt. */
  id: string;
  /** Per-trace sampling rate in [0,1]. */
  samplingRate: number;
  /** S3-compatible endpoint base (e.g. `https://s3.us-east-1.amazonaws.com`). */
  endpoint: string;
  /** Target bucket — addressed path-style (`{endpoint}/{bucket}/{key}`). */
  bucket: string;
  /** Signing region (the SigV4 credential-scope region). */
  region: string;
  /** Gzip the object body and set `content-encoding: gzip` when true. */
  gzip?: boolean;
  /** Optional key prefix, prepended verbatim ahead of the `traces/…` partition path. */
  prefix?: string;
  /** SigV4 access key id (merged in from the decrypted secret by the registry). */
  accessKeyId: string;
  /** SigV4 secret access key (merged in from the decrypted secret by the registry). */
  secretAccessKey: string;
}

const CONTENT_TYPE_JSON = "application/json";

/** Zero-pad a number to two digits for `MM`/`DD` partition components. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Event-time object key: `{prefix?}traces/{tenant}/{YYYY}/{MM}/{DD}/{sessionId}/{traceId}.json`.
 * `tenant` falls back to `_` (null during single-tenant rollout); the date is the UTC
 * calendar day of `startedAtMs`, so the key is fully determined by the record.
 */
function objectKey(metrics: EmissionMetrics, prefix: string): string {
  const tenant = metrics.tenant || "_";
  const d = new Date(metrics.startedAtMs);
  const yyyy = d.getUTCFullYear();
  const mm = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  return `${prefix}traces/${tenant}/${yyyy}/${mm}/${dd}/${metrics.sessionId}/${metrics.traceId}.json`;
}

/** Gzip `bytes` via the platform `CompressionStream` (Workers-native, no zlib dependency). */
async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const compressed = new Response(bytes).body!.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

export class S3Destination implements BroadcastDestination {
  readonly id: string;
  readonly type = "s3";
  readonly samplingRate: number;

  private readonly config: S3Config;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(
    config: S3Config,
    fetchImpl: typeof fetch = fetch,
    now: () => number = () => Date.now()
  ) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.id = config.id;
    this.samplingRate = config.samplingRate;
  }

  /**
   * Serialize `{ metrics }` (optionally gzipped), sign a path-style PUT to the event-time
   * key, and store it. Rejects on an unsafe endpoint (SSRF guard), a non-2xx response, or
   * a network error so the dispatcher can log it via `onError` for delivery observability.
   */
  async send(record: EmissionRecord, signal: AbortSignal): Promise<void> {
    const url = `${this.config.endpoint}/${this.config.bucket}/${objectKey(
      record.metrics,
      this.config.prefix ?? ""
    )}`;
    const check = checkDestinationUrl(url);
    if (!check.ok) {
      throw new Error(`unsafe s3 endpoint: ${check.reason}`);
    }

    const json = new TextEncoder().encode(JSON.stringify({ metrics: record.metrics }));
    const extraHeaders: Record<string, string> = { "content-type": CONTENT_TYPE_JSON };
    let body = json;
    if (this.config.gzip) {
      body = await gzip(json);
      extraHeaders["content-encoding"] = "gzip";
    }

    const headers = await signS3Request({
      method: "PUT",
      url,
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      body,
      extraHeaders,
      nowMs: this.now(),
    });

    const response = await this.fetchImpl(url, {
      method: "PUT",
      headers,
      body,
      signal,
      redirect: "manual",
    });
    if (!response.ok) {
      throw new Error(`s3 put to ${this.config.bucket} failed: HTTP ${response.status}`);
    }
  }

  /**
   * Minimal reachability+auth probe: a signed ListObjectsV2 with `max-keys=0`, which reads
   * nothing and writes nothing (NEVER a probe PUT). A 403 means the bucket is reachable but
   * the credentials/policy were rejected — surfaced as `{ ok:false, status:403 }` so the
   * operator sees the cause. Never throws.
   */
  async testConnection(): Promise<TestConnectionResult> {
    const url = `${this.config.endpoint}/${this.config.bucket}?list-type=2&max-keys=0`;
    const check = checkDestinationUrl(url);
    if (!check.ok) {
      return { ok: false, error: check.reason };
    }

    try {
      const headers = await signS3Request({
        method: "GET",
        url,
        region: this.config.region,
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        nowMs: this.now(),
      });
      const response = await fetchWithTimeout(this.fetchImpl, url, {
        method: "GET",
        headers,
        redirect: "manual",
      });
      return { ok: response.ok, status: response.status };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
