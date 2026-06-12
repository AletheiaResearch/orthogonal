import { describe, expect, it } from "vitest";

import { formatCommandTokens, parseCommand } from "./mcp-servers-settings";

describe("parseCommand", () => {
  it("splits plain tokens on whitespace", () => {
    expect(parseCommand("npx -y my-server")).toEqual(["npx", "-y", "my-server"]);
  });

  it("respects double and single quote grouping", () => {
    expect(parseCommand(`echo "hello world" 'single quoted'`)).toEqual([
      "echo",
      "hello world",
      "single quoted",
    ]);
  });

  it("unescapes backslash-escaped quotes inside double quotes", () => {
    expect(parseCommand(`echo "hello\\"world"`)).toEqual(["echo", 'hello"world']);
  });

  it("unescapes backslash-escaped backslashes inside double quotes", () => {
    expect(parseCommand(`echo "back\\\\slash"`)).toEqual(["echo", "back\\slash"]);
  });

  it("keeps a backslash literal when it does not escape a quote or backslash", () => {
    expect(parseCommand(`run "C:\\path"`)).toEqual(["run", "C:\\path"]);
  });
});

describe("formatCommandTokens round-trip", () => {
  const cases: string[][] = [
    ["node", "server.js"],
    ["echo", "hello world"],
    ["echo", 'hello"world'],
    ["echo", "back\\slash"],
    ["sh", "-c", 'echo "a b" | grep a'],
  ];

  for (const tokens of cases) {
    it(`round-trips ${JSON.stringify(tokens)}`, () => {
      expect(parseCommand(formatCommandTokens(tokens))).toEqual(tokens);
    });
  }
});
