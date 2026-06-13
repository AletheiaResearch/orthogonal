import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Suggestion, Suggestions } from "./suggestion";

describe("Suggestions", () => {
  it("renders its children", () => {
    render(
      <Suggestions>
        <Suggestion suggestion="First" />
        <Suggestion suggestion="Second" />
      </Suggestions>
    );
    expect(screen.getByRole("button", { name: "First" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Second" })).toBeInTheDocument();
  });

  it("renders as a horizontally scrolling row", () => {
    render(
      <Suggestions data-testid="row">
        <Suggestion suggestion="Only" />
      </Suggestions>
    );
    const row = screen.getByTestId("row");
    expect(row).toHaveClass("flex", "overflow-x-auto", "whitespace-nowrap");
  });

  it("merges a custom className onto the row", () => {
    render(
      <Suggestions data-testid="row" className="px-4">
        <Suggestion suggestion="Only" />
      </Suggestions>
    );
    expect(screen.getByTestId("row")).toHaveClass("px-4", "flex");
  });

  it("forwards arbitrary div attributes", () => {
    render(
      <Suggestions data-testid="row" id="prompt-row" aria-label="Suggested prompts">
        <Suggestion suggestion="Only" />
      </Suggestions>
    );
    const row = screen.getByTestId("row");
    expect(row).toHaveAttribute("id", "prompt-row");
    expect(row).toHaveAttribute("aria-label", "Suggested prompts");
  });
});

describe("Suggestion", () => {
  it("renders the suggestion text as the default label", () => {
    render(<Suggestion suggestion="Summarize this thread" />);
    expect(screen.getByRole("button", { name: "Summarize this thread" })).toBeInTheDocument();
  });

  it("renders as a button element with type=button by default", () => {
    render(<Suggestion suggestion="Go" />);
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveAttribute("type", "button");
  });

  it("lets children override the displayed label", () => {
    render(<Suggestion suggestion="raw-prompt-value">Custom label</Suggestion>);
    expect(screen.getByRole("button", { name: "Custom label" })).toBeInTheDocument();
    expect(screen.queryByText("raw-prompt-value")).not.toBeInTheDocument();
  });

  it("calls onClick with the suggestion string when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Suggestion suggestion="Explain the diff" onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: "Explain the diff" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith("Explain the diff");
  });

  it("fires onClick with the suggestion string even when children override the label", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Suggestion suggestion="prompt-payload" onClick={onClick}>
        Pretty label
      </Suggestion>
    );
    await user.click(screen.getByRole("button", { name: "Pretty label" }));
    expect(onClick).toHaveBeenCalledWith("prompt-payload");
  });

  it("does not throw when clicked without an onClick handler", async () => {
    const user = userEvent.setup();
    render(<Suggestion suggestion="No handler" />);
    await user.click(screen.getByRole("button", { name: "No handler" }));
    expect(screen.getByRole("button", { name: "No handler" })).toBeInTheDocument();
  });

  it("merges a custom className onto the pill", () => {
    render(<Suggestion suggestion="Styled" className="uppercase" />);
    const btn = screen.getByRole("button", { name: "Styled" });
    expect(btn).toHaveClass("uppercase", "shrink-0", "rounded-md");
  });

  it("respects the disabled attribute", () => {
    render(<Suggestion suggestion="Disabled" disabled />);
    expect(screen.getByRole("button", { name: "Disabled" })).toBeDisabled();
  });

  it("forwards arbitrary button attributes", () => {
    render(<Suggestion suggestion="Attrs" data-testid="chip" title="hover me" />);
    const btn = screen.getByTestId("chip");
    expect(btn).toHaveAttribute("title", "hover me");
  });
});
