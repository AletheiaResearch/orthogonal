import { mintGatewayToken } from "@open-inspect/shared";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { Env } from "../env";
import { gatewayAuth, type TerminusVars } from "./auth";

const SECRET = "s3cr3t-please-rotate";
const env = { TERMINUS_JWT_SECRET: SECRET } as unknown as Env;

function makeApp() {
  const app = new Hono<{ Bindings: Env; Variables: TerminusVars }>();
  app.use("/protected", gatewayAuth);
  app.get("/protected", (c) => c.json({ sid: c.get("claims").sid }));
  return app;
}

async function call(headers: Record<string, string>) {
  return makeApp().request("/protected", { headers }, env);
}

describe("gatewayAuth", () => {
  it("passes a valid token through and exposes claims", async () => {
    const token = await mintGatewayToken({ sid: "sess_1", allowed_models: [] }, SECRET);
    const res = await call({ Authorization: `Bearer ${token}` });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sid: "sess_1" });
  });

  it("rejects a request with no Authorization header (401)", async () => {
    const res = await call({});
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("accepts a lowercase bearer scheme (case-insensitive)", async () => {
    const token = await mintGatewayToken({ sid: "sess_1", allowed_models: [] }, SECRET);
    const res = await call({ Authorization: `bearer ${token}` });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sid: "sess_1" });
  });

  it("rejects a non-Bearer Authorization header (401)", async () => {
    const res = await call({ Authorization: "Basic abc" });
    expect(res.status).toBe(401);
  });

  it("rejects a token with a bad signature (401)", async () => {
    const token = await mintGatewayToken({ sid: "s", allowed_models: [] }, "different-secret");
    const res = await call({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
  });

  it("rejects an expired token (401)", async () => {
    const token = await mintGatewayToken({ sid: "s", allowed_models: [] }, SECRET, {
      now: 1,
      ttlSeconds: 1,
    });
    const res = await call({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
  });

  it("returns 500 when the gateway secret is not configured", async () => {
    const token = await mintGatewayToken({ sid: "s", allowed_models: [] }, SECRET);
    const res = await makeApp().request(
      "/protected",
      { headers: { Authorization: `Bearer ${token}` } },
      {} as unknown as Env
    );
    expect(res.status).toBe(500);
  });
});
