import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Reasoning, ReasoningContent, ReasoningTrigger } from "./index";

describe("Reasoning", () => {
  it("renders the trigger and, when open, the content", () => {
    render(
      <Reasoning defaultOpen>
        <ReasoningTrigger />
        <ReasoningContent>chain of thought</ReasoningContent>
      </Reasoning>
    );

    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByText("chain of thought")).toBeInTheDocument();
  });

  it("hides the content by default (defaultOpen defaults to false)", () => {
    render(
      <Reasoning>
        <ReasoningTrigger />
        <ReasoningContent>chain of thought</ReasoningContent>
      </Reasoning>
    );

    expect(screen.queryByText("chain of thought")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("shows content when defaultOpen is true", () => {
    render(
      <Reasoning defaultOpen>
        <ReasoningTrigger />
        <ReasoningContent>chain of thought</ReasoningContent>
      </Reasoning>
    );

    expect(screen.getByText("chain of thought")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles content open and closed when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Reasoning>
        <ReasoningTrigger />
        <ReasoningContent>chain of thought</ReasoningContent>
      </Reasoning>
    );

    const trigger = screen.getByRole("button");
    expect(screen.queryByText("chain of thought")).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByText("chain of thought")).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByText("chain of thought")).not.toBeInTheDocument();
  });

  it("shows the streaming label while streaming", () => {
    render(
      <Reasoning isStreaming>
        <ReasoningTrigger />
        <ReasoningContent>chain of thought</ReasoningContent>
      </Reasoning>
    );

    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("shows the completed label with the duration once streaming ends", () => {
    const { rerender } = render(
      <Reasoning isStreaming durationMs={7000}>
        <ReasoningTrigger />
        <ReasoningContent>chain of thought</ReasoningContent>
      </Reasoning>
    );

    expect(screen.getByText("Thinking…")).toBeInTheDocument();

    rerender(
      <Reasoning isStreaming={false} durationMs={7000}>
        <ReasoningTrigger />
        <ReasoningContent>chain of thought</ReasoningContent>
      </Reasoning>
    );

    expect(screen.getByText("Thought for 7s")).toBeInTheDocument();
  });

  it("renders a custom trigger label over the default", () => {
    render(
      <Reasoning>
        <ReasoningTrigger>Reasoning steps</ReasoningTrigger>
        <ReasoningContent>chain of thought</ReasoningContent>
      </Reasoning>
    );

    expect(screen.getByText("Reasoning steps")).toBeInTheDocument();
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
  });

  it("auto-expands when streaming starts and collapses when it ends (uncontrolled)", () => {
    const { rerender } = render(
      <Reasoning isStreaming={false}>
        <ReasoningTrigger />
        <ReasoningContent>live tokens</ReasoningContent>
      </Reasoning>
    );

    expect(screen.queryByText("live tokens")).not.toBeInTheDocument();

    rerender(
      <Reasoning isStreaming>
        <ReasoningTrigger />
        <ReasoningContent>live tokens</ReasoningContent>
      </Reasoning>
    );
    expect(screen.getByText("live tokens")).toBeInTheDocument();

    rerender(
      <Reasoning isStreaming={false}>
        <ReasoningTrigger />
        <ReasoningContent>live tokens</ReasoningContent>
      </Reasoning>
    );
    expect(screen.queryByText("live tokens")).not.toBeInTheDocument();
  });

  describe("controlled mode", () => {
    it("renders according to the open prop and fires onOpenChange without self-managing", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      const { rerender } = render(
        <Reasoning open={false} onOpenChange={onOpenChange}>
          <ReasoningTrigger />
          <ReasoningContent>controlled body</ReasoningContent>
        </Reasoning>
      );

      // Closed because the prop says so.
      expect(screen.queryByText("controlled body")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button"));

      // Callback fires asking to open, but content stays hidden until the
      // parent updates the prop (no internal state took over).
      expect(onOpenChange).toHaveBeenCalledWith(true);
      expect(screen.queryByText("controlled body")).not.toBeInTheDocument();

      rerender(
        <Reasoning open onOpenChange={onOpenChange}>
          <ReasoningTrigger />
          <ReasoningContent>controlled body</ReasoningContent>
        </Reasoning>
      );

      expect(screen.getByText("controlled body")).toBeInTheDocument();
    });

    it("does not auto-toggle from streaming changes when controlled", () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <Reasoning open={false} isStreaming={false} onOpenChange={onOpenChange}>
          <ReasoningTrigger />
          <ReasoningContent>controlled body</ReasoningContent>
        </Reasoning>
      );

      rerender(
        <Reasoning open={false} isStreaming onOpenChange={onOpenChange}>
          <ReasoningTrigger />
          <ReasoningContent>controlled body</ReasoningContent>
        </Reasoning>
      );

      expect(screen.queryByText("controlled body")).not.toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  it("throws if a sub-component is used outside of Reasoning", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ReasoningTrigger />)).toThrow(/within a <Reasoning>/);
    spy.mockRestore();
  });
});
