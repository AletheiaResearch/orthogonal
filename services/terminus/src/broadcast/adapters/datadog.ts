/**
 * Datadog LLM Observability destination (CON-73) — maps the canonical `EmissionRecord`
 * onto Datadog's LLM-Obs span-intake API (`POST /api/intake/llm-obs/v1/trace/spans`),
 * carrying one `llm`-kind span per completed LLM call.
 *
 * Phase-1 metrics-only: the wire payload is built from `record.metrics` ONLY. Raw
 * `record.content` is gated off (CON-43) and never read here.
 *
 * Auth is header-borne: Datadog authenticates via the `DD-API-KEY` header carrying the
 * RAW api key (not a `Bearer` token / not `Authorization`).
 *
 * Datadog-JSON encoding traps this adapter is responsible for getting right:
 *  - `start_ns` / `duration` are nanoseconds as plain JSON *numbers* (the intake API
 *    expects numbers, not int64 strings/BigInt). `ms * 1e6` (~1.75e18) exceeds
 *    Number.MAX_SAFE_INTEGER, so sub-microsecond precision is lost — acceptable for a
 *    span start/duration, and deliberately NOT encoded as a BigInt/string.
 *  - `model_name` / `model_provider` nest under `meta.metadata`, NOT at `meta.model_name`.
 *  - `finish_reason` (when present) is a SIBLING of `meta.kind`/`meta.metadata`, not
 *    inside `meta.metadata`.
 *  - the intake API silently drops a payload over 1 MB; a metrics-only span is ~1 KB, so
 *    a single span never approaches the limit and no chunking is needed.
 */
import type { BroadcastDestination, TestConnectionResult } from "../destination";
import { fetchWithTimeout } from "../probe";
import type { EmissionMetrics, EmissionRecord } from "../record";
import { checkDestinationUrl } from "../ssrf";

/** Datadog default intake site (US1). Exported so the admin validator derives the same URL. */
export const DEFAULT_DATADOG_SITE = "datadoghq.com";

export interface DatadogConfig {
  /** Stable destination id (the D1 row id) — also the sampling salt. */
  id: string;
  /** Per-trace sampling rate in [0,1]. */
  samplingRate: number;
  /** Datadog intake site (e.g. "datadoghq.eu"). Defaults to DEFAULT_DATADOG_SITE. */
  site?: string;
  /** LLM-Obs application name (required) — the `ml_app` attribute. */
  mlApp: string;
  /** Datadog API key — sent RAW in the `DD-API-KEY` header, never a Bearer token. */
  apiKey: string;
}

/** One LLM-Obs span's `meta` block: `kind`, nested `metadata`, optional `finish_reason`. */
interface SpanMeta {
  kind: "llm";
  metadata: { model_name: string; model_provider: string };
  finish_reason?: string;
}

/** One LLM-Obs span (the only span this adapter emits per call). */
interface DatadogSpan {
  name: string;
  span_id: string;
  trace_id: string;
  /** Required by the LLM-Obs span schema; a root span sets the literal string "undefined". */
  parent_id: string;
  start_ns: number;
  duration: number;
  meta: SpanMeta;
  metrics: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    total_cost: number;
  };
}

/** Build the single LLM-Obs span from metrics (no content read). */
function buildSpan(metrics: EmissionMetrics): DatadogSpan {
  const meta: SpanMeta = {
    kind: "llm",
    metadata: { model_name: metrics.model, model_provider: metrics.provider },
  };
  // `finish_reason` sits beside `kind`/`metadata`; omit it (not emit empty) when unknown.
  if (metrics.finishReason !== undefined) {
    meta.finish_reason = metrics.finishReason;
  }
  return {
    name: `chat ${metrics.model}`,
    // `trace_id` is the canonical 32-hex trace id (correlates with the OTLP span); `span_id`
    // is a fresh per-span id. Datadog LLM-Obs accepts string ids — FOLLOW-UP: confirm the
    // exact id format on the first real delivery (some Datadog surfaces prefer decimal-string
    // 64-bit ids); §8 fixes only `trace_id == metrics.traceId`, not the span-id encoding.
    span_id: crypto.randomUUID(),
    trace_id: metrics.traceId,
    // Single root span per call — Datadog's schema requires the literal "undefined" here.
    parent_id: "undefined",
    // Nanoseconds as a JS number — see the encoding note in the module header.
    start_ns: Math.round(metrics.startedAtMs * 1e6),
    duration: Math.round(metrics.latencyMs * 1e6),
    meta,
    metrics: {
      input_tokens: metrics.inputTokens,
      output_tokens: metrics.outputTokens,
      total_tokens: metrics.totalTokens,
      total_cost: metrics.costUsd,
    },
  };
}

export class DatadogDestination implements BroadcastDestination {
  readonly id: string;
  readonly type = "datadog";
  readonly samplingRate: number;

  private readonly site: string;
  private readonly mlApp: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: DatadogConfig, fetchImpl: typeof fetch = fetch) {
    this.id = config.id;
    this.samplingRate = config.samplingRate;
    // `|| DEFAULT` (not `??`) so a present-but-empty `site` falls back to the default — kept
    // identical to the admin validator's derived-URL check so the two never diverge.
    this.site = config.site || DEFAULT_DATADOG_SITE;
    this.mlApp = config.mlApp;
    this.apiKey = config.apiKey;
    this.fetchImpl = fetchImpl;
  }

  /** Derived span-intake URL for the configured site. */
  private get spansUrl(): string {
    return `https://api.${this.site}/api/intake/llm-obs/v1/trace/spans`;
  }

  /** The auth + content-type headers (raw key, never Bearer). */
  private get headers(): Record<string, string> {
    return { "content-type": "application/json", "DD-API-KEY": this.apiKey };
  }

  async send(record: EmissionRecord, signal: AbortSignal): Promise<void> {
    const safe = checkDestinationUrl(this.spansUrl);
    if (!safe.ok) throw new Error(`unsafe datadog site: ${safe.reason}`);
    const { metrics } = record;
    const span = buildSpan(metrics);
    const body = {
      data: {
        type: "span",
        attributes: {
          ml_app: this.mlApp,
          tags: [`model:${metrics.model}`, `provider:${metrics.provider}`],
          spans: [span],
        },
      },
    };
    const res = await this.fetchImpl(this.spansUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal,
      redirect: "manual",
    });
    // Datadog's intake contract is explicit: success is 202 Accepted (empty body). Treat any
    // other status — including a generic 200/201 — as a failed delivery.
    if (res.status !== 202) {
      throw new Error(`datadog llm-obs export failed: HTTP ${res.status}`);
    }
  }

  async testConnection(): Promise<TestConnectionResult> {
    const safe = checkDestinationUrl(this.spansUrl);
    if (!safe.ok) return { ok: false, error: safe.reason };
    // Empty-spans probe: proves reachability + auth without writing a synthetic span.
    const body = { data: { type: "span", attributes: { ml_app: this.mlApp, spans: [] } } };
    try {
      const res = await fetchWithTimeout(this.fetchImpl, this.spansUrl, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
        redirect: "manual",
      });
      // Mirror send()'s contract: only 202 Accepted is a successful probe.
      return { ok: res.status === 202, status: res.status };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
