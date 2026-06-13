import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Button } from "../primitives/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./command";

const meta = {
  title: "UI/command",
  component: Command,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A fast, composable command menu built on cmdk. Compose `CommandInput`, `CommandList`, " +
          "`CommandGroup`, `CommandItem`, `CommandSeparator`, `CommandEmpty`, and `CommandShortcut` " +
          "to build keyboard-driven palettes, type-ahead pickers, and `⌘K`-style launchers. Wrap it " +
          "in `CommandDialog` to present it as a modal overlay.",
      },
    },
  },
  argTypes: {
    className: {
      description: "Additional classes merged onto the root container.",
      control: "text",
    },
    label: {
      description: "Accessible label announced to screen readers for the command menu.",
      control: "text",
    },
    shouldFilter: {
      description:
        "Whether cmdk filters items client-side as the user types. Disable when filtering server-side.",
      control: "boolean",
    },
    loop: {
      description: "Whether arrow-key navigation wraps from the last item back to the first.",
      control: "boolean",
    },
  },
  args: {
    label: "Command menu",
  },
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof Command>;

/** The default command menu with a search input, a grouped list, and an empty state. */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The baseline composition. Type in the input to filter items; clearing to a non-matching " +
          "query reveals the `CommandEmpty` fallback.",
      },
    },
  },
  render: (args) => (
    <Command {...args} className="w-[420px] rounded-lg border shadow-md">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>Calendar</CommandItem>
          <CommandItem>Search Emoji</CommandItem>
          <CommandItem>Calculator</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

/** Multiple groups divided by a `CommandSeparator`, each with shortcut hints. */
export const Grouped: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Organize related actions into `CommandGroup` sections separated by `CommandSeparator`, " +
          "and surface keyboard hints with `CommandShortcut`.",
      },
    },
  },
  render: (args) => (
    <Command {...args} className="w-[420px] rounded-lg border shadow-md">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            Calendar
            <CommandShortcut>⌘C</CommandShortcut>
          </CommandItem>
          <CommandItem>
            Search Emoji
            <CommandShortcut>⌘E</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>
            Profile
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem>
            Billing
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
          <CommandItem disabled>
            Disabled action
            <CommandShortcut>⌘D</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

/** The empty state shown when no items match the active query. */
export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "When filtering removes every item, `CommandEmpty` renders its children. Here the input is " +
          "pre-filled with a non-matching query.",
      },
    },
  },
  render: (args) => (
    <Command {...args} className="w-[420px] rounded-lg border shadow-md">
      <CommandInput placeholder="Type a command or search..." defaultValue="zzzzz" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>Calendar</CommandItem>
          <CommandItem>Search Emoji</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

/** A modal command palette toggled via `CommandDialog`, the common `⌘K` pattern. */
export const Dialog: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Wrap the menu in `CommandDialog` to present it as an overlay. This wrapper also listens for " +
          "`⌘K` / `Ctrl+K` to toggle, mirroring how a global launcher is usually wired up.",
      },
    },
  },
  render: () => {
    const DialogExample = () => {
      const [open, setOpen] = React.useState(false);

      React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
          if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            setOpen((value) => !value);
          }
        };
        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
      }, []);

      return (
        <>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Open command menu
            <CommandShortcut className="text-muted-foreground ml-2">⌘K</CommandShortcut>
          </Button>
          <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Suggestions">
                <CommandItem onSelect={() => setOpen(false)}>Calendar</CommandItem>
                <CommandItem onSelect={() => setOpen(false)}>Search Emoji</CommandItem>
                <CommandItem onSelect={() => setOpen(false)}>Calculator</CommandItem>
              </CommandGroup>
            </CommandList>
          </CommandDialog>
        </>
      );
    };

    return <DialogExample />;
  },
};
