import type { Meta, StoryObj } from "@storybook/react-vite";

import { Badge } from "./index";

const meta = {
  title: "UI/badge",
  component: Badge,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A small inline label for status, metadata, and keyboard hints. Use it to annotate pull-request states (open, merged, closed, draft), surface informational notices, or render keyboard-shortcut chips. It is a purely presentational `<span>` driven by a `variant` prop.",
      },
    },
  },
  argTypes: {
    variant: {
      description: "Visual style of the badge, tuned for different semantic contexts.",
      control: "select",
      options: ["default", "pr-open", "pr-merged", "pr-closed", "pr-draft", "info", "kbd"],
      table: { defaultValue: { summary: "default" } },
    },
    className: {
      description: "Additional Tailwind classes merged onto the variant styles via `cn`.",
      control: "text",
    },
    children: {
      description: "The badge label content.",
      control: "text",
    },
  },
  args: {
    children: "Badge",
    variant: "default",
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { children: "Default", variant: "default" },
  parameters: {
    docs: { description: { story: "The neutral, muted badge used for generic metadata." } },
  },
};

export const PrOpen: Story = {
  args: { children: "Open", variant: "pr-open" },
  parameters: {
    docs: { description: { story: "Indicates a pull request that is currently open." } },
  },
};

export const PrMerged: Story = {
  args: { children: "Merged", variant: "pr-merged" },
  parameters: {
    docs: {
      description: { story: "Indicates a pull request that has been merged (success tone)." },
    },
  },
};

export const PrClosed: Story = {
  args: { children: "Closed", variant: "pr-closed" },
  parameters: {
    docs: {
      description: {
        story: "Indicates a pull request that was closed without merging (destructive tone).",
      },
    },
  },
};

export const PrDraft: Story = {
  args: { children: "Draft", variant: "pr-draft" },
  parameters: {
    docs: {
      description: { story: "Indicates a draft pull request, styled like the neutral default." },
    },
  },
};

export const Info: Story = {
  args: { children: "Info", variant: "info" },
  parameters: {
    docs: { description: { story: "An informational badge with a subtle border for emphasis." } },
  },
};

export const Kbd: Story = {
  args: { children: "⌘K", variant: "kbd" },
  parameters: {
    docs: {
      description: { story: "A monospace, bordered chip for rendering keyboard shortcuts." },
    },
  },
};

export const AllVariants: Story = {
  parameters: {
    docs: {
      description: { story: "Every available badge variant shown side by side for comparison." },
    },
  },
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
      <Badge variant="default">Default</Badge>
      <Badge variant="pr-open">Open</Badge>
      <Badge variant="pr-merged">Merged</Badge>
      <Badge variant="pr-closed">Closed</Badge>
      <Badge variant="pr-draft">Draft</Badge>
      <Badge variant="info">Info</Badge>
      <Badge variant="kbd">⌘K</Badge>
    </div>
  ),
};

export const WithCustomClassName: Story = {
  args: { children: "Uppercase", variant: "info", className: "uppercase tracking-wide" },
  parameters: {
    docs: {
      description: {
        story: "Extra utility classes can be merged on top of a variant via `className`.",
      },
    },
  },
};
