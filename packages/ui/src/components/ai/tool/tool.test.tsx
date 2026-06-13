import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { Tool, ToolHeader, ToolInput, ToolOutput } from "./index";

describe("Tool", () => {
  it("renders the header name and is collapsed by default", () => {
    render(
      <Tool>
        <ToolHeader name="search_files" state="output-available" />
        <ToolInput>args</ToolInput>
        <ToolOutput>result</ToolOutput>
      </Tool>
    );

    expect(screen.getByRole("button", { name: /search_files/i })).toBeInTheDocument();
    expect(screen.queryByText("args")).not.toBeInTheDocument();
    expect(screen.queryByText("result")).not.toBeInTheDocument();
  });

  it("shows input and output panes when defaultOpen is true", () => {
    render(
      <Tool defaultOpen>
        <ToolHeader name="search_files" state="output-available" />
        <ToolInput>the-args</ToolInput>
        <ToolOutput>the-result</ToolOutput>
      </Tool>
    );

    expect(screen.getByText("the-args")).toBeInTheDocument();
    expect(screen.getByText("the-result")).toBeInTheDocument();
  });

  it("toggles open and closed when the header is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Tool>
        <ToolHeader name="run_command" state="output-available" />
        <ToolOutput>done</ToolOutput>
      </Tool>
    );

    const header = screen.getByRole("button", { name: /run_command/i });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("done")).not.toBeInTheDocument();

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("done")).toBeInTheDocument();

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("done")).not.toBeInTheDocument();
  });

  it("renders the summary text", () => {
    render(
      <Tool>
        <ToolHeader name="read_file" state="input-available" summary="src/app.ts" />
      </Tool>
    );

    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
  });

  it("renders a custom icon when provided", () => {
    render(
      <Tool>
        <ToolHeader
          name="custom"
          state="input-available"
          icon={<svg data-testid="custom-icon" />}
        />
      </Tool>
    );

    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it.each([
    ["input-streaming", /pending/i],
    ["input-available", /running/i],
    ["output-available", /completed/i],
    ["output-error", /error/i],
  ] as const)("shows the %s status label", (state, labelMatcher) => {
    render(
      <Tool>
        <ToolHeader name="tool" state={state} />
      </Tool>
    );

    expect(screen.getByText(labelMatcher)).toBeInTheDocument();
  });

  it("renders errorText instead of children in the output pane", () => {
    render(
      <Tool defaultOpen>
        <ToolHeader name="tool" state="output-error" />
        <ToolOutput errorText="boom: command failed">should-not-show</ToolOutput>
      </Tool>
    );

    expect(screen.getByText("boom: command failed")).toBeInTheDocument();
    expect(screen.queryByText("should-not-show")).not.toBeInTheDocument();
  });

  it("renders nothing for an output pane with neither children nor errorText", () => {
    render(
      <Tool defaultOpen>
        <ToolHeader name="tool" state="output-available" />
        <ToolOutput />
      </Tool>
    );

    expect(screen.queryByText("Output")).not.toBeInTheDocument();
  });

  describe("controlled mode", () => {
    it("respects the open prop and does not toggle internally", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(
        <Tool open={false} onOpenChange={onOpenChange}>
          <ToolHeader name="controlled" state="output-available" />
          <ToolOutput>payload</ToolOutput>
        </Tool>
      );

      expect(screen.queryByText("payload")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /controlled/i }));

      // Stays closed because the parent controls `open` and did not update it.
      expect(screen.queryByText("payload")).not.toBeInTheDocument();
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });

    it("reflects an externally controlled open=true", () => {
      render(
        <Tool open onOpenChange={() => {}}>
          <ToolHeader name="controlled" state="output-available" />
          <ToolOutput>payload</ToolOutput>
        </Tool>
      );

      expect(screen.getByRole("button", { name: /controlled/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
      expect(screen.getByText("payload")).toBeInTheDocument();
    });
  });

  it("wires aria-controls on the header to the content pane id", () => {
    render(
      <Tool defaultOpen>
        <ToolHeader name="tool" state="output-available" />
        <ToolInput>args</ToolInput>
      </Tool>
    );

    const header = screen.getByRole("button", { name: /tool/i });
    const controls = header.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls as string)).toContainElement(screen.getByText("args"));
  });

  it("throws when sub-components are used outside a Tool", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ToolHeader name="x" state="input-available" />)).toThrow(
      /must be used within a <Tool>/
    );
    spy.mockRestore();
  });
});
