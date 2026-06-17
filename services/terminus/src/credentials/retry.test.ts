import { APICallError } from "ai";
import { describe, expect, it } from "vitest";

import { cooldownUntilFromError, isRetryableUpstreamError } from "./retry";

const apiErr = (o: {
  statusCode?: number;
  isRetryable?: boolean;
  headers?: Record<string, string>;
}) =>
  new APICallError({
    message: "boom",
    url: "https://upstream/v1",
    requestBodyValues: {},
    statusCode: o.statusCode,
    isRetryable: o.isRetryable,
    responseHeaders: o.headers,
  });

describe("isRetryableUpstreamError", () => {
  it("retryable for a 429 the SDK marks retryable", () => {
    expect(isRetryableUpstreamError(apiErr({ statusCode: 429, isRetryable: true }))).toBe(true);
  });

  it("retryable for a 5xx the SDK marks retryable", () => {
    expect(isRetryableUpstreamError(apiErr({ statusCode: 503, isRetryable: true }))).toBe(true);
  });

  it("not retryable for 400/401/403", () => {
    for (const statusCode of [400, 401, 403]) {
      expect(isRetryableUpstreamError(apiErr({ statusCode, isRetryable: false }))).toBe(false);
    }
  });

  it("retryable for an unknown/network error (non-APICallError)", () => {
    expect(isRetryableUpstreamError(new TypeError("fetch failed"))).toBe(true);
  });

  it("not retryable for a client abort", () => {
    const e = new Error("aborted");
    e.name = "AbortError";
    expect(isRetryableUpstreamError(e)).toBe(false);
  });
});

describe("cooldownUntilFromError", () => {
  it("honors a numeric Retry-After (seconds)", () => {
    const e = apiErr({ statusCode: 429, isRetryable: true, headers: { "retry-after": "2" } });
    expect(cooldownUntilFromError(e, 1000)).toBe(1000 + 2000);
  });

  it("honors an HTTP-date Retry-After", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const e = apiErr({
      statusCode: 429,
      isRetryable: true,
      headers: { "retry-after": "Thu, 01 Jan 2026 00:00:30 GMT" },
    });
    expect(cooldownUntilFromError(e, now)).toBe(now + 30_000);
  });

  it("escalating default backoff when there is no Retry-After", () => {
    const e = apiErr({ statusCode: 503, isRetryable: true });
    expect(cooldownUntilFromError(e, 1000, 0)).toBe(1000 + 30_000);
    expect(cooldownUntilFromError(e, 1000, 1)).toBe(1000 + 60_000);
  });

  it("caps the cooldown at the maximum", () => {
    const e = apiErr({ statusCode: 503, isRetryable: true });
    expect(cooldownUntilFromError(e, 0, 100)).toBe(5 * 60_000);
  });
});
