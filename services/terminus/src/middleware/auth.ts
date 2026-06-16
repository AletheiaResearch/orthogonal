/**
 * Gateway auth middleware (CON-52): verify the short-lived signed token on every
 * `/v1/*` request and expose its claims to handlers. Stateless — signature + exp
 * only, via the shared `verifyGatewayToken`.
 */
import { type GatewayTokenClaims, verifyGatewayToken } from "@open-inspect/shared";
import type { Context, Next } from "hono";

import type { Env } from "../env";
import { GatewayError, errorResponse, unauthorized } from "../errors";

export interface TerminusVars {
  claims: GatewayTokenClaims;
}

export type TerminusContext = Context<{ Bindings: Env; Variables: TerminusVars }>;

export async function gatewayAuth(c: TerminusContext, next: Next): Promise<Response | undefined> {
  const secret = c.env.TERMINUS_JWT_SECRET;
  if (!secret) {
    return errorResponse(
      new GatewayError("upstream_error", 500, "api_error", "Gateway token secret not configured")
    );
  }

  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
  if (!token) return errorResponse(unauthorized());

  const result = await verifyGatewayToken(token, secret);
  if (!result.valid) return errorResponse(unauthorized(`gateway token ${result.reason}`));

  c.set("claims", result.claims);
  await next();
  return undefined;
}
