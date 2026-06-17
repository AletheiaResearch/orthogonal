/**
 * Gateway errors mapped to HTTP status + OpenAI-shaped error bodies
 * (`{ error: { message, type, code } }`), so OpenAI-compatible clients (OpenCode)
 * parse them the same way they parse provider errors.
 */
export type GatewayErrorCode =
  | "unauthorized"
  | "forbidden_model"
  | "unknown_model"
  | "provider_unconfigured"
  | "unsupported_provider"
  | "bad_request"
  | "upstream_error";

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly status: number;
  readonly type: string;

  constructor(code: GatewayErrorCode, status: number, type: string, message: string) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.status = status;
    this.type = type;
  }
}

export const unauthorized = (message = "Invalid or missing gateway token"): GatewayError =>
  new GatewayError("unauthorized", 401, "invalid_request_error", message);

export const forbiddenModel = (model: string): GatewayError =>
  new GatewayError(
    "forbidden_model",
    403,
    "invalid_request_error",
    `Model "${model}" is not allowed for this session`
  );

export const unknownModel = (model: string): GatewayError =>
  new GatewayError("unknown_model", 404, "invalid_request_error", `Unknown model "${model}"`);

export const providerUnconfigured = (provider: string): GatewayError =>
  new GatewayError(
    "provider_unconfigured",
    502,
    "invalid_request_error",
    `No upstream credential configured for provider "${provider}"`
  );

export const missingBaseURL = (provider: string): GatewayError =>
  new GatewayError(
    "provider_unconfigured",
    502,
    "invalid_request_error",
    `Provider "${provider}" has no baseURL for the openai-compatible adapter`
  );

export const codexAccountMissing = (): GatewayError =>
  new GatewayError(
    "provider_unconfigured",
    502,
    "invalid_request_error",
    "Codex credential is missing the required ChatGPT account id"
  );

export const unsupportedProvider = (npm: string, provider: string): GatewayError =>
  new GatewayError(
    "unsupported_provider",
    501,
    "invalid_request_error",
    `Provider "${provider}" uses unsupported adapter "${npm}"`
  );

export const badRequest = (message: string): GatewayError =>
  new GatewayError("bad_request", 400, "invalid_request_error", message);

export const upstreamError = (message: string): GatewayError =>
  new GatewayError("upstream_error", 502, "api_error", message);

export interface OpenAIErrorBody {
  error: { message: string; type: string; code: GatewayErrorCode };
}

export function errorBody(err: GatewayError): OpenAIErrorBody {
  return { error: { message: err.message, type: err.type, code: err.code } };
}

/** Build an OpenAI-shaped JSON error Response (avoids Hono status-code typing friction). */
export function errorResponse(err: GatewayError): Response {
  return Response.json(errorBody(err), { status: err.status });
}

/** Coerce an unknown thrown value into a GatewayError (unknowns become 502 upstream errors). */
export function toGatewayError(err: unknown): GatewayError {
  if (err instanceof GatewayError) return err;
  // Don't forward the raw upstream message to the client (info leak); log it instead.
  console.error(
    JSON.stringify({
      event: "terminus.upstream_error",
      message: err instanceof Error ? err.message : String(err),
    })
  );
  return upstreamError("Upstream request failed");
}
