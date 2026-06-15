/**
 * Pure type-guards for config bodies written via the /config/* PUT endpoints.
 *
 * The stored values later drive repo resolution in webhook-handler.ts, so
 * unvalidated input could store malformed shapes that surface as runtime errors
 * (or worse, silently misroute sessions). These guards let the routes reject
 * bad bodies with a 400 instead of persisting them verbatim.
 */

import type { ProjectRepoMapping, TeamRepoMapping, TriggerConfig } from "./types";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * TeamRepoMapping: { [teamId]: StaticRepoConfig[] } where each entry has
 * non-empty `owner`/`name` and an optional string `label`.
 */
export function isValidTeamRepoMapping(value: unknown): value is TeamRepoMapping {
  if (!isObjectRecord(value)) return false;
  for (const repos of Object.values(value)) {
    if (!Array.isArray(repos)) return false;
    for (const repo of repos) {
      if (!isObjectRecord(repo)) return false;
      if (!isNonEmptyString(repo.owner) || !isNonEmptyString(repo.name)) return false;
      if (repo.label !== undefined && typeof repo.label !== "string") return false;
    }
  }
  return true;
}

/**
 * ProjectRepoMapping: { [projectId]: { owner, name } } with non-empty strings.
 */
export function isValidProjectRepoMapping(value: unknown): value is ProjectRepoMapping {
  if (!isObjectRecord(value)) return false;
  for (const repo of Object.values(value)) {
    if (!isObjectRecord(repo)) return false;
    if (!isNonEmptyString(repo.owner) || !isNonEmptyString(repo.name)) return false;
  }
  return true;
}

/**
 * TriggerConfig is merged over DEFAULT_TRIGGER_CONFIG on read, so a partial body
 * is meaningful: validate the shape of any present field but don't require all.
 */
export function isValidTriggerConfig(value: unknown): value is Partial<TriggerConfig> {
  if (!isObjectRecord(value)) return false;
  if (value.triggerLabel !== undefined && typeof value.triggerLabel !== "string") return false;
  if (value.triggerAssignee !== undefined && typeof value.triggerAssignee !== "string") {
    return false;
  }
  if (value.autoTriggerOnCreate !== undefined && typeof value.autoTriggerOnCreate !== "boolean") {
    return false;
  }
  if (value.triggerCommand !== undefined && typeof value.triggerCommand !== "string") return false;
  return true;
}
