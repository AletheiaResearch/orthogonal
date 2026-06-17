import { describe, expect, it } from "vitest";

import { CodexRefreshUnauthorizedError, refreshCodexToken } from "./codex-oauth";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () => jsonResponse(body, status)) as unknown as typeof fetch;
}

describe("refreshCodexToken", () => {
  it("returns the rotated tokens on success", async () => {
    const result = await refreshCodexToken(
      "rt",
      fakeFetch({ access_token: "at", refresh_token: "rt2", expires_in: 3600 })
    );
    expect(result).toMatchObject({
      accessToken: "at",
      refreshToken: "rt2",
      expiresInSeconds: 3600,
    });
  });

  it("throws CodexRefreshUnauthorizedError on 401", async () => {
    await expect(refreshCodexToken("rt", fakeFetch({}, 401))).rejects.toBeInstanceOf(
      CodexRefreshUnauthorizedError
    );
  });

  it("throws when the response is missing access_token or refresh_token", async () => {
    await expect(refreshCodexToken("rt", fakeFetch({ access_token: "at" }))).rejects.toThrow(
      /refresh_token/i
    );
  });
});
