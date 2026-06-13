import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./index";

/**
 * `Popover` displays floating content anchored to a trigger element, built on
 * Radix UI's popover primitive. Use it for transient, non-modal overlays such
 * as settings panels, quick forms, or contextual help that should dismiss when
 * the user clicks outside or presses Escape.
 *
 * It is a compound component: compose `Popover` (the root) with
 * `PopoverTrigger`, `PopoverContent`, and optionally `PopoverAnchor`.
 */
const meta = {
  title: "UI/popover",
  component: Popover,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A non-modal floating overlay anchored to a trigger, built on Radix UI. Use it for contextual panels, quick forms, and inline help that dismiss on outside click or Escape.",
      },
    },
  },
  argTypes: {
    open: {
      description:
        "Controlled open state. When provided, the popover becomes controlled and you must update it via `onOpenChange`.",
      control: "boolean",
    },
    defaultOpen: {
      description: "Open state on first mount when the popover is uncontrolled.",
      control: "boolean",
    },
    modal: {
      description:
        "When `true`, interaction with outside elements is blocked and focus is trapped inside the popover.",
      control: "boolean",
    },
    onOpenChange: {
      description: "Callback fired whenever the open state changes.",
      action: "openChange",
    },
  },
  args: {
    defaultOpen: false,
    modal: false,
  },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof Popover>;

/**
 * The default, uncontrolled popover. Clicking the trigger toggles a simple
 * informational panel.
 */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Baseline uncontrolled popover toggled by its trigger button.",
      },
    },
  },
  render: (args) => (
    <Popover {...args}>
      <PopoverTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
        Open popover
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-sm">
          This is a popover. It floats above the page and closes when you click outside or press
          Escape.
        </p>
      </PopoverContent>
    </Popover>
  ),
};

/**
 * Mounts already open via `defaultOpen` so the content is visible without
 * interaction — handy for documenting the panel's appearance.
 */
export const DefaultOpen: Story = {
  args: { defaultOpen: true },
  parameters: {
    docs: {
      description: {
        story: "Popover rendered open on mount using the `defaultOpen` prop.",
      },
    },
  },
  render: (args) => (
    <Popover {...args}>
      <PopoverTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
        Settings
      </PopoverTrigger>
      <PopoverContent>
        <div className="grid gap-2">
          <p className="text-sm font-medium leading-none">Dimensions</p>
          <p className="text-muted-foreground text-sm">Set the dimensions for the layer.</p>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

/**
 * A richer panel containing a small form, demonstrating how interactive
 * controls live inside `PopoverContent`.
 */
export const WithForm: Story = {
  parameters: {
    docs: {
      description: {
        story: "Popover hosting form controls — a common pattern for inline quick-edit panels.",
      },
    },
  },
  render: (args) => (
    <Popover {...args}>
      <PopoverTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
        Edit profile
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <form className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              defaultValue="Ada Lovelace"
              className="border-border rounded-md border px-2 py-1 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="role">
              Role
            </label>
            <input
              id="role"
              defaultValue="Engineer"
              className="border-border rounded-md border px-2 py-1 text-sm"
            />
          </div>
        </form>
      </PopoverContent>
    </Popover>
  ),
};

/**
 * Demonstrates `align` and `side` placement options on `PopoverContent`,
 * positioning the panel to the right and aligned to the start of the trigger.
 */
export const Positioned: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Custom placement via `side` and `align` on `PopoverContent` (here: right side, start-aligned).",
      },
    },
  },
  render: (args) => (
    <div className="flex justify-center p-12">
      <Popover {...args}>
        <PopoverTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
          Open to the right
        </PopoverTrigger>
        <PopoverContent side="right" align="start">
          <p className="text-sm">
            This content is anchored to the right side, aligned to the start edge of the trigger.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

/**
 * Uses `PopoverAnchor` to detach positioning from the trigger: the popover
 * opens relative to a separate anchored element rather than the button.
 */
export const WithAnchor: Story = {
  args: { defaultOpen: true },
  parameters: {
    docs: {
      description: {
        story:
          "Positioning anchored to a separate element via `PopoverAnchor`, decoupled from the trigger.",
      },
    },
  },
  render: (args) => (
    <Popover {...args}>
      <PopoverAnchor asChild>
        <div className="bg-muted mx-auto w-fit rounded-md px-6 py-3 text-sm">Anchored element</div>
      </PopoverAnchor>
      <PopoverTrigger className="sr-only">Open</PopoverTrigger>
      <PopoverContent>
        <p className="text-sm">This popover is positioned by the anchor above.</p>
      </PopoverContent>
    </Popover>
  ),
};

/**
 * A fully controlled popover whose open state lives in parent React state and
 * is reflected by an external label. Use this pattern when the popover's
 * visibility must coordinate with other UI.
 */
export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Controlled open state managed by parent React state with `open` and `onOpenChange`.",
      },
    },
  },
  render: function ControlledStory(args) {
    const [open, setOpen] = React.useState(false);
    return (
      <div className="grid gap-3">
        <p className="text-muted-foreground text-sm">Popover is {open ? "open" : "closed"}.</p>
        <Popover {...args} open={open} onOpenChange={setOpen}>
          <PopoverTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
            Toggle popover
          </PopoverTrigger>
          <PopoverContent>
            <p className="text-sm">Open state is owned by the parent component.</p>
          </PopoverContent>
        </Popover>
      </div>
    );
  },
};
