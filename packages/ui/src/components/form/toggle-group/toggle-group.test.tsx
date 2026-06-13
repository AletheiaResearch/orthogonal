import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ToggleGroup, ToggleGroupItem } from "./index";

describe("ToggleGroup", () => {
  it("renders all items as radios in single mode", () => {
    render(
      <ToggleGroup type="single" aria-label="text alignment">
        <ToggleGroupItem value="left">Left</ToggleGroupItem>
        <ToggleGroupItem value="center">Center</ToggleGroupItem>
        <ToggleGroupItem value="right">Right</ToggleGroupItem>
      </ToggleGroup>
    );

    // Radix ToggleGroup single mode renders items as <button> with role="radio"
    // (radiogroup semantics), so query by the "radio" accessible role.
    expect(screen.getByRole("radio", { name: "Left" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Center" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Right" })).toBeInTheDocument();
  });

  it("reflects the pressed state of the default value", () => {
    render(
      <ToggleGroup type="single" defaultValue="center" aria-label="text alignment">
        <ToggleGroupItem value="left">Left</ToggleGroupItem>
        <ToggleGroupItem value="center">Center</ToggleGroupItem>
      </ToggleGroup>
    );

    expect(screen.getByRole("radio", { name: "Center" })).toHaveAttribute("data-state", "on");
    expect(screen.getByRole("radio", { name: "Left" })).toHaveAttribute("data-state", "off");
  });

  it("fires onValueChange when an item is selected (single)", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <ToggleGroup type="single" aria-label="text alignment" onValueChange={onValueChange}>
        <ToggleGroupItem value="left">Left</ToggleGroupItem>
        <ToggleGroupItem value="right">Right</ToggleGroupItem>
      </ToggleGroup>
    );

    await user.click(screen.getByRole("radio", { name: "Right" }));

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("right");
  });

  it("supports multiple selection", async () => {
    const user = userEvent.setup();

    function Controlled() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <ToggleGroup type="multiple" value={value} onValueChange={setValue} aria-label="formatting">
          <ToggleGroupItem value="bold">Bold</ToggleGroupItem>
          <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
        </ToggleGroup>
      );
    }

    render(<Controlled />);
    const bold = screen.getByRole("button", { name: "Bold" });
    const italic = screen.getByRole("button", { name: "Italic" });

    await user.click(bold);
    await user.click(italic);

    expect(bold).toHaveAttribute("data-state", "on");
    expect(italic).toHaveAttribute("data-state", "on");
  });

  it("applies the size variant inherited from the group context", () => {
    render(
      <ToggleGroup type="single" size="sm" aria-label="text alignment">
        <ToggleGroupItem value="left">Left</ToggleGroupItem>
      </ToggleGroup>
    );

    // The "sm" size variant maps to an h-8 height class in toggleVariants.
    expect(screen.getByRole("radio", { name: "Left" })).toHaveClass("h-8");
  });

  it("merges a custom className onto the group root", () => {
    render(
      <ToggleGroup type="single" aria-label="text alignment" className="custom-group">
        <ToggleGroupItem value="left">Left</ToggleGroupItem>
      </ToggleGroup>
    );

    expect(screen.getByRole("group", { name: "text alignment" })).toHaveClass("custom-group");
  });

  it("does not toggle a disabled item", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <ToggleGroup type="single" aria-label="text alignment" onValueChange={onValueChange}>
        <ToggleGroupItem value="left" disabled>
          Left
        </ToggleGroupItem>
      </ToggleGroup>
    );

    const left = screen.getByRole("radio", { name: "Left" });
    expect(left).toBeDisabled();

    await user.click(left);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
