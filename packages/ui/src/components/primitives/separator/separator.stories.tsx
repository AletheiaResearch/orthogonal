import type { Meta, StoryObj } from "@storybook/react-vite";

import { Separator } from "./index";

const meta = {
  title: "UI/separator",
  component: Separator,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A thin dividing line used to visually separate groups of content or controls. Built on `@radix-ui/react-separator`, it renders horizontally or vertically and is decorative by default (hidden from assistive tech). Set `decorative={false}` when the rule conveys meaningful structure that should be announced.",
      },
    },
  },
  argTypes: {
    orientation: {
      description: "Direction of the dividing line.",
      control: "radio",
      options: ["horizontal", "vertical"],
      table: { defaultValue: { summary: "horizontal" } },
    },
    decorative: {
      description:
        'When true (default) the separator is purely visual and hidden from the accessibility tree; when false it is exposed with role="separator".',
      control: "boolean",
      table: { defaultValue: { summary: "true" } },
    },
    className: {
      description: "Additional Tailwind classes merged onto the base styles via `cn`.",
      control: "text",
    },
  },
  args: {
    orientation: "horizontal",
    decorative: true,
  },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  args: { orientation: "horizontal" },
  parameters: {
    docs: {
      description: {
        story: "The default full-width horizontal rule used to divide stacked sections of content.",
      },
    },
  },
  render: (args) => (
    <div style={{ width: 320 }}>
      <p style={{ margin: 0 }}>Account settings</p>
      <Separator {...args} style={{ margin: "12px 0" }} />
      <p style={{ margin: 0 }}>Billing</p>
    </div>
  ),
};

export const Vertical: Story = {
  args: { orientation: "vertical" },
  parameters: {
    docs: {
      description: {
        story: "A full-height vertical rule for separating inline items such as toolbar actions.",
      },
    },
  },
  render: (args) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 24 }}>
      <span>Edit</span>
      <Separator {...args} />
      <span>Duplicate</span>
      <Separator {...args} />
      <span>Delete</span>
    </div>
  ),
};

export const Semantic: Story = {
  args: { orientation: "horizontal", decorative: false },
  parameters: {
    docs: {
      description: {
        story:
          "With `decorative={false}` the divider is exposed to assistive technology as a real separator, signalling a meaningful break between regions.",
      },
    },
  },
  render: (args) => (
    <div style={{ width: 320 }}>
      <p style={{ margin: 0 }}>Profile</p>
      <Separator {...args} style={{ margin: "12px 0" }} />
      <p style={{ margin: 0 }}>Danger zone</p>
    </div>
  ),
};

export const CustomStyling: Story = {
  args: { orientation: "horizontal", className: "bg-accent h-[2px]" },
  parameters: {
    docs: {
      description: {
        story:
          "Extra utility classes can override the color and thickness of the rule via `className`.",
      },
    },
  },
  render: (args) => (
    <div style={{ width: 320 }}>
      <p style={{ margin: 0 }}>Highlighted divider below</p>
      <Separator {...args} style={{ margin: "12px 0" }} />
      <p style={{ margin: 0 }}>More content</p>
    </div>
  ),
};
