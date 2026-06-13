import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "./index";

const meta = {
  title: "UI/label",
  component: Label,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "An accessible caption for a form control, built on Radix's Label primitive. Use it to label inputs, checkboxes, and other fields — clicking the label focuses or toggles the associated control via `htmlFor`.",
      },
    },
  },
  argTypes: {
    htmlFor: {
      description:
        "The `id` of the form control this label describes. Associates the label so clicking it focuses the control.",
      control: "text",
    },
    className: {
      description: "Additional Tailwind classes merged with the base label styles.",
      control: "text",
    },
    children: {
      description: "The label's visible text content.",
      control: "text",
    },
  },
  args: {
    children: "Email address",
  },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: { description: { story: "A standalone label with its default typographic styling." } },
  },
};

export const WithInput: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A label wired to an input via `htmlFor`/`id`. Clicking the label focuses the input — the core accessibility contract.",
      },
    },
  },
  render: (args) => (
    <div className="grid w-full max-w-sm gap-1.5">
      <Label {...args} htmlFor="email" />
      <input
        id="email"
        type="email"
        placeholder="you@example.com"
        className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm"
      />
    </div>
  ),
};

export const WithCheckbox: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A label paired with a checkbox. Clicking the label toggles the checkbox, giving users a larger hit target.",
      },
    },
  },
  render: () => (
    <div className="flex items-center gap-2">
      <input id="terms" type="checkbox" className="size-4" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
};

export const DisabledPeer: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "When the associated control is a disabled `peer`, the label dims and shows a not-allowed cursor via the `peer-disabled:` utilities baked into the base styles.",
      },
    },
  },
  render: () => (
    <div className="grid w-full max-w-sm gap-1.5">
      <input
        id="disabled-input"
        type="text"
        disabled
        placeholder="Unavailable"
        className="border-input peer flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm disabled:opacity-50"
      />
      <Label htmlFor="disabled-input" className="order-first">
        Disabled field
      </Label>
    </div>
  ),
};

export const CustomStyling: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Pass `className` to extend or override the base styles — here using a destructive color to signal a validation error.",
      },
    },
  },
  args: {
    children: "Email address (required)",
    className: "text-destructive",
  },
};
