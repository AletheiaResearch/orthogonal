import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./index";

/**
 * `Tooltip` shows a brief, contextual label when the user hovers or focuses a
 * trigger element, built on Radix UI's tooltip primitive. Use it for terse
 * supplementary hints — icon-button labels, truncated text, or shortcut
 * reminders — not for rich interactive content (reach for `Popover` instead).
 *
 * It is a compound component: wrap your app (or a story) in a single
 * `TooltipProvider`, then compose `Tooltip` (the root) with `TooltipTrigger`
 * and `TooltipContent`. Tooltips open on hover and on keyboard focus, making
 * them accessible by default.
 */
const meta = {
  title: "UI/tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A non-interactive hover/focus hint built on Radix UI. Use it for short labels and supplementary text on triggers such as icon buttons; for interactive or richer content use Popover instead. Requires a surrounding TooltipProvider.",
      },
    },
  },
  argTypes: {
    open: {
      description:
        "Controlled open state. When provided, the tooltip becomes controlled and you must update it via `onOpenChange`.",
      control: "boolean",
    },
    defaultOpen: {
      description: "Open state on first mount when the tooltip is uncontrolled.",
      control: "boolean",
    },
    delayDuration: {
      description:
        "Milliseconds to wait after the pointer enters the trigger before the tooltip opens. Overrides the provider's `delayDuration` for this tooltip.",
      control: { type: "number" },
    },
    onOpenChange: {
      description: "Callback fired whenever the open state changes.",
      action: "openChange",
    },
  },
  args: {
    defaultOpen: false,
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof Tooltip>;

/**
 * The default, uncontrolled tooltip. Hover or focus the trigger to reveal a
 * short label after the provider's delay.
 */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Baseline uncontrolled tooltip revealed by hovering or focusing its trigger.",
      },
    },
  },
  render: (args) => (
    <TooltipProvider>
      <div className="flex justify-center p-12">
        <Tooltip {...args}>
          <TooltipTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
            Hover me
          </TooltipTrigger>
          <TooltipContent>Add to library</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  ),
};

/**
 * Mounts already open via `defaultOpen` so the content is visible without
 * interaction — handy for documenting the tooltip's appearance and styling.
 */
export const DefaultOpen: Story = {
  args: { defaultOpen: true },
  parameters: {
    docs: {
      description: {
        story: "Tooltip rendered open on mount using the `defaultOpen` prop.",
      },
    },
  },
  render: (args) => (
    <TooltipProvider>
      <div className="flex justify-center p-16">
        <Tooltip {...args}>
          <TooltipTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
            Settings
          </TooltipTrigger>
          <TooltipContent>Open settings</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  ),
};

/**
 * Opens instantly by setting `delayDuration` to `0`, removing the default hover
 * delay. Useful for snappy, dense UIs where hints should appear immediately.
 */
export const NoDelay: Story = {
  args: { delayDuration: 0 },
  parameters: {
    docs: {
      description: {
        story:
          "Tooltip configured with `delayDuration={0}` so it appears the instant the trigger is hovered or focused.",
      },
    },
  },
  render: (args) => (
    <TooltipProvider>
      <div className="flex justify-center p-12">
        <Tooltip {...args}>
          <TooltipTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
            Instant
          </TooltipTrigger>
          <TooltipContent>No delay before showing</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  ),
};

/**
 * Demonstrates the four `side` placements available on `TooltipContent`. Each
 * trigger anchors its tooltip to a different edge.
 */
export const Sides: Story = {
  args: { defaultOpen: true },
  parameters: {
    docs: {
      description: {
        story:
          "All four `side` placements (top, right, bottom, left) on `TooltipContent`, each shown open.",
      },
    },
  },
  render: (args) => (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-12 p-20">
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <Tooltip key={side} {...args}>
            <TooltipTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
              {side}
            </TooltipTrigger>
            <TooltipContent side={side}>Placed on {side}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  ),
};

/**
 * Pairs the tooltip with an icon-only trigger — its most common real-world use,
 * giving the control an accessible, visible label on hover and focus.
 */
export const OnIconButton: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Tooltip labeling an icon-only button, the canonical pattern for making compact controls discoverable.",
      },
    },
  },
  render: (args) => (
    <TooltipProvider>
      <div className="flex justify-center p-12">
        <Tooltip {...args}>
          <TooltipTrigger
            aria-label="Add item"
            className="border-border flex h-9 w-9 items-center justify-center rounded-md border text-lg"
          >
            +
          </TooltipTrigger>
          <TooltipContent>Add item</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  ),
};

/**
 * A fully controlled tooltip whose open state lives in parent React state and
 * is toggled by an external button. Use this pattern when a tooltip's
 * visibility must coordinate with other UI rather than respond only to hover.
 */
export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Controlled open state managed by parent React state with `open` and `onOpenChange`, toggled from outside the trigger.",
      },
    },
  },
  render: function ControlledStory(args) {
    const [open, setOpen] = React.useState(false);
    return (
      <TooltipProvider delayDuration={0}>
        <div className="grid justify-center gap-3 p-12 text-center">
          <p className="text-muted-foreground text-sm">Tooltip is {open ? "open" : "closed"}.</p>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="border-border rounded-md border px-3 py-1.5 text-sm"
          >
            Toggle externally
          </button>
          <Tooltip {...args} open={open} onOpenChange={setOpen}>
            <TooltipTrigger className="border-border rounded-md border px-3 py-1.5 text-sm">
              Anchor
            </TooltipTrigger>
            <TooltipContent>Open state is owned by the parent.</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  },
};
