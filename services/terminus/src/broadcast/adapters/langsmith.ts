/**
 * LangSmith broadcast destination (CON-73) — maps the canonical `EmissionRecord` onto
 * LangSmith's run-ingestion API (`POST /api/v1/runs/batch`), modeled on the LangSmith
 * tracing reference (a standalone `llm` run per LLM call).
 *
 * Phase-1 metrics-only: the wire payload is built from `record.metrics` ONLY. Raw
 * `record.content` is gated off (CON-43) and never read here — so the run carries no
 * `inputs` and only a metrics-derived `outputs.finish_reason`.
 *
 * Auth is header-borne: LangSmith authenticates via the `x-api-key` header, NOT an
 * `Authorization`/`Bearer` header.
 */
import type { BroadcastDestination, TestConnectionResult } from "../destination";
import { fetchWithTimeout } from "../probe";
import type { EmissionMetrics, EmissionRecord } from "../record";
import { checkDestinationUrl } from "../ssrf";

/** LangSmith default ingestion endpoint (US cloud). */
const DEFAULT_LANGSMITH_ENDPOINT = "https://api.smith.langchain.com";

export interface LangsmithConfig {
  /** Stable destination id (the D1 row id) — also the sampling salt. */
  id: string;
  /** Per-trace sampling rate in [0,1]. */
  samplingRate: number;
  /** Ingestion endpoint base. Defaults to DEFAULT_LANGSMITH_ENDPOINT. */
  endpoint?: string;
  /** Optional LangSmith project (tracing session) name → the run's `session_name`. */
  projectName?: string;
  /** LangSmith API key — sent in the `x-api-key` header, never `Authorization`. */
  apiKey: string;
}

/** A standalone LangSmith run (the element of the `post` batch). */
interface LangsmithRun {
  id: string;
  trace_id: string;
  dotted_order: string;
  name: string;
  run_type: "llm";
  start_time: string;
  end_time: string;
  /** LangSmith's `RunCreate` schema REQUIRES `inputs`; metrics-only → an empty object (no content). */
  inputs: Record<string, never>;
  extra: { metadata: Record<string, unknown> };
  session_name?: string;
  outputs?: { finish_reason: string };
}

/**
 * Strip ALL trailing slashes off the endpoint, so a `…/` base isn't double-slashed into
 * the run path (mirror otlp's normalize, minus the signal-path append).
 */
function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

/**
 * `dotted_order` timestamp: the run start as UTC `strftime("%Y%m%dT%H%M%S%fZ")`, i.e.
 * "YYYYMMDDTHHMMSSmmm000Z". `%f` is 6-digit microseconds; we only carry ms, so the three
 * ms digits lead and we pad the remaining micros with "000". Derived from `toISOString()`
 * to avoid hand-rolling UTC component padding.
 */
function dottedOrderTimestamp(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.(\d{3})Z$/, "$1000Z");
}

/** The metrics-derived `extra.metadata` for one run (NO content). */
function buildMetadata(metrics: EmissionMetrics): Record<string, unknown> {
  return {
    // ls_model_name + ls_provider are REQUIRED for LangSmith's model/cost resolution.
    ls_model_name: metrics.model,
    ls_provider: metrics.provider,
    session_id: metrics.sessionId,
    // The canonical trace id (the run's own id is a random UUID), so an operator can correlate
    // this run with the same call's S3 object / Datadog span / Langfuse trace.
    terminus_trace_id: metrics.traceId,
    // Our gateway-computed cost has no native LangSmith field, so it rides in metadata.
    terminus_cost_usd: metrics.costUsd,
    input_tokens: metrics.inputTokens,
    output_tokens: metrics.outputTokens,
    total_tokens: metrics.totalTokens,
  };
}

export class LangsmithDestination implements BroadcastDestination {
  readonly id: string;
  readonly type = "langsmith";
  readonly samplingRate: number;

  private readonly endpoint: string;
  private readonly projectName?: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: LangsmithConfig, fetchImpl: typeof fetch = fetch) {
    this.id = config.id;
    this.samplingRate = config.samplingRate;
    this.endpoint = normalizeEndpoint(config.endpoint ?? DEFAULT_LANGSMITH_ENDPOINT);
    this.projectName = config.projectName;
    this.apiKey = config.apiKey;
    this.fetchImpl = fetchImpl;
  }

  private get batchUrl(): string {
    return `${this.endpoint}/api/v1/runs/batch`;
  }

  private get headers(): Record<string, string> {
    return { "content-type": "application/json", "x-api-key": this.apiKey };
  }

  async send(record: EmissionRecord, signal: AbortSignal): Promise<void> {
    const safe = checkDestinationUrl(this.batchUrl);
    if (!safe.ok) throw new Error(`unsafe langsmith endpoint: ${safe.reason}`);
    const run = this.buildRun(record.metrics);
    const res = await this.fetchImpl(this.batchUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ post: [run] }),
      signal,
      redirect: "manual",
    });
    if (!res.ok) {
      throw new Error(`langsmith batch ingest failed: HTTP ${res.status}`);
    }
  }

  async testConnection(): Promise<TestConnectionResult> {
    const safe = checkDestinationUrl(this.batchUrl);
    if (!safe.ok) return { ok: false, error: safe.reason };
    try {
      const res = await fetchWithTimeout(this.fetchImpl, this.batchUrl, {
        method: "POST",
        headers: this.headers,
        // EMPTY batch — never a synthetic run, so the probe is side-effect-free.
        body: JSON.stringify({ post: [] }),
        redirect: "manual",
      });
      // 2xx = accepted; 400/422 = reachable + auth accepted, payload merely rejected as
      // invalid — all three prove reachability + auth, which is all the probe attests.
      return { ok: res.ok || res.status === 400 || res.status === 422, status: res.status };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Build a standalone `llm` run from metrics only (no `inputs`; gated content). */
  private buildRun(metrics: EmissionMetrics): LangsmithRun {
    const id = crypto.randomUUID();
    const run: LangsmithRun = {
      id,
      // Standalone run: the trace is the run itself.
      trace_id: id,
      dotted_order: `${dottedOrderTimestamp(metrics.startedAtMs)}${id}`,
      name: `chat ${metrics.model}`,
      run_type: "llm",
      start_time: new Date(metrics.startedAtMs).toISOString(),
      end_time: new Date(metrics.finishedAtMs).toISOString(),
      // Required by the RunCreate schema; empty so no request content is exported (metrics-only).
      inputs: {},
      extra: { metadata: buildMetadata(metrics) },
    };
    if (this.projectName !== undefined) {
      run.session_name = this.projectName;
    }
    // OMIT `outputs` entirely when unknown — keep it metrics-only (finish_reason only,
    // never response content).
    if (metrics.finishReason !== undefined) {
      run.outputs = { finish_reason: metrics.finishReason };
    }
    return run;
  }
}
