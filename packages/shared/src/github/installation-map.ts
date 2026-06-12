export function parseInstallationMap(raw: string | undefined): Map<string, string> {
  if (!raw) {
    return new Map();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Map();
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return new Map();
  }

  const result = new Map<string, string>();
  for (const [owner, installationId] of Object.entries(parsed)) {
    if (typeof installationId === "string") {
      result.set(owner.toLowerCase(), installationId);
    }
  }
  return result;
}

export function resolveInstallationId(
  owner: string,
  map: Map<string, string>,
  defaultInstallationId: string
): string {
  return map.get(owner.toLowerCase()) ?? defaultInstallationId;
}
