import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./index";

const meta = {
  title: "UI/button",
  component: Button,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A clickable button with semantic variants (primary, outline, ghost, destructive, subtle) and sizes. Use it for any user-triggered action; set `asChild` to render the styling on a different element such as a link.",
      },
    },
  },
  argTypes: {
    variant: {
      description: "Visual style conveying the action's intent.",
      control: "select",
      options: ["primary", "outline", "ghost", "destructive", "subtle"],
      table: { defaultValue: { summary: "primary" } },
    },
    size: {
      description: "Padding and text scale of the button.",
      control: "select",
      options: ["default", "sm", "xs", "icon"],
      table: { defaultValue: { summary: "default" } },
    },
    asChild: {
      description:
        "When true, the button styles are applied to the single child element via a Radix Slot instead of rendering a native <button>.",
      control: "boolean",
      table: { defaultValue: { summary: "false" } },
    },
    disabled: {
      description: "Disables the button and prevents interaction.",
      control: "boolean",
    },
    children: {
      description: "Button content (text and/or icons).",
      control: "text",
    },
  },
  args: {
    children: "Button",
    variant: "primary",
    size: "default",
    asChild: false,
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: "primary", children: "Primary" },
  parameters: {
    docs: { description: { story: "The default, highest-emphasis action style." } },
  },
};

export const Outline: Story = {
  args: { variant: "outline", children: "Outline" },
  parameters: {
    docs: {
      description: { story: "A bordered, medium-emphasis alternative to the primary style." },
    },
  },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "Ghost" },
  parameters: {
    docs: { description: { story: "A low-emphasis button with no background until hovered." } },
  },
};

export const Destructive: Story = {
  args: { variant: "destructive", children: "Delete" },
  parameters: {
    docs: {
      description: { story: "Signals a dangerous or irreversible action such as deletion." },
    },
  },
};

export const Subtle: Story = {
  args: { variant: "subtle", children: "Subtle" },
  parameters: {
    docs: { description: { story: "The quietest variant, for tertiary or inline actions." } },
  },
};

export const Disabled: Story = {
  args: { disabled: true, children: "Disabled" },
  parameters: {
    docs: { description: { story: "A non-interactive, dimmed button." } },
  },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} size="default">
        Default
      </Button>
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="xs">
        Extra small
      </Button>
      <Button {...args} size="icon" aria-label="icon button">
        +
      </Button>
    </div>
  ),
  parameters: {
    docs: { description: { story: "All available sizes side by side." } },
  },
};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} variant="primary">
        Primary
      </Button>
      <Button {...args} variant="outline">
        Outline
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
      <Button {...args} variant="destructive">
        Destructive
      </Button>
      <Button {...args} variant="subtle">
        Subtle
      </Button>
    </div>
  ),
  parameters: {
    docs: { description: { story: "Every visual variant displayed together for comparison." } },
  },
};

export const AsChildLink: Story = {
  args: { asChild: true, variant: "outline" },
  render: (args) => (
    <Button {...args}>
      <a href="https://example.com">I am a link</a>
    </Button>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Using `asChild` to apply button styling to an anchor element instead of a <button>.",
      },
    },
  },
};
