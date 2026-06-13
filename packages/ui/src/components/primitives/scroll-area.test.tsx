import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { ScrollArea, ScrollBar } from "./scroll-area";

beforeAll(() => {
  // Radix ScrollArea observes element size; jsdom has no ResizeObserver.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
});

describe("ScrollArea", () => {
  it("renders its children inside the scroll viewport", () => {
    render(
      <ScrollArea>
        <p>Scrollable content</p>
      </ScrollArea>
    );

    expect(screen.getByText("Scrollable content")).toBeInTheDocument();
  });

  it("forwards a ref to the underlying root element", () => {
    const ref = { current: null as HTMLDivElement | null };

    render(
      <ScrollArea ref={ref}>
        <span>content</span>
      </ScrollArea>
    );

    expect(ref.current).toBeInstanceOf(HTMLElement);
  });

  it("merges custom className onto the root while keeping base classes", () => {
    const { container } = render(
      <ScrollArea className="custom-class">
        <span>content</span>
      </ScrollArea>
    );

    const root = container.firstElementChild;
    expect(root).toHaveClass("custom-class");
    expect(root).toHaveClass("relative", "overflow-hidden");
  });

  it("spreads arbitrary props such as data attributes onto the root", () => {
    const { container } = render(
      <ScrollArea data-testid="area" aria-label="logs">
        <span>content</span>
      </ScrollArea>
    );

    const root = container.firstElementChild;
    expect(root).toHaveAttribute("data-testid", "area");
    expect(root).toHaveAttribute("aria-label", "logs");
  });
});

describe("ScrollBar", () => {
  it("renders a vertical scrollbar by default with vertical classes", () => {
    // Radix only mounts a scrollbar once it detects content overflow, which
    // never happens in jsdom (all dimensions are zero). `type="always"` forces
    // the scrollbar to mount regardless of overflow so we can assert classes.
    const { container } = render(
      <ScrollArea type="always">
        <span>content</span>
      </ScrollArea>
    );

    const scrollbar = container.querySelector("[data-orientation='vertical']");
    expect(scrollbar).not.toBeNull();
    expect(scrollbar).toHaveClass("w-2.5");
  });

  it("applies horizontal classes when orientation is horizontal", () => {
    // `type="always"` mounts the scrollbars without overflow detection, and
    // `forceMount` ensures the explicit horizontal scrollbar renders in jsdom.
    const { container } = render(
      <ScrollArea type="always">
        <span>content</span>
        <ScrollBar orientation="horizontal" forceMount />
      </ScrollArea>
    );

    const horizontalBar = container.querySelector("[data-orientation='horizontal']");
    expect(horizontalBar).not.toBeNull();
    expect(horizontalBar).toHaveClass("flex-col", "h-2.5");
  });
});
