/**
 * Generic webhook broadcast destination (CON-73).
 *
 * POSTs the canonical record's metric subset (Phase 1 is metrics-only — `content` is
 * gated OFF and never read) as JSON to an operator-supplied URL. Because the URL is
 * runtime-configured it is an SSRF vector, so every outbound call is gated by
 * `checkDestinationUrl` (HTTPS-only, no loopback/private/metadata hosts). When an
 * `hmacKey` is configured the body is signed (`x-terminus-signature: sha256=<hex>`)
 * so the receiver can verify authenticity (Helicone's signed-webhook pattern).
 */
import type { BroadcastDestination, TestConnectionResult } from "../destination";
import { hmacSha256Hex } from "../hmac";
import { fetchWithTimeout } from "../probe";
import type { EmissionRecord } from "../record";
import { checkDestinationUrl } from "../ssrf";

export interface WebhookConfig {
  /** Stable destination id (the D1 row id) — also the sampling salt. */
  id: string;
  /** Per-trace sampling rate in [0,1]. */
  samplingRate: number;
  /** Operator-supplied destination URL (must pass the SSRF guard). */
  url: string;
  /** Optional HMAC-SHA256 key; when set, the body is signed. */
  hmacKey?: string;
  /** Optional extra headers, merged over the defaults. */
  headers?: Record<string, string>;
}

const SIGNATURE_HEADER = "x-terminus-signature";

export class WebhookDestination implements BroadcastDestination {
  readonly id: string;
  readonly type = "webhook";
  readonly samplingRate: number;

  private readonly config: WebhookConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: WebhookConfig, fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.id = config.id;
    this.samplingRate = config.samplingRate;
  }

  /**
   * Build the wire payload from `record.metrics` only and POST it. Rejects on an
   * unsafe URL (SSRF guard), a non-2xx response, or a network error so the dispatcher
   * can log it via `onError` for delivery observability.
   */
  async send(record: EmissionRecord, signal: AbortSignal): Promise<void> {
    const check = checkDestinationUrl(this.config.url);
    if (!check.ok) {
      throw new Error(`unsafe webhook url: ${check.reason}`);
    }

    const body = JSON.stringify(record.metrics);
    const headers = await this.buildHeaders(body);

    const response = await this.fetchImpl(this.config.url, {
      method: "POST",
      headers,
      body,
      signal,
      redirect: "manual",
    });
    if (!response.ok) {
      throw new Error(`webhook delivery failed: ${response.status}`);
    }
  }

  /**
   * Minimal reachability+auth probe: gate on the SSRF guard (skipping fetch entirely
   * for an unsafe URL), then POST a tiny mock body and treat 2xx as ok. Never throws.
   */
  async testConnection(): Promise<TestConnectionResult> {
    const check = checkDestinationUrl(this.config.url);
    if (!check.ok) {
      return { ok: false, error: check.reason };
    }

    const body = JSON.stringify({ test: true });
    try {
      const headers = await this.buildHeaders(body);
      const response = await fetchWithTimeout(this.fetchImpl, this.config.url, {
        method: "POST",
        headers,
        body,
        redirect: "manual",
      });
      return { ok: response.ok, status: response.status };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Default headers + configured extras + (optional) HMAC signature over `body`. */
  private async buildHeaders(body: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...this.config.headers,
    };
    if (this.config.hmacKey) {
      const sig = await hmacSha256Hex(this.config.hmacKey, body);
      headers[SIGNATURE_HEADER] = `sha256=${sig}`;
    }
    return headers;
  }
}
