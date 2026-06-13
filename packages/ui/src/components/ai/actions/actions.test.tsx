import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { Action, Actions } from "./index";

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

describe("Actions", () => {
  it("renders its children inside a toolbar container", () => {
    render(
      <Actions>
        <Action label="Copy">C</Action>
        <Action label="Retry">R</Action>
      </Actions>
    );

    const toolbar = screen.getByRole("toolbar");
    expect(toolbar).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("applies the group reveal pattern and merges a custom className", () => {
    render(
      <Actions className="custom-row">
        <Action label="Copy">C</Action>
      </Actions>
    );

    const toolbar = screen.getByRole("toolbar");
    expect(toolbar).toHaveClass("custom-row");
    // The reveal-on-hover pattern depends on the row being a named group.
    expect(toolbar).toHaveClass("group/actions");
  });
});

describe("Action", () => {
  it("exposes the label as the accessible name", () => {
    render(<Action label="Copy message">C</Action>);
    expect(screen.getByRole("button", { name: "Copy message" })).toBeInTheDocument();
  });

  it("fires onClick when activated", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Action label="Retry" onClick={onClick}>
        R
      </Action>
    );

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("reveals the tooltip on hover, defaulting to the label", async () => {
    const user = userEvent.setup();
    render(<Action label="Thumbs up">U</Action>);

    await user.hover(screen.getByRole("button", { name: "Thumbs up" }));

    // Radix renders the visible content plus an accessible copy.
    const matches = await screen.findAllByText("Thumbs up");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("uses an explicit tooltip distinct from the label", async () => {
    const user = userEvent.setup();
    render(
      <Action label="copy" tooltip="Copy to clipboard">
        C
      </Action>
    );

    const button = screen.getByRole("button", { name: "copy" });
    await user.hover(button);

    const matches = await screen.findAllByText("Copy to clipboard");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("omits the tooltip when tooltip is null while keeping the label", () => {
    render(
      <Action label="No tooltip" tooltip={null}>
        N
      </Action>
    );

    // Still accessible by label, but no tooltip trigger wrapper exists.
    const button = screen.getByRole("button", { name: "No tooltip" });
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveAttribute("data-state");
  });

  it("is hidden until reveal by default and stays visible when revealOnHover is false", () => {
    render(
      <Actions>
        <Action label="Hidden" tooltip={null}>
          H
        </Action>
        <Action label="Pinned" tooltip={null} revealOnHover={false}>
          P
        </Action>
      </Actions>
    );

    expect(screen.getByRole("button", { name: "Hidden" })).toHaveClass("opacity-0");
    expect(screen.getByRole("button", { name: "Pinned" })).not.toHaveClass("opacity-0");
  });

  it("forwards disabled and prevents the click callback", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Action label="Disabled" onClick={onClick} disabled tooltip={null}>
        D
      </Action>
    );

    const button = screen.getByRole("button", { name: "Disabled" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
