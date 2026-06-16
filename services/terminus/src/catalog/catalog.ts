/**
 * `/v1/models` catalog (CON-49).
 *
 * Serves the models.dev registry narrowed to providers that have a configured
 * credential (dynamic / OpenRouter-style) and, when the token scopes a session,
 * to its `allowed_models`. Output is OpenAI-shaped (`{object:"list", data:[…]}`)
 * enriched with catalog metadata (context window, modalities, pricing) so clients
 * discover the full catalog from one endpoint.
 */
import type { CredentialResolver } from "../credentials/resolver";
import type { ModelsDevRegistry } from "./registry";

export interface CatalogModel {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  context_window?: number;
  max_output_tokens?: number;
  modalities?: { input: string[]; output: string[] };
  pricing?: { input?: number; output?: number; cache_read?: number; cache_write?: number };
}

export interface ModelsListResponse {
  object: "list";
  data: CatalogModel[];
}

/**
 * Build the `/v1/models` response. `allowedModels` scopes the catalog to a session;
 * an empty list means unrestricted (all enabled models) — see CON-52 follow-up for
 * per-tenant tightening.
 */
export async function buildModelsList(
  registry: ModelsDevRegistry,
  resolver: CredentialResolver,
  allowedModels: string[]
): Promise<ModelsListResponse> {
  const allowAll = allowedModels.length === 0;
  const allowed = new Set(allowedModels);
  const data: CatalogModel[] = [];

  for (const [providerId, provider] of Object.entries(registry)) {
    if (!(await resolver.isEnabled(providerId, provider.env))) continue;

    for (const [modelId, model] of Object.entries(provider.models ?? {})) {
      const id = `${providerId}/${modelId}`;
      if (!allowAll && !allowed.has(id)) continue;

      data.push({
        id,
        object: "model",
        created: 0,
        owned_by: providerId,
        context_window: model.limit?.context,
        max_output_tokens: model.limit?.output,
        modalities: model.modalities,
        pricing: model.cost
          ? {
              input: model.cost.input,
              output: model.cost.output,
              cache_read: model.cost.cache_read,
              cache_write: model.cost.cache_write,
            }
          : undefined,
      });
    }
  }

  data.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { object: "list", data };
}
