/**
 * Trace-id generation for the broadcast fan-out (CON-73).
 *
 * A trace id is **16 random bytes, lowercase-hex (32 chars)** — the OTLP-native
 * trace-id shape. OTLP / Langfuse-OTLP / W&B all require a 16-byte trace id, and a
 * hex-16 string is equally fine as a plain string for every proprietary adapter, so
 * we generate this shape once per request rather than a UUID (`deps.newId`, which is
 * already used for the `chatcmpl-…` response id).
 */

/** Generate a 16-byte trace id as 32 lowercase hex chars. */
export function randomTraceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
