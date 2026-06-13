import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Switch } from "./index";

describe("Switch", () => {
  it("renders with role switch", () => {
    render(<Switch aria-label="airplane mode" />);
    expect(screen.getByRole("switch", { name: "airplane mode" })).toBeInTheDocument();
  });

  it("is unchecked by default", () => {
    render(<Switch aria-label="airplane mode" />);
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("respects the defaultChecked prop", () => {
    render(<Switch aria-label="airplane mode" defaultChecked />);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("forwards arbitrary props and merges custom className", () => {
    render(<Switch aria-label="airplane mode" className="custom-class" data-testid="sw" />);
    const sw = screen.getByTestId("sw");
    expect(sw).toHaveClass("custom-class");
    // base utility classes still applied alongside the override
    expect(sw).toHaveClass("peer");
  });

  it("fires onCheckedChange when clicked", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="airplane mode" onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByRole("switch"));

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("toggles its checked state when used as a controlled component", async () => {
    const user = userEvent.setup();

    function Controlled() {
      const [checked, setChecked] = useState(false);
      return <Switch aria-label="airplane mode" checked={checked} onCheckedChange={setChecked} />;
    }

    render(<Controlled />);
    const sw = screen.getByRole("switch");
    expect(sw).not.toBeChecked();

    await user.click(sw);
    expect(sw).toBeChecked();

    await user.click(sw);
    expect(sw).not.toBeChecked();
  });

  it("does not fire onCheckedChange when disabled", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="airplane mode" disabled onCheckedChange={onCheckedChange} />);

    const sw = screen.getByRole("switch");
    expect(sw).toBeDisabled();

    await user.click(sw);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("forwards a ref to the underlying button element", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Switch aria-label="airplane mode" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
