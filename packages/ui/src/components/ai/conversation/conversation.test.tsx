import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { Conversation, ConversationContent, ConversationScrollButton } from "./index";

/**
 * jsdom implements neither ResizeObserver nor Element.scrollTo, both of which
 * the auto-stick behavior relies on. Stub them once for the whole suite.
 */
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
});

/**
 * Drive jsdom's read-only layout values so we can simulate a viewport that is
 * either pinned to the bottom or scrolled up, then fire a scroll event.
 */
function setScrollMetrics(
  el: HTMLElement,
  {
    scrollTop,
    scrollHeight,
    clientHeight,
  }: { scrollTop: number; scrollHeight: number; clientHeight: number }
) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(el, "scrollTop", { configurable: true, writable: true, value: scrollTop });
}

describe("Conversation", () => {
  it("renders its content children", () => {
    render(
      <Conversation>
        <ConversationContent>
          <p>First message</p>
          <p>Second message</p>
        </ConversationContent>
      </Conversation>
    );

    expect(screen.getByText("First message")).toBeInTheDocument();
    expect(screen.getByText("Second message")).toBeInTheDocument();
  });

  it("exposes a polite live-region log role for streamed content", () => {
    render(
      <Conversation>
        <ConversationContent>content</ConversationContent>
      </Conversation>
    );

    const log = screen.getByRole("log");
    expect(log).toHaveAttribute("aria-live", "polite");
  });

  it("merges custom className onto the scroll container", () => {
    render(
      <Conversation className="custom-class">
        <ConversationContent>content</ConversationContent>
      </Conversation>
    );

    expect(screen.getByRole("log")).toHaveClass("custom-class", "overflow-y-auto");
  });

  it("forwards the ref to the underlying scroll container", () => {
    const ref = { current: null } as React.RefObject<HTMLDivElement | null>;
    render(
      <Conversation ref={ref}>
        <ConversationContent>content</ConversationContent>
      </Conversation>
    );

    expect(ref.current).toBe(screen.getByRole("log"));
  });

  it("applies padding/column classes and a custom className on ConversationContent", () => {
    render(
      <Conversation>
        <ConversationContent className="extra">
          <span>child</span>
        </ConversationContent>
      </Conversation>
    );

    const content = screen.getByText("child").parentElement as HTMLElement;
    expect(content).toHaveClass("flex", "flex-col", "p-4", "extra");
  });

  it("hides the scroll button while pinned to the bottom", () => {
    render(
      <Conversation>
        <ConversationContent>content</ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    );

    // Initial state computes isAtBottom from a 0x0 jsdom layout, which is pinned.
    expect(screen.queryByRole("button", { name: "Scroll to bottom" })).not.toBeInTheDocument();
  });

  it("shows the scroll button after the user scrolls up", () => {
    render(
      <Conversation>
        <ConversationContent>content</ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    );

    const log = screen.getByRole("log");
    setScrollMetrics(log, { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 });
    fireEvent.scroll(log);

    expect(screen.getByRole("button", { name: "Scroll to bottom" })).toBeInTheDocument();
  });

  it("hides the scroll button again once the user scrolls back to the bottom", () => {
    render(
      <Conversation>
        <ConversationContent>content</ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    );

    const log = screen.getByRole("log");
    setScrollMetrics(log, { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 });
    fireEvent.scroll(log);
    expect(screen.getByRole("button", { name: "Scroll to bottom" })).toBeInTheDocument();

    // 1000 - 700 - 300 = 0 distance from bottom -> pinned.
    setScrollMetrics(log, { scrollTop: 700, scrollHeight: 1000, clientHeight: 300 });
    fireEvent.scroll(log);
    expect(screen.queryByRole("button", { name: "Scroll to bottom" })).not.toBeInTheDocument();
  });

  it("scrolls back to the bottom and hides the button when clicked", async () => {
    const user = userEvent.setup();
    const scrollToSpy = vi.spyOn(Element.prototype, "scrollTo").mockImplementation(() => {});

    render(
      <Conversation>
        <ConversationContent>content</ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    );

    const log = screen.getByRole("log");
    setScrollMetrics(log, { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 });
    fireEvent.scroll(log);

    const button = screen.getByRole("button", { name: "Scroll to bottom" });
    await user.click(button);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    expect(screen.queryByRole("button", { name: "Scroll to bottom" })).not.toBeInTheDocument();
    scrollToSpy.mockRestore();
  });

  it("invokes a user-supplied onClick alongside the scroll behavior", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Conversation>
        <ConversationContent>content</ConversationContent>
        <ConversationScrollButton onClick={onClick} />
      </Conversation>
    );

    const log = screen.getByRole("log");
    setScrollMetrics(log, { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 });
    fireEvent.scroll(log);

    await user.click(screen.getByRole("button", { name: "Scroll to bottom" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("honors a custom accessible label on the scroll button", () => {
    render(
      <Conversation>
        <ConversationContent>content</ConversationContent>
        <ConversationScrollButton label="Jump to latest" />
      </Conversation>
    );

    const log = screen.getByRole("log");
    setScrollMetrics(log, { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 });
    fireEvent.scroll(log);

    expect(screen.getByRole("button", { name: "Jump to latest" })).toBeInTheDocument();
  });

  it("throws when a subcomponent is used outside of Conversation", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ConversationScrollButton />)).toThrow(
      /must be used within <Conversation>/
    );
    spy.mockRestore();
  });
});
