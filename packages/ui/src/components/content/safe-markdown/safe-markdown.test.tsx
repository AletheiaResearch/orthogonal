import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SafeMarkdown } from "./index";

describe("SafeMarkdown", () => {
  it("renders markdown text as formatted HTML", () => {
    render(<SafeMarkdown content="Hello **world**" />);

    const strong = screen.getByText("world");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders headings and emphasis", () => {
    render(<SafeMarkdown content={"# Title\n\nSome _italic_ text"} />);

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    const em = screen.getByText("italic");
    expect(em.tagName).toBe("EM");
  });

  it("renders links with security attributes and opens in a new tab", () => {
    render(<SafeMarkdown content="[click here](https://example.com)" />);

    const link = screen.getByRole("link", { name: "click here" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(link).toHaveClass("text-accent");
  });

  it("styles inline code with the muted background variant", () => {
    render(<SafeMarkdown content="Use `npm install` here" />);

    const code = screen.getByText("npm install");
    expect(code.tagName).toBe("CODE");
    // Inline code gets explicit background + border styling
    expect(code).toHaveClass("bg-muted");
    expect(code).toHaveClass("font-mono");
  });

  it("renders fenced code blocks inside a <pre> wrapper", () => {
    const { container } = render(<SafeMarkdown content={"```js\nconst x = 1;\n```"} />);

    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre).toHaveClass("not-prose");
    // The code element inside a fenced block keeps its language className
    // and therefore does NOT receive the inline muted styling.
    const code = pre?.querySelector("code");
    expect(code).not.toBeNull();
    expect(code).not.toHaveClass("bg-muted");
  });

  it("renders GFM tables with styled cells", () => {
    const table = ["| Name | Age |", "| ---- | --- |", "| Ada  | 36  |"].join("\n");
    render(<SafeMarkdown content={table} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Ada" })).toBeInTheDocument();
  });

  it("renders blockquotes and lists", () => {
    render(<SafeMarkdown content={"> quoted line\n\n- one\n- two"} />);

    expect(screen.getByText("quoted line")).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("merges a custom className onto the prose wrapper", () => {
    const { container } = render(<SafeMarkdown content="hi" className="custom-wrapper" />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("prose");
    expect(wrapper).toHaveClass("custom-wrapper");
  });

  it("sanitizes dangerous HTML and does not render script tags", () => {
    const { container } = render(
      <SafeMarkdown content={"<script>alert('xss')</script>\n\nsafe text"} />
    );

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("safe text")).toBeInTheDocument();
  });

  it("renders an empty wrapper for empty content", () => {
    const { container } = render(<SafeMarkdown content="" />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("prose");
    expect(wrapper.querySelector("p")).toBeNull();
  });
});
