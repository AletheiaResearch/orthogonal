import { describe, expect, it } from "vitest";

import { randomTraceId } from "./trace-id";

describe("randomTraceId", () => {
  it("returns 32 lowercase hex chars (16 bytes — OTLP-native trace id)", () => {
    expect(randomTraceId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is non-constant across calls", () => {
    expect(randomTraceId()).not.toBe(randomTraceId());
  });
});
