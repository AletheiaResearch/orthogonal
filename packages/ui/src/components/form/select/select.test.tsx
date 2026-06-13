import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./index";

// Radix Select relies on a handful of DOM APIs that jsdom does not implement.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollTo = vi.fn();

  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function Example({
  onValueChange,
  defaultValue,
}: {
  onValueChange?: (value: string) => void;
  defaultValue?: string;
} = {}) {
  return (
    <Select onValueChange={onValueChange} defaultValue={defaultValue}>
      <SelectTrigger aria-label="Fruit">
        <SelectValue placeholder="Pick a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Fruits</SelectLabel>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectSeparator />
          <SelectItem value="cherry" disabled>
            Cherry
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("renders the trigger with its placeholder and stays closed initially", () => {
    render(<Example />);

    expect(screen.getByRole("combobox", { name: "Fruit" })).toBeInTheDocument();
    expect(screen.getByText("Pick a fruit")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Apple" })).not.toBeInTheDocument();
  });

  it("opens the listbox and shows label and items when the trigger is activated", async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole("combobox", { name: "Fruit" }));

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Fruits")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Apple" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Banana" })).toBeInTheDocument();
  });

  it("fires onValueChange and updates the displayed value when an item is chosen", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Example onValueChange={onValueChange} />);

    await user.click(screen.getByRole("combobox", { name: "Fruit" }));
    await user.click(await screen.findByRole("option", { name: "Banana" }));

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("banana");
    expect(screen.getByRole("combobox", { name: "Fruit" })).toHaveTextContent("Banana");
  });

  it("marks a disabled item as disabled and does not fire onValueChange for it", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Example onValueChange={onValueChange} />);

    await user.click(screen.getByRole("combobox", { name: "Fruit" }));

    const cherry = await screen.findByRole("option", { name: "Cherry" });
    expect(cherry).toHaveAttribute("data-disabled");

    await user.click(cherry);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("reflects a defaultValue on the trigger once the listbox has mounted", async () => {
    const user = userEvent.setup();
    render(<Example defaultValue="apple" />);

    // Capture the trigger before opening: once the listbox mounts, Radix wraps the
    // trigger in an aria-hidden subtree, so role queries can no longer find it. The
    // node reference stays valid, and toHaveTextContent reads its subtree directly.
    const trigger = screen.getByRole("combobox", { name: "Fruit" });
    await user.click(trigger);

    await waitFor(() => expect(trigger).toHaveTextContent("Apple"));
  });

  it("applies the compact density utilities on the trigger", () => {
    render(
      <Select>
        <SelectTrigger density="compact" aria-label="Compact">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">One</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole("combobox", { name: "Compact" });
    expect(trigger).toHaveClass("px-2", "py-1");
    expect(trigger).not.toHaveClass("px-3");
  });

  it("uses the default density utilities when density is not provided", () => {
    render(
      <Select>
        <SelectTrigger aria-label="Default">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">One</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole("combobox", { name: "Default" });
    expect(trigger).toHaveClass("px-3", "py-2");
    expect(trigger).not.toHaveClass("px-2");
  });

  it("forwards a custom className onto the trigger", () => {
    render(
      <Select>
        <SelectTrigger className="custom-trigger" aria-label="Custom">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">One</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByRole("combobox", { name: "Custom" })).toHaveClass("custom-trigger");
  });
});
