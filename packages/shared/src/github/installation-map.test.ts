import { describe, expect, it } from "vitest";

import { parseInstallationMap, resolveInstallationId } from "./installation-map";

describe("parseInstallationMap", () => {
  it("returns empty map for undefined input", () => {
    expect(parseInstallationMap(undefined).size).toBe(0);
  });

  it("returns empty map for invalid JSON", () => {
    expect(parseInstallationMap("{not json").size).toBe(0);
  });

  it("returns empty map for non-object JSON", () => {
    expect(parseInstallationMap("[]").size).toBe(0);
    expect(parseInstallationMap('"string"').size).toBe(0);
  });

  it("lowercases owner keys and keeps string installation IDs", () => {
    const map = parseInstallationMap(
      JSON.stringify({ "Org-A": "111111", org_b: "222222", skip: 123 })
    );
    expect(map.get("org-a")).toBe("111111");
    expect(map.get("org_b")).toBe("222222");
    expect(map.has("skip")).toBe(false);
  });
});

describe("resolveInstallationId", () => {
  const map = parseInstallationMap(JSON.stringify({ "org-a": "111111" }));

  it("returns mapped installation ID for known owner", () => {
    expect(resolveInstallationId("Org-A", map, "999999")).toBe("111111");
  });

  it("falls back to default for unknown owner", () => {
    expect(resolveInstallationId("unknown", map, "999999")).toBe("999999");
  });
});
