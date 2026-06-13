import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ToolGroup } from "./index";

describe("ToolGroup", () => {
  it("renders the label in a trigger button", () => {
    render(
      <ToolGroup label="Read">
        <div>tool one</div>
      </ToolGroup>
    );

    expect(screen.getByRole("button", { name: /read/i })).toBeInTheDocument();
  });

  it("starts collapsed by default (children hidden)", () => {
    render(
      <ToolGroup label="Read">
        <div>tool one</div>
      </ToolGroup>
    );

    expect(screen.queryByText("tool one")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("shows children on mount when defaultOpen is true", () => {
    render(
      <ToolGroup label="Read" defaultOpen>
        <div>tool one</div>
      </ToolGroup>
    );

    expect(screen.getByText("tool one")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("expands to reveal children when the header is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ToolGroup label="Read">
        <div>tool one</div>
        <div>tool two</div>
      </ToolGroup>
    );

    expect(screen.queryByText("tool one")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /read/i }));

    expect(screen.getByText("tool one")).toBeInTheDocument();
    expect(screen.getByText("tool two")).toBeInTheDocument();
  });

  it("collapses again on a second click", async () => {
    const user = userEvent.setup();
    render(
      <ToolGroup label="Read" defaultOpen>
        <div>tool one</div>
      </ToolGroup>
    );

    const trigger = screen.getByRole("button", { name: /read/i });

    await user.click(trigger);
    expect(screen.queryByText("tool one")).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByText("tool one")).toBeInTheDocument();
  });

  it("renders an explicit summary next to the label", () => {
    render(
      <ToolGroup label="Read" summary="3 files">
        <div>tool one</div>
      </ToolGroup>
    );

    expect(screen.getByText("3 files")).toBeInTheDocument();
  });

  it("derives a summary from count when no summary is supplied", () => {
    render(
      <ToolGroup label="Read" count={3}>
        <div>tool one</div>
      </ToolGroup>
    );

    expect(screen.getByText("· 3")).toBeInTheDocument();
  });

  it("prefers an explicit summary over the derived count", () => {
    render(
      <ToolGroup label="Read" summary="3 files" count={3}>
        <div>tool one</div>
      </ToolGroup>
    );

    expect(screen.getByText("3 files")).toBeInTheDocument();
    expect(screen.queryByText("· 3")).not.toBeInTheDocument();
  });

  it("renders a provided leading icon", () => {
    render(
      <ToolGroup label="Read" icon={<svg data-testid="tool-icon" />}>
        <div>tool one</div>
      </ToolGroup>
    );

    expect(screen.getByTestId("tool-icon")).toBeInTheDocument();
  });

  it("merges custom className onto the wrapper", () => {
    const { container } = render(
      <ToolGroup label="Read" className="custom-wrapper">
        <div>tool one</div>
      </ToolGroup>
    );

    expect(container.firstChild).toHaveClass("custom-wrapper");
  });
});
