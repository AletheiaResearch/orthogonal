import type { Meta, StoryObj } from "@storybook/react-vite";
import { Check, Copy, RefreshCw, Share2, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import * as React from "react";

import { Action, Actions } from "./index";

/**
 * `Actions` is a horizontal row of icon-button controls attached to a message —
 * copy, retry, thumbs up/down, share, and so on. Each `Action` is a tooltipped
 * ghost icon button that fades in on the row's hover or keyboard focus, keeping
 * the surface calm until the user reaches for it.
 *
 * It is fully decoupled from any agent or message protocol: you wire up the
 * icons and `onClick` handlers, and it handles layout, reveal-on-hover, tooltips
 * and accessible labels.
 */
const meta = {
  title: "AI/Actions",
  component: Actions,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A hover-revealed row of tooltipped icon-button actions (copy, retry, feedback) for attaching to an assistant message. Decoupled from any session/agent types — supply your own icons and handlers via `Action`.",
      },
    },
  },
  argTypes: {
    children: {
      description: "The `Action` buttons (or arbitrary nodes) rendered in the row.",
      control: false,
    },
    className: {
      description: "Extra classes merged onto the row container.",
      control: "text",
    },
  },
  args: {},
} satisfies Meta<typeof Actions>;

export default meta;
type Story = StoryObj<typeof Actions>;

/**
 * The canonical message footer: copy, retry, and thumbs up/down. Hover the row
 * (or tab into it) to reveal the buttons; hover an individual button to see its
 * tooltip.
 */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Standard copy / retry / feedback row. Buttons fade in on hover or keyboard focus of the row.",
      },
    },
  },
  render: (args) => (
    <div className="border-border bg-card text-card-foreground max-w-md rounded-md border p-4">
      <p className="mb-2 text-sm">
        Orthogonality means the basis vectors are mutually perpendicular — each carries information
        the others do not.
      </p>
      <Actions {...args}>
        <Action label="Copy">
          <Copy />
        </Action>
        <Action label="Retry">
          <RefreshCw />
        </Action>
        <Action label="Good response" tooltip="Good response">
          <ThumbsUp />
        </Action>
        <Action label="Bad response" tooltip="Bad response">
          <ThumbsDown />
        </Action>
      </Actions>
    </div>
  ),
};

/**
 * The reveal-on-hover behavior makes the row unobtrusive in a list of messages.
 * Hover any message below to surface its actions.
 */
export const RevealOnHover: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Three stacked messages. Each row's actions stay hidden until you hover or focus that message, demonstrating the `group` reveal pattern.",
      },
    },
  },
  render: (args) => (
    <div className="flex max-w-md flex-col gap-1">
      {[
        "Vectors that are orthogonal have a dot product of zero.",
        "A basis is orthonormal when its vectors are orthogonal and unit length.",
        "Gram–Schmidt turns any basis into an orthogonal one.",
      ].map((text) => (
        <div key={text} className="hover:bg-muted rounded-md p-3 text-sm transition-colors">
          <p className="mb-1">{text}</p>
          <Actions {...args}>
            <Action label="Copy">
              <Copy />
            </Action>
            <Action label="Retry">
              <RefreshCw />
            </Action>
            <Action label="Read aloud">
              <Volume2 />
            </Action>
          </Actions>
        </div>
      ))}
    </div>
  ),
};

/**
 * Set `revealOnHover={false}` on the primary action so it is always visible,
 * while secondary actions stay hidden until hover.
 */
export const AlwaysVisiblePrimary: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Copy stays pinned at full opacity (`revealOnHover={false}`); the remaining actions fade in only on hover or focus.",
      },
    },
  },
  render: (args) => (
    <div className="border-border bg-card text-card-foreground max-w-md rounded-md border p-4">
      <p className="mb-2 text-sm">A pinned primary action plus quiet extras.</p>
      <Actions {...args}>
        <Action label="Copy" revealOnHover={false}>
          <Copy />
        </Action>
        <Action label="Retry">
          <RefreshCw />
        </Action>
        <Action label="Share">
          <Share2 />
        </Action>
      </Actions>
    </div>
  ),
};

/**
 * A controlled copy action that swaps its icon and tooltip to confirm the copy
 * succeeded — the typical interactive pattern for a copy button.
 */
export const CopyWithFeedback: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Clicking Copy stores text on the clipboard and briefly swaps to a check icon with a `Copied!` tooltip, then reverts.",
      },
    },
  },
  render: function CopyStory(args) {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
      void navigator.clipboard?.writeText("Orthogonal");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };

    return (
      <div className="border-border bg-card text-card-foreground max-w-md rounded-md border p-4">
        <p className="mb-2 text-sm">Click the copy button to see feedback.</p>
        <Actions {...args}>
          <Action
            label={copied ? "Copied" : "Copy"}
            tooltip={copied ? "Copied!" : "Copy"}
            onClick={handleCopy}
            revealOnHover={false}
          >
            {copied ? <Check className="text-success" /> : <Copy />}
          </Action>
        </Actions>
      </div>
    );
  },
};

/**
 * A single standalone `Action` works without an `Actions` wrapper and provides
 * its own tooltip provider.
 */
export const SingleAction: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "One `Action` used on its own. It is always visible (no row to reveal it) and brings its own `TooltipProvider`.",
      },
    },
  },
  render: () => (
    <Action label="Copy" tooltip="Copy to clipboard" revealOnHover={false}>
      <Copy />
    </Action>
  ),
};
