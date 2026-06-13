import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Toggle } from "./index";

describe("Toggle", () => {
  it("renders with role button and accessible name", () => {
    render(<Toggle aria-label="Bold">B</Toggle>);
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
  });

  it("is not pressed by default", () => {
    render(<Toggle aria-label="Bold">B</Toggle>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button")).toHaveAttribute("data-state", "off");
  });

  it("respects the defaultPressed prop", () => {
    render(
      <Toggle aria-label="Bold" defaultPressed>
        B
      </Toggle>
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button")).toHaveAttribute("data-state", "on");
  });

  it("applies the default variant and size classes", () => {
    render(
      <Toggle aria-label="Bold" data-testid="toggle">
        B
      </Toggle>
    );
    const toggle = screen.getByTestId("toggle");
    // default variant
    expect(toggle).toHaveClass("bg-transparent");
    // default size
    expect(toggle).toHaveClass("h-9");
  });

  it("applies the outline variant and lg size classes", () => {
    render(
      <Toggle aria-label="Bold" data-testid="toggle" size="lg" variant="outline">
        B
      </Toggle>
    );
    const toggle = screen.getByTestId("toggle");
    expect(toggle).toHaveClass("border");
    expect(toggle).toHaveClass("border-input");
    expect(toggle).toHaveClass("h-10");
  });

  it("applies the sm size classes", () => {
    render(
      <Toggle aria-label="Bold" data-testid="toggle" size="sm">
        B
      </Toggle>
    );
    expect(screen.getByTestId("toggle")).toHaveClass("h-8");
  });

  it("merges a custom className with the base classes", () => {
    render(
      <Toggle aria-label="Bold" className="custom-class" data-testid="toggle">
        B
      </Toggle>
    );
    const toggle = screen.getByTestId("toggle");
    expect(toggle).toHaveClass("custom-class");
    // base utility classes still applied alongside the override
    expect(toggle).toHaveClass("inline-flex");
  });

  it("fires onPressedChange when clicked", async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(
      <Toggle aria-label="Bold" onPressedChange={onPressedChange}>
        B
      </Toggle>
    );

    await user.click(screen.getByRole("button"));

    expect(onPressedChange).toHaveBeenCalledTimes(1);
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  it("toggles its pressed state when used as a controlled component", async () => {
    const user = userEvent.setup();

    function Controlled() {
      const [pressed, setPressed] = useState(false);
      return (
        <Toggle aria-label="Bold" pressed={pressed} onPressedChange={setPressed}>
          B
        </Toggle>
      );
    }

    render(<Controlled />);
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("does not fire onPressedChange when disabled", async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(
      <Toggle aria-label="Bold" disabled onPressedChange={onPressedChange}>
        B
      </Toggle>
    );

    const toggle = screen.getByRole("button");
    expect(toggle).toBeDisabled();

    await user.click(toggle);
    expect(onPressedChange).not.toHaveBeenCalled();
  });

  it("forwards a ref to the underlying button element", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(
      <Toggle aria-label="Bold" ref={ref}>
        B
      </Toggle>
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
