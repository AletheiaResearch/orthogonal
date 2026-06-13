import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("renders a checkbox with role checkbox", () => {
    render(<Checkbox aria-label="accept" />);
    expect(screen.getByRole("checkbox", { name: "accept" })).toBeInTheDocument();
  });

  it("is unchecked by default", () => {
    render(<Checkbox aria-label="accept" />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("respects the defaultChecked prop", () => {
    render(<Checkbox aria-label="accept" defaultChecked />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("forwards arbitrary props and merges custom className", () => {
    render(<Checkbox aria-label="accept" className="custom-class" data-testid="cb" />);
    const checkbox = screen.getByTestId("cb");
    expect(checkbox).toHaveClass("custom-class");
    // base utility classes still applied alongside the override
    expect(checkbox).toHaveClass("peer");
  });

  it("fires onCheckedChange when clicked", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="accept" onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByRole("checkbox"));

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("toggles its checked state when used as a controlled component", async () => {
    const user = userEvent.setup();

    function Controlled() {
      const [checked, setChecked] = useState(false);
      return (
        <Checkbox
          aria-label="accept"
          checked={checked}
          onCheckedChange={(c) => setChecked(c === true)}
        />
      );
    }

    render(<Controlled />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("does not fire onCheckedChange when disabled", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="accept" disabled onCheckedChange={onCheckedChange} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();

    await user.click(checkbox);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("forwards a ref to the underlying button element", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Checkbox aria-label="accept" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
