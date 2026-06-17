import { describe, expect, it } from "vitest";

import { isValidGatewayConfig, sessionGatewayEnabled } from "./gateway-config";

describe("isValidGatewayConfig", () => {
  it("requires a non-empty secret and a valid absolute https url", () => {
    expect(isValidGatewayConfig("s", "https://gw.example/")).toBe(true);
    expect(isValidGatewayConfig("", "https://gw.example/")).toBe(false);
    expect(isValidGatewayConfig("   ", "https://gw.example/")).toBe(false);
    expect(isValidGatewayConfig("s", "http://gw.example/")).toBe(false); // not https
    expect(isValidGatewayConfig("s", "not a url")).toBe(false);
    expect(isValidGatewayConfig("s", "")).toBe(false);
    expect(isValidGatewayConfig("s", undefined)).toBe(false);
    expect(isValidGatewayConfig(undefined, "https://gw.example/")).toBe(false);
  });
});

describe("sessionGatewayEnabled", () => {
  it("is true only when settings explicitly enable the gateway (the credential-gate)", () => {
    expect(sessionGatewayEnabled(JSON.stringify({ llmGatewayEnabled: true }))).toBe(true);
    expect(sessionGatewayEnabled(JSON.stringify({ llmGatewayEnabled: false }))).toBe(false);
    expect(sessionGatewayEnabled(JSON.stringify({}))).toBe(false);
    expect(sessionGatewayEnabled(null)).toBe(false);
    expect(sessionGatewayEnabled("not json")).toBe(false);
    // A non-boolean value must not enable the gateway (normalizer omits it).
    expect(sessionGatewayEnabled(JSON.stringify({ llmGatewayEnabled: "true" }))).toBe(false);
  });
});
