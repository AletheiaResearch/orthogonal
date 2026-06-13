import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Suggestion, Suggestions } from "./suggestion";

const meta = {
  title: "AI/Suggestion",
  component: Suggestion,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A horizontally scrollable row of clickable prompt-suggestion chips for an empty composer. `Suggestions` is the scroll container; each `Suggestion` is a pill button whose `suggestion` text is both the label and the value handed back to `onClick`. Fully decoupled — it knows nothing about agents or sessions.",
      },
    },
  },
  argTypes: {
    suggestion: {
      description:
        "The prompt text the chip represents. Doubles as the default label and as the value passed to `onClick`.",
      control: "text",
    },
    children: {
      description: "Optional custom label that overrides the displayed `suggestion` text.",
      control: "text",
    },
    onClick: {
      description:
        "Called with the `suggestion` string (not a DOM event) when the chip is clicked.",
      action: "selected",
    },
    disabled: {
      description: "Disables the chip, preventing clicks.",
      control: "boolean",
    },
    className: {
      description: "Additional Tailwind classes merged onto the pill via `cn`.",
      control: "text",
    },
  },
  args: {
    suggestion: "Summarize this conversation",
  },
} satisfies Meta<typeof Suggestion>;

export default meta;
type Story = StoryObj<typeof Suggestion>;

const SAMPLE_PROMPTS = [
  "Summarize this conversation",
  "What changed in the last commit?",
  "Write a unit test for this file",
  "Explain this error message",
  "Refactor this function for clarity",
  "Draft a PR description",
];

/** A single chip rendered on its own. The `suggestion` text is the label. */
export const Single: Story = {
  parameters: {
    docs: {
      description: { story: "A lone suggestion pill. Click it to fire `onClick(suggestion)`." },
    },
  },
};

/** The label can be overridden with `children` while `onClick` still receives the raw `suggestion`. */
export const CustomLabel: Story = {
  args: {
    suggestion: "generate-changelog",
    children: "Generate a changelog",
  },
  parameters: {
    docs: {
      description: {
        story:
          "`children` overrides the visible label (here a human-friendly string), yet `onClick` still fires with the underlying `suggestion` payload (`generate-changelog`).",
      },
    },
  },
};

/** A disabled chip ignores clicks and dims to the standard disabled opacity. */
export const Disabled: Story = {
  args: { suggestion: "Unavailable action", disabled: true },
  parameters: {
    docs: { description: { story: "A disabled suggestion — non-interactive and visually muted." } },
  },
};

/** A handful of chips in the scroll row, the typical empty-composer layout. */
export const Row: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Several suggestions laid out in a `Suggestions` row, as shown beneath an empty composer.",
      },
    },
  },
  render: () => (
    <Suggestions className="max-w-2xl">
      {SAMPLE_PROMPTS.slice(0, 4).map((prompt) => (
        <Suggestion key={prompt} suggestion={prompt} />
      ))}
    </Suggestions>
  ),
};

/** When the chips overflow, the row scrolls horizontally instead of wrapping. */
export const ScrollingRow: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A constrained-width row with more chips than fit. The row scrolls horizontally — drag or shift-scroll to reveal the rest.",
      },
    },
  },
  render: () => (
    <Suggestions className="max-w-md">
      {SAMPLE_PROMPTS.map((prompt) => (
        <Suggestion key={prompt} suggestion={prompt} />
      ))}
    </Suggestions>
  ),
};

/** A realistic, interactive empty composer that fills its input from the chosen suggestion. */
export const InteractiveComposer: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Clicking a suggestion writes its text into the composer below, demonstrating the `onClick(suggestion)` contract end to end.",
      },
    },
  },
  render: () => {
    const ComposerDemo = () => {
      const [value, setValue] = React.useState("");
      return (
        <div className="flex w-full max-w-xl flex-col gap-3">
          <Suggestions>
            {SAMPLE_PROMPTS.slice(0, 5).map((prompt) => (
              <Suggestion key={prompt} suggestion={prompt} onClick={setValue} />
            ))}
          </Suggestions>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask anything…"
            rows={3}
            className="border-border bg-input text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
        </div>
      );
    };
    return <ComposerDemo />;
  },
};
