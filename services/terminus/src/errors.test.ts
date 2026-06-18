import { describe, expect, it } from "vitest";

import { GatewayError, policyDenied, policyUnavailable } from "./errors";

describe("policyDenied", () => {
  it("is a 403 forbidden_model error naming the model + reason", () => {
    const err = policyDenied("openai/o1", "model denied by policy");
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("forbidden_model");
    expect(err.message).toContain("openai/o1");
    expect(err.message).toContain("model denied by policy");
  });
});

describe("policyUnavailable", () => {
  it("is a 503 transient upstream error", () => {
    const err = policyUnavailable();
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.status).toBe(503);
    expect(err.type).toBe("api_error");
  });
});
