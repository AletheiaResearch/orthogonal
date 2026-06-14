import { describe, expect, it } from "vitest";

import { readingTimeMinutes } from "./reading-time";

describe("readingTimeMinutes", () => {
  it("computes ceil(words / 200), min 1", () => {
    expect(readingTimeMinutes("word ".repeat(200))).toBe(1);
    expect(readingTimeMinutes("word ".repeat(201))).toBe(2);
    expect(readingTimeMinutes("")).toBe(1);
  });
});
