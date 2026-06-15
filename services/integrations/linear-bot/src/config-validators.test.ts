import { describe, expect, it } from "vitest";

import {
  isValidProjectRepoMapping,
  isValidTeamRepoMapping,
  isValidTriggerConfig,
} from "./config-validators";

describe("isValidTeamRepoMapping", () => {
  it("accepts an empty mapping", () => {
    expect(isValidTeamRepoMapping({})).toBe(true);
  });

  it("accepts a valid mapping with optional label", () => {
    expect(
      isValidTeamRepoMapping({
        "team-1": [{ owner: "org", name: "repo", label: "backend" }],
        "team-2": [{ owner: "org", name: "other" }],
      })
    ).toBe(true);
  });

  it("rejects null and arrays", () => {
    expect(isValidTeamRepoMapping(null)).toBe(false);
    expect(isValidTeamRepoMapping([])).toBe(false);
  });

  it("rejects a non-array value for a team", () => {
    expect(isValidTeamRepoMapping({ "team-1": { owner: "org", name: "repo" } })).toBe(false);
  });

  it("rejects a non-object repo entry", () => {
    expect(isValidTeamRepoMapping({ "team-1": [42] })).toBe(false);
  });

  it("rejects a repo entry missing owner", () => {
    expect(isValidTeamRepoMapping({ "team-1": [{ name: "repo" }] })).toBe(false);
  });

  it("rejects an empty-string owner", () => {
    expect(isValidTeamRepoMapping({ "team-1": [{ owner: "", name: "repo" }] })).toBe(false);
  });

  it("rejects a whitespace-only owner", () => {
    expect(isValidTeamRepoMapping({ "team-1": [{ owner: "   ", name: "repo" }] })).toBe(false);
  });

  it("rejects a whitespace-only name", () => {
    expect(isValidTeamRepoMapping({ "team-1": [{ owner: "org", name: "  " }] })).toBe(false);
  });

  it("rejects a non-string label", () => {
    expect(isValidTeamRepoMapping({ "team-1": [{ owner: "org", name: "repo", label: 5 }] })).toBe(
      false
    );
  });
});

describe("isValidProjectRepoMapping", () => {
  it("accepts an empty mapping", () => {
    expect(isValidProjectRepoMapping({})).toBe(true);
  });

  it("accepts a valid mapping", () => {
    expect(isValidProjectRepoMapping({ "proj-1": { owner: "org", name: "repo" } })).toBe(true);
  });

  it("rejects null and arrays", () => {
    expect(isValidProjectRepoMapping(null)).toBe(false);
    expect(isValidProjectRepoMapping([])).toBe(false);
  });

  it("rejects an entry missing name", () => {
    expect(isValidProjectRepoMapping({ "proj-1": { owner: "org" } })).toBe(false);
  });

  it("rejects a non-object entry", () => {
    expect(isValidProjectRepoMapping({ "proj-1": 42 })).toBe(false);
  });

  it("rejects empty-string segments", () => {
    expect(isValidProjectRepoMapping({ "proj-1": { owner: "org", name: "" } })).toBe(false);
  });

  it("rejects whitespace-only segments", () => {
    expect(isValidProjectRepoMapping({ "proj-1": { owner: "  ", name: "repo" } })).toBe(false);
    expect(isValidProjectRepoMapping({ "proj-1": { owner: "org", name: "   " } })).toBe(false);
  });
});

describe("isValidTriggerConfig", () => {
  it("accepts an empty object (partial PUT merged over defaults)", () => {
    expect(isValidTriggerConfig({})).toBe(true);
  });

  it("accepts a full valid config", () => {
    expect(
      isValidTriggerConfig({
        triggerLabel: "agent",
        triggerAssignee: "user-1",
        autoTriggerOnCreate: true,
        triggerCommand: "@agent",
      })
    ).toBe(true);
  });

  it("accepts a partial config with only some present fields", () => {
    expect(isValidTriggerConfig({ autoTriggerOnCreate: false })).toBe(true);
  });

  it("rejects null and arrays", () => {
    expect(isValidTriggerConfig(null)).toBe(false);
    expect(isValidTriggerConfig([])).toBe(false);
  });

  it("rejects a non-boolean autoTriggerOnCreate", () => {
    expect(isValidTriggerConfig({ autoTriggerOnCreate: "yes" })).toBe(false);
  });

  it("rejects a non-string triggerLabel", () => {
    expect(isValidTriggerConfig({ triggerLabel: 123 })).toBe(false);
  });

  it("rejects a non-string triggerAssignee", () => {
    expect(isValidTriggerConfig({ triggerAssignee: 123 })).toBe(false);
  });

  it("rejects a non-string triggerCommand", () => {
    expect(isValidTriggerConfig({ triggerCommand: 123 })).toBe(false);
  });
});
