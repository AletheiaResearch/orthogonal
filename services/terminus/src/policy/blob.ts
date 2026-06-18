/**
 * Guardrail-policy blob (CON-71 L2) — the validated JSON shape stored in
 * `policy_versions.config`. Validated at write (seed/admin) AND re-validated at
 * read (never trust the stored shape). v1 enforces gate (allow/deny models +
 * providers) + clamp (max output tokens); `credentialScope` + `byokServiceFeeBps`
 * are forward-compat and DORMANT (validated + stored, read by no v1 code) until
 * BYOK / multi-tenancy. There is no `forceModel` / routing here — Terminus never
 * substitutes the requested model.
 */

/** Which credential source a token may draw from. Dormant in v1 (no BYOK yet). */
export type CredentialScope = "platform" | "byok" | "both";

export interface Guardrails {
  /** null = unrestricted; else a hard allow-gate of full `"provider/model"` ids. */
  allowedModels: string[] | null;
  /** Explicit deny-list (a deny always wins over an allow). */
  deniedModels: string[];
  /** null = unrestricted; else a hard allow-gate of provider ids. */
  allowedProviders: string[] | null;
  deniedProviders: string[];
  /** null = no cap; else clamp `max_completion_tokens`/`max_tokens` (integer >= 1). */
  maxOutputTokensCap: number | null;
}

export interface GuardrailPolicy {
  schemaVersion: 1;
  guardrails: Guardrails;
  /** DORMANT in v1 (read by no request-path code until BYOK / multi-tenancy). */
  credentialScope: CredentialScope;
  /** Integer basis points; DORMANT (no accounting wired in v1). */
  byokServiceFeeBps: number | null;
}

const SCOPES: readonly CredentialScope[] = ["platform", "byok", "both"];

function fail(reason: string): never {
  throw new Error(`invalid policy blob: ${reason}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asStringArray(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
    fail(`${field} must be an array of strings`);
  }
  return v as string[];
}

function asStringArrayOrNull(v: unknown, field: string): string[] | null {
  if (v === undefined || v === null) return null;
  return asStringArray(v, field);
}

function asNonNegIntOrNull(v: unknown, field: string, min: number): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) {
    fail(`${field} must be an integer >= ${min} or null`);
  }
  return v;
}

/**
 * Validate + normalize an untrusted policy blob into a {@link GuardrailPolicy}.
 * Throws a plain `Error` (prefixed `invalid policy blob:`) on any shape mismatch.
 * Discriminates on `schemaVersion`, so later versions extend without breaking this reader.
 */
export function parsePolicy(raw: unknown): GuardrailPolicy {
  if (!isRecord(raw)) fail("must be an object");
  if (raw.schemaVersion !== 1) fail("schemaVersion must be 1");

  const g = raw.guardrails === undefined ? {} : raw.guardrails;
  if (!isRecord(g)) fail("guardrails must be an object");

  const scope = raw.credentialScope ?? "platform";
  if (typeof scope !== "string" || !SCOPES.includes(scope as CredentialScope)) {
    fail(`credentialScope must be one of ${SCOPES.join("|")}`);
  }

  return {
    schemaVersion: 1,
    guardrails: {
      allowedModels: asStringArrayOrNull(g.allowedModels, "guardrails.allowedModels"),
      deniedModels:
        g.deniedModels === undefined
          ? []
          : asStringArray(g.deniedModels, "guardrails.deniedModels"),
      allowedProviders: asStringArrayOrNull(g.allowedProviders, "guardrails.allowedProviders"),
      deniedProviders:
        g.deniedProviders === undefined
          ? []
          : asStringArray(g.deniedProviders, "guardrails.deniedProviders"),
      maxOutputTokensCap: asNonNegIntOrNull(
        g.maxOutputTokensCap,
        "guardrails.maxOutputTokensCap",
        1
      ),
    },
    credentialScope: scope as CredentialScope,
    byokServiceFeeBps: asNonNegIntOrNull(raw.byokServiceFeeBps, "byokServiceFeeBps", 0),
  };
}
