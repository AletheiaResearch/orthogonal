import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeAll, describe, expect, it } from "vitest";

import { Popover, PopoverContent, PopoverTrigger } from "./index";

beforeAll(() => {
  // Radix popover positioning relies on browser APIs jsdom does not implement.
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

describe("Popover", () => {
  it("renders the trigger and keeps content hidden when closed", () => {
    render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Panel body</PopoverContent>
      </Popover>
    );

    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(screen.queryByText("Panel body")).not.toBeInTheDocument();
  });

  it("reveals the content after clicking the trigger", async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Panel body</PopoverContent>
      </Popover>
    );

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(await screen.findByText("Panel body")).toBeInTheDocument();
  });

  it("shows content immediately when defaultOpen is set", () => {
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Default open body</PopoverContent>
      </Popover>
    );

    expect(screen.getByText("Default open body")).toBeInTheDocument();
  });

  it("merges custom className onto the content while keeping base styles", () => {
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent className="custom-content">Styled body</PopoverContent>
      </Popover>
    );

    const content = screen.getByText("Styled body");
    expect(content).toHaveClass("custom-content");
    // Base styling from the component is preserved alongside the override.
    expect(content).toHaveClass("rounded-md");
  });

  it("supports controlled open state via onOpenChange", async () => {
    const user = userEvent.setup();

    function Controlled() {
      const [open, setOpen] = React.useState(false);
      return (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger>Toggle</PopoverTrigger>
          <PopoverContent>Controlled body</PopoverContent>
        </Popover>
      );
    }

    render(<Controlled />);

    expect(screen.queryByText("Controlled body")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Toggle" }));
    expect(await screen.findByText("Controlled body")).toBeInTheDocument();
  });
});
