import { describe, expect, it } from "vitest";

import { lexicalToPlainText } from "./lexical-text";

const state = {
  root: {
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world" },
        ],
      },
      { type: "heading", children: [{ type: "text", text: "A heading" }] },
    ],
  },
};

describe("lexicalToPlainText", () => {
  it("concatenates nested text nodes with spacing between blocks", () => {
    expect(lexicalToPlainText(state)).toBe("Hello world A heading");
  });
  it("returns empty string for nullish input", () => {
    expect(lexicalToPlainText(null)).toBe("");
    expect(lexicalToPlainText(undefined)).toBe("");
  });
});
