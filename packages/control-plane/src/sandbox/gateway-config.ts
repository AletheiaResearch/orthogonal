/**
 * LLM gateway configuration helpers (CON-53). Extracted from the Session Durable
 * Object so the security-relevant parsing/validation is directly unit-testable
 * (the DO itself can only be exercised via the workerd integration harness).
 */
import { normalizeSandboxSettings } from "./settings";

/** The LLM gateway is configured only with a non-empty secret AND a valid https base URL. */
export function isValidGatewayConfig(secret: string | undefined, url: string | undefined): boolean {
  if (!secret || !secret.trim()) return false;
  if (!url || !url.trim()) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Whether a session's persisted sandbox settings opted into the LLM gateway. */
export function sessionGatewayEnabled(sandboxSettings: string | null): boolean {
  if (!sandboxSettings) return false;
  try {
    return (
      normalizeSandboxSettings(JSON.parse(sandboxSettings), { invalid: "omit" })
        .llmGatewayEnabled === true
    );
  } catch {
    return false;
  }
}
