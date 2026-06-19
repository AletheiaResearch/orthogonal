/**
 * PostHog capture destination (CON-73) — maps the canonical `EmissionRecord` onto
 * PostHog's LLM-analytics capture API (`POST /i/v0/e/`), modeled on LiteLLM's
 * `posthog.py` reference integration.
 *
 * Phase-1 metrics-only: the wire payload is built from `record.metrics` ONLY. Raw
 * `record.content` is gated off (CON-43) and never read here.
 *
 * Auth is body-borne: PostHog's capture endpoint authenticates via the `api_key` field
 * in the JSON body, NOT an `Authorization` header. The only header is `content-type`.
 */
import type { BroadcastDestination, TestConnectionResult } from "../destination";
import type { EmissionMetrics, EmissionRecord } from "../record";
import { checkDestinationUrl } from "../ssrf";

/** PostHog default ingestion host (US cloud). */
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/** PostHog's `$ai_generation` event — the LLM-analytics event PostHog expects. */
const AI_GENERATION_EVENT = "$ai_generation";

export interface PosthogConfig {
  /** Stable destination id (the D1 row id) — also the sampling salt. */
  id: string;
  /** Per-trace sampling rate in [0,1]. */
  samplingRate: number;
  /** Ingestion host. Defaults to DEFAULT_POSTHOG_HOST. */
  host?: string;
  /** PostHog project API key — sent in the body's `api_key`, never a header. */
  projectApiKey: string;
}

/** The bare model id: the part after the first '/', or the whole string if no '/'. */
function bareModel(model: string): string {
  const slash = model.indexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}

/**
 * Build the `$ai_generation` properties from metrics. `$ai_stop_reason` is included
 * only when a finish reason is present, so its omission is intentional rather than an
 * accident of JSON dropping `undefined`.
 */
function buildProperties(metrics: EmissionMetrics): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    $ai_model: bareModel(metrics.model),
    $ai_provider: metrics.provider,
    $ai_input_tokens: metrics.inputTokens,
    $ai_output_tokens: metrics.outputTokens,
    $ai_total_cost_usd: metrics.costUsd,
    $ai_latency: metrics.latencyMs / 1000, // PostHog expects seconds.
    $ai_trace_id: metrics.traceId,
    $ai_session_id: metrics.sessionId,
  };
  if (metrics.finishReason !== undefined) {
    properties.$ai_stop_reason = metrics.finishReason;
  }
  return properties;
}

export class PosthogDestination implements BroadcastDestination {
  readonly id: string;
  readonly type = "posthog";
  readonly samplingRate: number;

  private readonly host: string;
  private readonly projectApiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PosthogConfig, fetchImpl: typeof fetch = fetch) {
    this.id = config.id;
    this.samplingRate = config.samplingRate;
    this.host = config.host ?? DEFAULT_POSTHOG_HOST;
    this.projectApiKey = config.projectApiKey;
    this.fetchImpl = fetchImpl;
  }

  private get captureUrl(): string {
    return `${this.host}/i/v0/e/`;
  }

  async send(record: EmissionRecord, signal: AbortSignal): Promise<void> {
    const safe = checkDestinationUrl(this.captureUrl);
    if (!safe.ok) throw new Error(`unsafe posthog host: ${safe.reason}`);
    const { metrics } = record;
    const body = {
      api_key: this.projectApiKey,
      event: AI_GENERATION_EVENT,
      distinct_id: metrics.sessionId,
      properties: buildProperties(metrics),
    };
    const res = await this.fetchImpl(this.captureUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      throw new Error(`posthog capture failed: ${res.status}`);
    }
  }

  async testConnection(): Promise<TestConnectionResult> {
    const safe = checkDestinationUrl(this.captureUrl);
    if (!safe.ok) return { ok: false, error: safe.reason };
    const body = {
      api_key: this.projectApiKey,
      event: AI_GENERATION_EVENT,
      distinct_id: "terminus-test",
      properties: {},
    };
    try {
      const res = await this.fetchImpl(this.captureUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}
