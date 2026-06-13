import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const meta = {
  title: "UI/dropdown-menu",
  component: DropdownMenu,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A menu of actions or options revealed by a trigger button, built on Radix UI. Compose `DropdownMenuTrigger` with a `DropdownMenuContent` containing items, labels, separators, and groups. Use it for contextual actions such as account menus, row actions, or overflow ('more') menus.",
      },
    },
  },
  argTypes: {
    open: {
      description:
        "Controlled open state. Omit for an uncontrolled menu that manages its own visibility.",
      control: "boolean",
    },
    defaultOpen: {
      description: "Open state when the menu is first rendered (uncontrolled).",
      control: "boolean",
    },
    dir: {
      description: "Reading direction of the menu, affecting submenu placement and arrow keys.",
      control: "inline-radio",
      options: ["ltr", "rtl"],
    },
    modal: {
      description: "When true (default), interaction outside the menu is blocked while it is open.",
      control: "boolean",
    },
  },
  args: {
    modal: true,
  },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof DropdownMenu>;

/** The standard account-style menu: a label, separator, and a group of actionable items. */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Default uncontrolled menu. Click the trigger to open it, then choose an item or press Escape to dismiss.",
      },
    },
  },
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
        Open menu
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Billing</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

/** Items can show a trailing keyboard shortcut hint via `DropdownMenuShortcut`. */
export const WithShortcuts: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Each item pairs an action with a right-aligned shortcut hint, useful for power-user surfaces.",
      },
    },
  },
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
        Actions
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuItem>
          New File
          <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          Save
          <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          Search
          <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

/** Disabled items are dimmed and cannot be selected or focused. */
export const WithDisabledItem: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The 'Billing' item is disabled — it renders at reduced opacity and ignores pointer and keyboard selection.",
      },
    },
  },
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
        Open menu
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuItem>Profile</DropdownMenuItem>
        <DropdownMenuItem disabled>Billing</DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

/** Inset items align their text with sibling items that have a leading icon or checkbox. */
export const InsetItems: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The `inset` prop adds left padding so label-less items line up beneath an inset label.",
      },
    },
  },
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
        View
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel inset>Appearance</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem inset>Compact</DropdownMenuItem>
        <DropdownMenuItem inset>Comfortable</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

/** Group related items with a label and separators for a richer menu. */
export const Grouped: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Multiple groups separated by `DropdownMenuSeparator`, each introduced by a `DropdownMenuLabel`.",
      },
    },
  },
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
        Menu
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Team</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>Invite members</DropdownMenuItem>
          <DropdownMenuItem>Manage roles</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

/** Drive open state and a selected radio value from parent state. */
export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A controlled menu whose `open` state and a radio-group selection are held in local component state. The current selection is shown beneath the trigger.",
      },
    },
  },
  render: function ControlledExample(args) {
    const [open, setOpen] = React.useState(false);
    const [position, setPosition] = React.useState("top");

    return (
      <div className="space-y-2">
        <DropdownMenu {...args} open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
            Panel position
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Position</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={position} onValueChange={setPosition}>
              <DropdownMenuItem onSelect={() => setPosition("top")}>Top</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPosition("bottom")}>Bottom</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPosition("right")}>Right</DropdownMenuItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-muted-foreground text-sm">
          Selected: {position} (menu {open ? "open" : "closed"})
        </p>
      </div>
    );
  },
};
