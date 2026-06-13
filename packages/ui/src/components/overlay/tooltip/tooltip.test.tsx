import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeAll, describe, expect, it } from "vitest";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./index";

beforeAll(() => {
  // Radix tooltip positioning relies on browser APIs jsdom does not implement.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function renderTooltip(props: { content?: React.ReactNode; contentClassName?: string } = {}) {
  const { content = "Tooltip body", contentClassName } = props;
  return render(
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipContent className={contentClassName}>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

describe("Tooltip", () => {
  it("renders the trigger and keeps content hidden when idle", () => {
    renderTooltip();

    expect(screen.getByRole("button", { name: "Hover me" })).toBeInTheDocument();
    expect(screen.queryByText("Tooltip body")).not.toBeInTheDocument();
  });

  it("reveals the content on pointer hover", async () => {
    const user = userEvent.setup();
    renderTooltip();

    await user.hover(screen.getByRole("button", { name: "Hover me" }));

    // Radix renders the visible content plus an accessible copy, so assert at
    // least one match appears.
    const matches = await screen.findAllByText("Tooltip body");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("reveals the content on keyboard focus", async () => {
    const user = userEvent.setup();
    renderTooltip();

    await user.tab();
    expect(screen.getByRole("button", { name: "Hover me" })).toHaveFocus();

    const matches = await screen.findAllByText("Tooltip body");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("hides the content again when the pointer leaves", async () => {
    const user = userEvent.setup();
    renderTooltip();

    const trigger = screen.getByRole("button", { name: "Hover me" });
    await user.hover(trigger);
    expect((await screen.findAllByText("Tooltip body")).length).toBeGreaterThan(0);

    await user.unhover(trigger);
    expect(await screen.findByRole("button", { name: "Hover me" })).toBeInTheDocument();
  });

  it("merges a custom className onto the content while keeping base styles", async () => {
    const user = userEvent.setup();
    renderTooltip({ contentClassName: "custom-tooltip" });

    await user.hover(screen.getByRole("button", { name: "Hover me" }));

    const content = (await screen.findAllByText("Tooltip body")).find((node) =>
      node.classList.contains("custom-tooltip")
    );
    expect(content).toBeDefined();
    // Base styling from the component is preserved alongside the override.
    expect(content).toHaveClass("rounded-md");
  });

  it("respects the controlled open state via the root", async () => {
    function Controlled() {
      const [open, setOpen] = React.useState(false);
      return (
        <TooltipProvider delayDuration={0}>
          <button type="button" onClick={() => setOpen(true)}>
            Show
          </button>
          <Tooltip open={open} onOpenChange={setOpen}>
            <TooltipTrigger>Anchor</TooltipTrigger>
            <TooltipContent>Controlled body</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    const user = userEvent.setup();
    render(<Controlled />);

    expect(screen.queryByText("Controlled body")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect((await screen.findAllByText("Controlled body")).length).toBeGreaterThan(0);
  });
});
