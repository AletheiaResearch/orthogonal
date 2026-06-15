import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env, RepoConfig } from "../types";

// Mock the repos module so classifyRepo's repo list is fully controlled and the
// module-level cache in repos.ts never runs (it would leak state across cases).
const { getAvailableReposMock, buildRepoDescriptionsMock } = vi.hoisted(() => ({
  getAvailableReposMock: vi.fn<() => Promise<RepoConfig[]>>(),
  buildRepoDescriptionsMock: vi.fn<() => Promise<string>>(),
}));

vi.mock("./repos", () => ({
  getAvailableRepos: getAvailableReposMock,
  buildRepoDescriptions: buildRepoDescriptionsMock,
}));

import { classifyRepo } from "./index";

function makeRepo(id: string): RepoConfig {
  const [owner, name] = id.split("/");
  return {
    id,
    owner,
    name,
    fullName: id,
    displayName: name,
    description: `${name} repo`,
    defaultBranch: "main",
    private: false,
  };
}

const env = { ANTHROPIC_API_KEY: "test-anthropic-key" } as unknown as Env;

function stubAnthropicToolUse(input: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: "tool_use", name: "classify_repository", input }],
        }),
    })
  );
}

describe("classifyRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildRepoDescriptionsMock.mockResolvedValue("- **org/repo** (org/repo)");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("needs clarification when no repositories are available", async () => {
    getAvailableReposMock.mockResolvedValue([]);
    const result = await classifyRepo(env, "Title", null, [], null, null, null, null);
    expect(result.repo).toBeNull();
    expect(result.needsClarification).toBe(true);
  });

  it("picks the only repository when exactly one is available", async () => {
    const only = makeRepo("org/repo");
    getAvailableReposMock.mockResolvedValue([only]);
    const result = await classifyRepo(env, "Title", null, [], null, null, null, null);
    expect(result.repo).toEqual(only);
    expect(result.confidence).toBe("high");
    expect(result.needsClarification).toBe(false);
  });

  it("matches the classified repo on a confident multi-repo response", async () => {
    getAvailableReposMock.mockResolvedValue([makeRepo("org/repo"), makeRepo("org/other")]);
    stubAnthropicToolUse({
      repoId: "org/repo",
      confidence: "high",
      reasoning: "Matches auth keywords.",
      alternatives: [],
    });

    const result = await classifyRepo(env, "Fix auth", "broken login", [], null, null, null, null);
    expect(result.repo?.fullName).toBe("org/repo");
    expect(result.confidence).toBe("high");
    expect(result.needsClarification).toBe(false);
    expect(result.reasoning).toBe("Matches auth keywords.");
  });

  it("collects alternatives and flags clarification on a low-confidence response", async () => {
    getAvailableReposMock.mockResolvedValue([makeRepo("org/repo"), makeRepo("org/other")]);
    stubAnthropicToolUse({
      repoId: null,
      confidence: "low",
      reasoning: "Unclear which repo.",
      alternatives: ["org/repo", "org/other"],
    });

    const result = await classifyRepo(env, "Vague", null, [], null, null, null, null);
    expect(result.repo).toBeNull();
    expect(result.needsClarification).toBe(true);
    expect(result.alternatives?.map((r) => r.fullName)).toEqual(["org/repo", "org/other"]);
  });

  it("falls back to clarification when the Anthropic call fails", async () => {
    getAvailableReposMock.mockResolvedValue([makeRepo("org/repo"), makeRepo("org/other")]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("upstream error"),
      })
    );

    const result = await classifyRepo(env, "Title", null, [], null, null, null, null);
    expect(result.repo).toBeNull();
    expect(result.needsClarification).toBe(true);
    expect(result.alternatives?.length).toBeGreaterThan(0);
  });
});
