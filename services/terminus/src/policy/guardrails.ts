/**
 * Guardrail enforcement (CON-71 L2) — the pure, server-side RBAC gate + output
 * clamp applied before model resolution in `routes/chat.ts`. It gates which
 * models/providers a request may use (allow/deny → 403) and clamps the output-token
 * limit. It NEVER rewrites the requested model (no substitution / `forceModel`):
 * the caller gets the model it asked for, or a clean 403.
 */
import { splitModelId } from "../catalog/registry";
import { policyDenied } from "../errors";
import type { GuardrailPolicy } from "./blob";

/**
 * Enforce `policy.guardrails` against the requested model id. Throws a 403
 * `GatewayError` (`policyDenied`) on a gate violation; otherwise returns the
 * (possibly clamped) effective max-output-tokens for the call. Pure — no I/O.
 *
 * Provider is parsed with the same {@link splitModelId} helper resolution uses, so
 * the gate can't disagree with resolution about a request's provider. An unparseable
 * id (no valid `provider/model` split) fails a non-null `allowedProviders` gate
 * (fail-closed); model-level gates apply to the literal id.
 */
export function applyGuardrails(
  modelId: string,
  requestedMaxOutputTokens: number | undefined,
  policy: GuardrailPolicy
): { maxOutputTokens: number | undefined } {
  const { guardrails } = policy;
  const providerId = splitModelId(modelId)?.providerId;

  // Deny wins. Model deny matches the literal id; provider deny needs a parseable provider.
  if (guardrails.deniedModels.includes(modelId)) {
    throw policyDenied(modelId, "model denied by policy");
  }
  if (providerId !== undefined && guardrails.deniedProviders.includes(providerId)) {
    throw policyDenied(modelId, `provider "${providerId}" denied by policy`);
  }

  // Hard allow-gates (non-null = restricted). The model gate matches the literal id.
  if (guardrails.allowedModels !== null && !guardrails.allowedModels.includes(modelId)) {
    throw policyDenied(modelId, "model not in the allow-list");
  }
  // Provider allow-gate: an unparseable id can't prove membership → fail closed.
  if (
    guardrails.allowedProviders !== null &&
    (providerId === undefined || !guardrails.allowedProviders.includes(providerId))
  ) {
    throw policyDenied(modelId, "provider not in the allow-list");
  }

  // Clamp: no cap → leave the request as-is; else min(requested ?? cap, cap) — which also
  // applies the cap when the client omitted the field (never unbounded).
  const cap = guardrails.maxOutputTokensCap;
  const maxOutputTokens =
    cap === null ? requestedMaxOutputTokens : Math.min(requestedMaxOutputTokens ?? cap, cap);

  return { maxOutputTokens };
}
