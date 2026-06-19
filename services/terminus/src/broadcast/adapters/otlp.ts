/**
 * Generic OTLP/HTTP-JSON broadcast destination (CON-73).
 *
 * Serializes the canonical `EmissionRecord` into an OTLP `ExportTraceServiceRequest`
 * (proto3 JSON) carrying one span per LLM call, annotated with GenAI semantic-convention
 * attributes, and POSTs it to any OTLP/HTTP-JSON collector (the OTel Collector, Honeycomb,
 * Langfuse, Grafana, …). Vendor-specific auth lives entirely in `config.headers`
 * (Authorization / x-honeycomb-team / …), assembled by the registry — not here.
 *
 * Phase 1 is metrics-only: the wire payload is built from `record.metrics` alone.
 * `record.content` is gated off (CON-43) and never read.
 *
 * proto3-JSON encoding traps this adapter is responsible for getting right:
 *  - `span.kind` is the integer `3` (CLIENT), not the `"SPAN_KIND_CLIENT"` enum name.
 *  - `span.status.code` is an integer (1 = OK, 2 = ERROR).
 *  - `intValue` fields are decimal *strings* (int64 in JSON), not numbers; `doubleValue`
 *    is a number.
 *  - timestamps are nanosecond decimal *strings* (`ms * 1e6` overflows Number).
 *  - `spanId` is 8 random bytes as 16 lowercase-hex chars (`traceId` is the 32-hex
 *    OTLP-native id carried through from the record).
 */
import type { BroadcastDestination, TestConnectionResult } from "../destination";
import type { EmissionMetrics, EmissionRecord } from "../record";
import { checkDestinationUrl } from "../ssrf";

export interface OtlpConfig {
  id: string;
  samplingRate: number;
  /** Collector base or full `/v1/traces` endpoint; normalized in the constructor. */
  endpoint: string;
  /** Vendor auth + extra headers, assembled by the registry (e.g. Authorization). */
  headers?: Record<string, string>;
  /** `service.name` resource attribute. Defaults to `DEFAULT_SERVICE_NAME`. */
  serviceName?: string;
}

/** OTLP span-kind enum: CLIENT (proto3 JSON encodes the enum as its integer). */
const SPAN_KIND_CLIENT = 3;
/** OTLP status-code enum values (proto3 JSON integers). */
const STATUS_CODE_OK = 1;
const STATUS_CODE_ERROR = 2;
/**
 * epoch-ms → OTLP UnixNano (an int64 decimal string). The product `ms * 1e6` (~1.7e18)
 * exceeds Number.MAX_SAFE_INTEGER, so we encode the exact int64 with BigInt rather than
 * depending on float arithmetic to round-trip cleanly.
 */
function msToUnixNano(ms: number): string {
  return (BigInt(Math.trunc(ms)) * 1_000_000n).toString();
}
/** Default `service.name` when the config does not set one. */
const DEFAULT_SERVICE_NAME = "terminus-gateway";

/** Minimal OTLP proto3-JSON AnyValue union — only the variants this adapter emits. */
type AnyValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: AnyValue[] } };

interface KeyValue {
  key: string;
  value: AnyValue;
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: KeyValue[];
  status: { code: number };
}

interface ExportTraceServiceRequest {
  resourceSpans: Array<{
    resource: { attributes: KeyValue[] };
    scopeSpans: Array<{
      scope: { name: string };
      spans: OtlpSpan[];
    }>;
  }>;
}

/**
 * Normalize a collector endpoint to its `/v1/traces` signal URL: leave it untouched if it
 * already targets `/v1/traces`, otherwise strip a single trailing slash and append.
 */
function normalizeEndpoint(endpoint: string): string {
  if (endpoint.endsWith("/v1/traces")) return endpoint;
  return `${endpoint.replace(/\/$/, "")}/v1/traces`;
}

/** 8 random bytes → 16 lowercase-hex chars (OTLP span id). */
function randomSpanId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export class OtlpDestination implements BroadcastDestination {
  readonly id: string;
  readonly type = "otlp";
  readonly samplingRate: number;

  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly serviceName: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OtlpConfig, fetchImpl: typeof fetch = fetch) {
    this.id = config.id;
    this.samplingRate = config.samplingRate;
    this.url = normalizeEndpoint(config.endpoint);
    this.headers = { "content-type": "application/json", ...config.headers };
    this.serviceName = config.serviceName ?? DEFAULT_SERVICE_NAME;
    this.fetchImpl = fetchImpl;
  }

  async send(record: EmissionRecord, signal: AbortSignal): Promise<void> {
    const safe = checkDestinationUrl(this.url);
    if (!safe.ok) throw new Error(`unsafe OTLP endpoint: ${safe.reason}`);
    const payload = this.buildPayload(record.metrics);
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) {
      throw new Error(`OTLP export to ${this.url} failed: HTTP ${res.status}`);
    }
  }

  async testConnection(): Promise<TestConnectionResult> {
    const safe = checkDestinationUrl(this.url);
    if (!safe.ok) return { ok: false, error: safe.reason };
    try {
      const res = await this.fetchImpl(this.url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ resourceSpans: [] }),
      });
      // 2xx = accepted; 400 = collector reachable but rejected the (empty) payload —
      // both prove reachability + auth, which is all the probe attests.
      return { ok: res.ok || res.status === 400, status: res.status };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private buildPayload(metrics: EmissionMetrics): ExportTraceServiceRequest {
    const span: OtlpSpan = {
      traceId: metrics.traceId,
      spanId: randomSpanId(),
      name: `chat ${metrics.model}`,
      kind: SPAN_KIND_CLIENT,
      startTimeUnixNano: msToUnixNano(metrics.startedAtMs),
      endTimeUnixNano: msToUnixNano(metrics.finishedAtMs),
      attributes: buildAttributes(metrics),
      status: { code: metrics.finishReason === "error" ? STATUS_CODE_ERROR : STATUS_CODE_OK },
    };
    return {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: this.serviceName } }],
          },
          scopeSpans: [{ scope: { name: "terminus.broadcast" }, spans: [span] }],
        },
      ],
    };
  }
}

/** GenAI-semantic-convention attributes for one LLM call (typed AnyValue). */
function buildAttributes(metrics: EmissionMetrics): KeyValue[] {
  const attributes: KeyValue[] = [
    { key: "gen_ai.provider.name", value: { stringValue: metrics.provider } },
    { key: "gen_ai.request.model", value: { stringValue: metrics.model } },
    { key: "gen_ai.response.model", value: { stringValue: metrics.model } },
    { key: "gen_ai.usage.input_tokens", value: { intValue: String(metrics.inputTokens) } },
    { key: "gen_ai.usage.output_tokens", value: { intValue: String(metrics.outputTokens) } },
    { key: "gen_ai.conversation.id", value: { stringValue: metrics.sessionId } },
    { key: "terminus.cost.usd", value: { doubleValue: metrics.costUsd } },
  ];
  // OMIT the finish-reasons attribute entirely when unknown — never emit an empty array.
  if (metrics.finishReason !== undefined) {
    attributes.push({
      key: "gen_ai.response.finish_reasons",
      value: { arrayValue: { values: [{ stringValue: metrics.finishReason }] } },
    });
  }
  return attributes;
}
