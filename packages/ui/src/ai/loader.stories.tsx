import type { Meta, StoryObj } from "@storybook/react-vite";

import { Loader, TextShimmer } from "./loader";

const meta = {
  title: "AI/Loader",
  component: Loader,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'Lightweight, decoupled inline loading indicators for AI/streaming UIs. `Loader` is a minimal spinner that inherits the surrounding text color; `TextShimmer` animates transient status copy like "Thinking…" or "Connecting…" with a sweeping highlight. Both are purely presentational and protocol-agnostic.',
      },
    },
  },
  argTypes: {
    size: {
      description: "Diameter of the spinner in pixels.",
      control: { type: "number", min: 8, max: 64, step: 2 },
      table: { defaultValue: { summary: "16" } },
    },
    className: {
      description:
        "Additional Tailwind classes merged via `cn`. Use a `text-*` class to retint the spinner (it inherits `currentColor`).",
      control: "text",
    },
  },
  args: {
    size: 16,
  },
} satisfies Meta<typeof Loader>;

export default meta;
type Story = StoryObj<typeof Loader>;

export const Default: Story = {
  parameters: {
    docs: { description: { story: "The default 16px muted spinner." } },
  },
};

export const Large: Story = {
  args: { size: 32 },
  parameters: {
    docs: { description: { story: "A larger 32px spinner driven by the `size` prop." } },
  },
};

export const Sizes: Story = {
  parameters: {
    docs: {
      description: { story: "The spinner scales smoothly across sizes via the `size` prop." },
    },
  },
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
      <Loader size={12} />
      <Loader size={16} />
      <Loader size={24} />
      <Loader size={32} />
      <Loader size={48} />
    </div>
  ),
};

export const Tinted: Story = {
  args: { size: 24, className: "text-accent" },
  parameters: {
    docs: {
      description: {
        story:
          "The spinner inherits `currentColor`, so a `text-*` class on `className` (here `text-accent`) recolors it.",
      },
    },
  },
};

export const InlineWithText: Story = {
  parameters: {
    docs: {
      description: {
        story: "A common pattern: a small spinner sitting inline next to a label.",
      },
    },
  },
  render: () => (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
      }}
      className="text-muted-foreground text-sm"
    >
      <Loader size={14} />
      <span>Saving changes…</span>
    </div>
  ),
};

export const OnButton: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Dropped into a pending-state button. The spinner inherits the button's text color via `currentColor`.",
      },
    },
  },
  render: () => (
    <button
      type="button"
      disabled
      className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium opacity-80"
    >
      <Loader size={14} className="text-primary-foreground" />
      Submitting…
    </button>
  ),
};

export const ShimmerThinking: StoryObj<typeof TextShimmer> = {
  parameters: {
    docs: {
      description: {
        story: 'The `TextShimmer` variant animating a "Thinking…" status message.',
      },
    },
  },
  render: () => <TextShimmer className="text-base">Thinking…</TextShimmer>,
};

export const ShimmerConnecting: StoryObj<typeof TextShimmer> = {
  parameters: {
    docs: {
      description: {
        story: "`TextShimmer` used for a connection-in-progress message.",
      },
    },
  },
  render: () => <TextShimmer className="text-sm">Connecting to the sandbox…</TextShimmer>,
};

export const ShimmerSizes: StoryObj<typeof TextShimmer> = {
  parameters: {
    docs: {
      description: {
        story:
          "`TextShimmer` scales with surrounding font-size utilities since it clips the gradient to the text itself.",
      },
    },
  },
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <TextShimmer className="text-xs">Reticulating splines…</TextShimmer>
      <TextShimmer className="text-sm">Reticulating splines…</TextShimmer>
      <TextShimmer className="text-lg">Reticulating splines…</TextShimmer>
      <TextShimmer className="text-2xl font-semibold">Reticulating splines…</TextShimmer>
    </div>
  ),
};

export const SpinnerWithShimmer: StoryObj<typeof TextShimmer> = {
  parameters: {
    docs: {
      description: {
        story:
          "Combining both primitives: a spinner next to shimmer status text, the canonical AI streaming indicator.",
      },
    },
  },
  render: () => (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
      <Loader size={16} />
      <TextShimmer className="text-sm">Generating response…</TextShimmer>
    </div>
  ),
};
