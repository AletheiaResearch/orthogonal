import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Loader, TextShimmer } from "./index";

describe("Loader", () => {
  it("renders a status role with an accessible label", () => {
    render(<Loader />);
    const el = screen.getByRole("status", { name: "Loading" });
    expect(el).toBeInTheDocument();
    expect(el.tagName.toLowerCase()).toBe("svg");
  });

  it("spins via animate-spin and is muted by default", () => {
    render(<Loader />);
    const el = screen.getByRole("status");
    expect(el).toHaveClass("animate-spin", "text-muted-foreground");
  });

  it("defaults to a 16px square", () => {
    render(<Loader />);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("width", "16");
    expect(el).toHaveAttribute("height", "16");
  });

  it("applies a custom size to both width and height", () => {
    render(<Loader size={32} />);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("width", "32");
    expect(el).toHaveAttribute("height", "32");
  });

  it("merges a custom className with the base classes", () => {
    render(<Loader className="text-accent custom-loader" />);
    const el = screen.getByRole("status");
    expect(el).toHaveClass("custom-loader", "text-accent", "animate-spin");
  });

  it("forwards arbitrary svg props", () => {
    render(<Loader data-testid="spinner" aria-label="Connecting" />);
    const el = screen.getByTestId("spinner");
    // The explicit aria-label override wins.
    expect(el).toHaveAttribute("aria-label", "Connecting");
  });
});

describe("TextShimmer", () => {
  it("renders its children", () => {
    render(<TextShimmer>Thinking…</TextShimmer>);
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("renders the text inside a span", () => {
    render(<TextShimmer>Connecting…</TextShimmer>);
    expect(screen.getByText("Connecting…").tagName).toBe("SPAN");
  });

  it("applies the bg-clip-text shimmer base classes", () => {
    render(<TextShimmer>Loading</TextShimmer>);
    const el = screen.getByText("Loading");
    expect(el).toHaveClass("bg-clip-text", "text-transparent", "inline-block");
  });

  it("drives the shimmer via the injected keyframe animation", () => {
    render(<TextShimmer>Streaming</TextShimmer>);
    const el = screen.getByText("Streaming");
    expect(el.style.animation).toContain("orthogonal-ui-text-shimmer-keyframes");
    expect(el.style.backgroundSize).toBe("200% 100%");
  });

  it("injects the shimmer keyframes into a style element", () => {
    const { container } = render(<TextShimmer>Working</TextShimmer>);
    const style = container.querySelector("style");
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain("@keyframes orthogonal-ui-text-shimmer-keyframes");
  });

  it("merges a custom className with the base classes", () => {
    render(<TextShimmer className="custom-shimmer text-lg">Hi</TextShimmer>);
    const el = screen.getByText("Hi");
    expect(el).toHaveClass("custom-shimmer", "text-lg", "bg-clip-text");
  });

  it("allows overriding inline style while preserving the animation", () => {
    render(<TextShimmer style={{ letterSpacing: "0.1em" }}>Spaced</TextShimmer>);
    const el = screen.getByText("Spaced");
    expect(el.style.letterSpacing).toBe("0.1em");
    expect(el.style.animation).toContain("orthogonal-ui-text-shimmer-keyframes");
  });

  it("forwards arbitrary span attributes", () => {
    render(
      <TextShimmer data-testid="shimmer" title="status">
        Busy
      </TextShimmer>
    );
    const el = screen.getByTestId("shimmer");
    expect(el).toHaveAttribute("title", "status");
  });
});
