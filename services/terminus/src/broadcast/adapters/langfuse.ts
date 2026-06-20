/**
 * Langfuse native-batch destination (CON-73) — maps the canonical `EmissionRecord`
 * onto Langfuse's batched ingestion API (`POST /api/public/ingestion`), modeled on the
 * Langfuse `trace-create` + `generation-create` event envelopes the SDK emits.
 *
 * Phase-1 metrics-only: the wire payload is built from `record.metrics` ONLY. Raw
 * `record.content` is gated off (CON-43) and never read here.
 *
 * Auth is header-borne HTTP Basic: `Authorization: Basic base64(publicKey:secretKey)`.
 * The keys come from config; the header is assembled in the constructor.
 *
 * Langfuse ingestion is a partial-success protocol — it MAY answer `207 Multi-Status`
 * when some events succeed and others fail. We treat any 2xx (which includes 207) as a
 * delivered batch; `res.ok` already covers 200–299, so 207 needs no special-casing in
 * `send()`.
 *
 * Event-id discipline this adapter is responsible for getting right:
 *  - each ingestion event carries its own envelope `id` (a fresh UUID) — the trace and
 *    generation envelopes get DISTINCT ids;
 *  - the generation BODY `id` is its own fresh UUID and MUST NOT equal `metrics.traceId`
 *    (the trace's id) — the generation is a child observation, not the trace itself.
 */
import type { BroadcastDestination, TestConnectionResult } from "../destination";
import { fetchWithTimeout } from "../probe";
import type { EmissionMetrics, EmissionRecord } from "../record";
import { checkDestinationUrl } from "../ssrf";

/** Langfuse default ingestion host (cloud). */
const DEFAULT_LANGFUSE_HOST = "https://cloud.langfuse.com";

/** Langfuse batched-ingestion path, appended to the (slash-stripped) host. */
const INGESTION_PATH = "/api/public/ingestion";

export interface LangfuseConfig {
  /** Stable destination id (the D1 row id) — also the sampling salt. */
  id: string;
  /** Per-trace sampling rate in [0,1]. */
  samplingRate: number;
  /** Ingestion host. Defaults to DEFAULT_LANGFUSE_HOST. Trailing slashes are stripped. */
  host?: string;
  /** Langfuse public key — the username half of the Basic credential. */
  publicKey: string;
  /** Langfuse secret key — the password half of the Basic credential. */
  secretKey: string;
}

/** One envelope in the ingestion `batch` (a `*-create` event wrapping a body). */
interface IngestionEvent {
  id: string;
  type: "trace-create" | "generation-create";
  timestamp: string;
  body: Record<string, unknown>;
}

/**
 * Build the two-event ingestion batch (trace + its child generation) from metrics.
 * Both envelopes are timestamped at the span's finish; the generation body carries the
 * span's start/end as its observation window. `metadata.finish_reason` is included only
 * when a finish reason is present, so its omission is intentional rather than an accident
 * of JSON dropping `undefined`.
 */
function buildBatch(metrics: EmissionMetrics): IngestionEvent[] {
  const name = `chat ${metrics.model}`;
  const timestamp = new Date(metrics.finishedAtMs).toISOString();

  const traceBody: Record<string, unknown> = {
    id: metrics.traceId,
    name,
    sessionId: metrics.sessionId,
  };
  if (metrics.tenant) {
    traceBody.userId = metrics.tenant;
  }

  const generationBody: Record<string, unknown> = {
    // A fresh UUID — the generation is a child observation, never the trace itself, so
    // this MUST differ from `metrics.traceId` (the trace's id).
    id: crypto.randomUUID(),
    traceId: metrics.traceId,
    name,
    model: metrics.model,
    startTime: new Date(metrics.startedAtMs).toISOString(),
    endTime: new Date(metrics.finishedAtMs).toISOString(),
    usageDetails: {
      input: metrics.inputTokens,
      output: metrics.outputTokens,
      total: metrics.totalTokens,
    },
    // We carry only a TOTAL cost (the gateway holds no per-direction pricing split).
    costDetails: { total: metrics.costUsd },
  };
  if (metrics.finishReason !== undefined) {
    generationBody.metadata = { finish_reason: metrics.finishReason };
  }

  return [
    { id: crypto.randomUUID(), type: "trace-create", timestamp, body: traceBody },
    { id: crypto.randomUUID(), type: "generation-create", timestamp, body: generationBody },
  ];
}

export class LangfuseDestination implements BroadcastDestination {
  readonly id: string;
  readonly type = "langfuse";
  readonly samplingRate: number;

  private readonly host: string;
  private readonly authorization: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: LangfuseConfig, fetchImpl: typeof fetch = fetch) {
    this.id = config.id;
    this.samplingRate = config.samplingRate;
    // Strip ALL trailing slashes so a `…/` host isn't double-pathed into `…//api/...`.
    this.host = (config.host ?? DEFAULT_LANGFUSE_HOST).replace(/\/+$/, "");
    this.authorization = "Basic " + btoa(`${config.publicKey}:${config.secretKey}`);
    this.fetchImpl = fetchImpl;
  }

  private get ingestionUrl(): string {
    return `${this.host}${INGESTION_PATH}`;
  }

  private get headers(): Record<string, string> {
    return { "content-type": "application/json", authorization: this.authorization };
  }

  async send(record: EmissionRecord, signal: AbortSignal): Promise<void> {
    const safe = checkDestinationUrl(this.ingestionUrl);
    if (!safe.ok) throw new Error(`unsafe langfuse host: ${safe.reason}`);
    const body = { batch: buildBatch(record.metrics) };
    const res = await this.fetchImpl(this.ingestionUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal,
      redirect: "manual",
    });
    // `res.ok` is 200–299, which includes Langfuse's 207 Multi-Status.
    if (!res.ok) {
      throw new Error(`langfuse ingestion failed: HTTP ${res.status}`);
    }
  }

  async testConnection(): Promise<TestConnectionResult> {
    const safe = checkDestinationUrl(this.ingestionUrl);
    if (!safe.ok) return { ok: false, error: safe.reason };
    try {
      // Probe with an EMPTY batch — proves reachability + auth without writing any
      // synthetic trace/generation into the customer's project.
      const res = await fetchWithTimeout(this.fetchImpl, this.ingestionUrl, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ batch: [] }),
        redirect: "manual",
      });
      return { ok: res.ok || res.status === 207, status: res.status };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
