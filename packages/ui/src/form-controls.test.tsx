import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RadioCard } from "./form-controls";

describe("RadioCard", () => {
  it("renders the label", () => {
    render(<RadioCard label="Standard plan" />);

    expect(screen.getByText("Standard plan")).toBeInTheDocument();
    expect(screen.getByRole("radio")).toBeInTheDocument();
  });

  it("renders the description when provided", () => {
    render(<RadioCard label="Standard plan" description="Best for small teams" />);

    expect(screen.getByText("Best for small teams")).toBeInTheDocument();
  });

  it("omits the description when not provided", () => {
    render(<RadioCard label="Standard plan" />);

    expect(screen.queryByText("Best for small teams")).not.toBeInTheDocument();
  });

  it("reflects the checked prop", () => {
    render(<RadioCard label="Standard plan" checked readOnly />);

    expect(screen.getByRole("radio")).toBeChecked();
  });

  it("is unchecked by default", () => {
    render(<RadioCard label="Standard plan" />);

    expect(screen.getByRole("radio")).not.toBeChecked();
  });

  it("fires onChange when the control is activated", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RadioCard label="Standard plan" onChange={onChange} />);
    await user.click(screen.getByRole("radio"));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("forwards arbitrary input attributes to the underlying radio", () => {
    render(<RadioCard label="Standard plan" name="plan" value="standard" disabled />);

    const radio = screen.getByRole("radio");
    expect(radio).toHaveAttribute("name", "plan");
    expect(radio).toHaveAttribute("value", "standard");
    expect(radio).toBeDisabled();
  });

  it("merges custom className onto the label wrapper", () => {
    render(<RadioCard label="Standard plan" className="custom-class" />);

    expect(screen.getByText("Standard plan").closest("label")).toHaveClass("custom-class");
  });
});
