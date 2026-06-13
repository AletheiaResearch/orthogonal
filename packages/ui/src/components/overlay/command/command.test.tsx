import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./index";

// cmdk scrolls the active item into view on selection changes; jsdom has no layout
// engine, so the API is missing. Stub it before any command renders.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Command", () => {
  it("renders a searchable list of items", () => {
    render(
      <Command>
        <CommandInput placeholder="Type a command..." />
        <CommandList>
          <CommandGroup heading="Suggestions">
            <CommandItem>Calendar</CommandItem>
            <CommandItem>Search</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    );

    expect(screen.getByPlaceholderText("Type a command...")).toBeInTheDocument();
    expect(screen.getByText("Suggestions")).toBeInTheDocument();
    expect(screen.getByText("Calendar")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("merges a custom className onto the root container", () => {
    const { container } = render(
      <Command className="custom-root">
        <CommandList>
          <CommandItem>Item</CommandItem>
        </CommandList>
      </Command>
    );

    const root = container.querySelector("[cmdk-root]");
    expect(root).toHaveClass("custom-root");
    // base class still applied
    expect(root).toHaveClass("flex");
  });

  it("forwards the ref to the underlying input element", () => {
    const ref = React.createRef<HTMLInputElement>();
    render(
      <Command>
        <CommandInput ref={ref} placeholder="Ref input" />
      </Command>
    );

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current).toBe(screen.getByPlaceholderText("Ref input"));
  });

  it("filters items as the user types and shows the empty state", async () => {
    const user = userEvent.setup();
    render(
      <Command>
        <CommandInput placeholder="Search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Items">
            <CommandItem>Apple</CommandItem>
            <CommandItem>Banana</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    );

    // initially everything is shown, empty state hidden
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.queryByText("No results found.")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search..."), "App");

    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.queryByText("Banana")).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("Search..."));
    await user.type(screen.getByPlaceholderText("Search..."), "xyz");

    expect(screen.queryByText("Apple")).not.toBeInTheDocument();
    expect(screen.getByText("No results found.")).toBeInTheDocument();
  });

  it("fires onSelect when an item is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Command>
        <CommandList>
          <CommandItem onSelect={onSelect}>Run</CommandItem>
        </CommandList>
      </Command>
    );

    await user.click(screen.getByText("Run"));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not fire onSelect for a disabled item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Command>
        <CommandList>
          <CommandItem disabled onSelect={onSelect}>
            Disabled
          </CommandItem>
        </CommandList>
      </Command>
    );

    await user.click(screen.getByText("Disabled"));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders a separator with the merged className", () => {
    const { container } = render(
      <Command>
        <CommandList>
          <CommandItem>One</CommandItem>
          <CommandSeparator className="my-separator" />
          <CommandItem>Two</CommandItem>
        </CommandList>
      </Command>
    );

    const separator = container.querySelector("[cmdk-separator]");
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveClass("my-separator");
    expect(separator).toHaveClass("bg-border");
  });

  it("renders a shortcut hint as a span passing through native props", () => {
    render(
      <Command>
        <CommandList>
          <CommandItem>
            Open
            <CommandShortcut data-testid="shortcut">⌘O</CommandShortcut>
          </CommandItem>
        </CommandList>
      </Command>
    );

    const shortcut = screen.getByTestId("shortcut");
    expect(shortcut.tagName).toBe("SPAN");
    expect(shortcut).toHaveTextContent("⌘O");
    expect(shortcut).toHaveClass("ml-auto");
  });
});
