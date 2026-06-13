import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge, badgeVariants, prBadgeVariant } from "./index";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>Hello</Badge>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders as a span element", () => {
    render(<Badge>content</Badge>);
    expect(screen.getByText("content").tagName).toBe("SPAN");
  });

  it("applies the default variant classes when no variant is provided", () => {
    render(<Badge>default</Badge>);
    const el = screen.getByText("default");
    expect(el).toHaveClass("bg-muted", "text-muted-foreground");
  });

  it("applies variant-specific classes", () => {
    render(<Badge variant="pr-merged">merged</Badge>);
    const el = screen.getByText("merged");
    expect(el).toHaveClass("bg-success-muted", "text-success");
  });

  it("applies the info variant border classes", () => {
    render(<Badge variant="info">info</Badge>);
    const el = screen.getByText("info");
    expect(el).toHaveClass("bg-info-muted", "text-info", "border");
  });

  it("applies the kbd variant font classes", () => {
    render(<Badge variant="kbd">K</Badge>);
    const el = screen.getByText("K");
    expect(el).toHaveClass("font-mono", "border-border");
  });

  it("merges a custom className with the variant classes", () => {
    render(<Badge className="custom-class">styled</Badge>);
    const el = screen.getByText("styled");
    expect(el).toHaveClass("custom-class", "bg-muted");
  });

  it("forwards arbitrary HTML span attributes", () => {
    render(
      <Badge data-testid="badge-el" id="my-badge" title="a tooltip">
        attrs
      </Badge>
    );
    const el = screen.getByTestId("badge-el");
    expect(el).toHaveAttribute("id", "my-badge");
    expect(el).toHaveAttribute("title", "a tooltip");
  });

  it("always includes the shared base classes", () => {
    render(<Badge variant="pr-open">base</Badge>);
    const el = screen.getByText("base");
    expect(el).toHaveClass("inline-flex", "items-center", "rounded-sm", "text-xs", "font-medium");
  });
});

describe("badgeVariants", () => {
  it("returns base classes for the default variant", () => {
    expect(badgeVariants()).toContain("bg-muted");
    expect(badgeVariants()).toContain("inline-flex");
  });

  it("returns the requested variant classes", () => {
    expect(badgeVariants({ variant: "pr-closed" })).toContain("bg-destructive-muted");
  });
});

describe("prBadgeVariant", () => {
  it("maps merged to pr-merged", () => {
    expect(prBadgeVariant("merged")).toBe("pr-merged");
  });

  it("maps closed to pr-closed", () => {
    expect(prBadgeVariant("closed")).toBe("pr-closed");
  });

  it("maps draft to pr-draft", () => {
    expect(prBadgeVariant("draft")).toBe("pr-draft");
  });

  it("maps open to pr-open", () => {
    expect(prBadgeVariant("open")).toBe("pr-open");
  });

  it("falls back to pr-open for unknown states", () => {
    expect(prBadgeVariant("anything-else")).toBe("pr-open");
  });
});
