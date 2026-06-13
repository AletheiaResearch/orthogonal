import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Reasoning, ReasoningContent, ReasoningTrigger } from "./index";

/**
 * `Reasoning` is a collapsible display surface for an agent's thinking /
 * reasoning tokens, modelled after the AI-Elements Reasoning family. It is a
 * compound component: `Reasoning` owns the open state and shares it with
 * `ReasoningTrigger` (the clickable header) and `ReasoningContent` (the body)
 * via context.
 *
 * Use it to reveal a model's chain-of-thought beneath a normal chat message.
 * It is fully decoupled from any agent or session protocol — pass the reasoning
 * text as children. While `isStreaming` is true (uncontrolled), it auto-expands
 * so tokens are visible as they arrive, then collapses once thinking completes.
 */
const meta = {
  title: "AI/Reasoning",
  component: Reasoning,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "A collapsible container for agent reasoning tokens. Auto-expands while streaming, shows a `Thinking…` / `Thought for Ns` label, and works in both controlled and uncontrolled modes.",
      },
    },
  },
  argTypes: {
    isStreaming: {
      description:
        "Whether reasoning tokens are still arriving. Drives the default trigger label and, when uncontrolled, auto-expands the panel while active.",
      control: "boolean",
    },
    defaultOpen: {
      description: "Initial open state when the component is uncontrolled. Defaults to `false`.",
      control: "boolean",
    },
    open: {
      description:
        "Controlled open state. When set, the component does not manage its own state — pair with `onOpenChange`.",
      control: false,
    },
    onOpenChange: {
      description: "Called with the requested next open state on every toggle.",
      control: false,
    },
    duration: {
      description:
        "Seconds the model spent thinking, shown in the default completed label (`Thought for Ns`).",
      control: { type: "number" },
    },
    children: {
      description: "Should contain a `ReasoningTrigger` and a `ReasoningContent`.",
      control: false,
    },
  },
  args: {
    isStreaming: false,
    defaultOpen: false,
    duration: 4,
  },
} satisfies Meta<typeof Reasoning>;

export default meta;
type Story = StoryObj<typeof Reasoning>;

const SAMPLE_REASONING =
  "The user wants the total for three items. I'll add 12.50 + 8.00 + 4.25, " +
  "which gives 24.75, then apply the 10% discount to reach a final total of 22.28.";

/**
 * The resting state once thinking has finished: collapsed, showing the
 * `Thought for Ns` label. Click the header to reveal the reasoning.
 */
export const Default: Story = {
  render: (args) => (
    <div className="max-w-md">
      <Reasoning {...args}>
        <ReasoningTrigger />
        <ReasoningContent>{SAMPLE_REASONING}</ReasoningContent>
      </Reasoning>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Collapsed by default after thinking completes. The chevron rotates and the body expands when the header is clicked.",
      },
    },
  },
};

/**
 * Streaming state: the indicator pulses, the label reads `Thinking…`, and the
 * panel is open so tokens are visible as they stream in.
 */
export const Streaming: Story = {
  args: {
    isStreaming: true,
    defaultOpen: true,
  },
  render: (args) => (
    <div className="max-w-md">
      <Reasoning {...args}>
        <ReasoningTrigger />
        <ReasoningContent>{SAMPLE_REASONING}</ReasoningContent>
      </Reasoning>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "While `isStreaming` is true the label shows `Thinking…`, the sparkle pulses, and the content is visible.",
      },
    },
  },
};

/**
 * Completed with a duration — opened to show the finished reasoning and the
 * `Thought for Ns` summary in the header.
 */
export const Completed: Story = {
  args: {
    isStreaming: false,
    defaultOpen: true,
    duration: 12,
  },
  render: (args) => (
    <div className="max-w-md">
      <Reasoning {...args}>
        <ReasoningTrigger />
        <ReasoningContent>{SAMPLE_REASONING}</ReasoningContent>
      </Reasoning>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Finished thinking, expanded, with the `Thought for 12s` summary derived from the `duration` prop.",
      },
    },
  },
};

/**
 * A custom trigger label replaces the default `Thinking…` / `Thought for Ns`
 * text while keeping the chevron and toggle behaviour.
 */
export const CustomTrigger: Story = {
  args: {
    defaultOpen: true,
  },
  render: (args) => (
    <div className="max-w-md">
      <Reasoning {...args}>
        <ReasoningTrigger>Show reasoning steps</ReasoningTrigger>
        <ReasoningContent>{SAMPLE_REASONING}</ReasoningContent>
      </Reasoning>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Passing children to `ReasoningTrigger` overrides the default label entirely.",
      },
    },
  },
};

/**
 * Longer, multi-paragraph reasoning renders comfortably inside the bordered,
 * muted content well.
 */
export const LongContent: Story = {
  args: {
    defaultOpen: true,
    duration: 31,
  },
  render: (args) => (
    <div className="max-w-md">
      <Reasoning {...args}>
        <ReasoningTrigger />
        <ReasoningContent>
          <p className="mb-2">
            First, I need to understand what the user is actually asking for. They mentioned a
            discount, so the order of operations matters: sum first, then discount.
          </p>
          <p className="mb-2">
            Summing the line items: 12.50 + 8.00 + 4.25 = 24.75. That is the pre-discount subtotal.
          </p>
          <p>
            Applying the 10% discount: 24.75 × 0.9 = 22.275, which rounds to 22.28 at two decimal
            places. I'll present that as the final total.
          </p>
        </ReasoningContent>
      </Reasoning>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Rich, multi-paragraph reasoning content inside the expanded panel.",
      },
    },
  },
};

/**
 * Fully controlled usage: a parent owns the open state via `open` +
 * `onOpenChange`. Here an external button and the trigger both drive the same
 * state.
 */
export const Controlled: Story = {
  render: function ControlledStory(args) {
    const [open, setOpen] = useState(false);
    return (
      <div className="flex max-w-md flex-col gap-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="border-border bg-accent text-accent-foreground self-start rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-90"
        >
          {open ? "Hide reasoning" : "Show reasoning"}
        </button>
        <Reasoning {...args} open={open} onOpenChange={setOpen}>
          <ReasoningTrigger />
          <ReasoningContent>{SAMPLE_REASONING}</ReasoningContent>
        </Reasoning>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "Controlled mode — the open state lives in the parent. The external button and the trigger stay in sync through `open` / `onOpenChange`.",
      },
    },
  },
};
