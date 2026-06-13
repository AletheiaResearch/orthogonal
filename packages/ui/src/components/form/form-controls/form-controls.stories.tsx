import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { RadioCard } from "./index";

const meta = {
  title: "UI/form-controls",
  component: RadioCard,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A selectable radio option styled as a bordered card with a label and optional description. Use it to build single-select option lists where each choice benefits from extra explanatory text, such as plan pickers or settings toggles.",
      },
    },
  },
  argTypes: {
    label: {
      description: "Primary, emphasized text shown for the option.",
      control: "text",
    },
    description: {
      description: "Optional secondary text rendered beneath the label.",
      control: "text",
    },
    checked: {
      description: "Whether the option is currently selected (controlled).",
      control: "boolean",
    },
    disabled: {
      description: "Disables the underlying radio input.",
      control: "boolean",
    },
    className: {
      description: "Extra classes merged onto the label wrapper.",
      control: "text",
    },
  },
  args: {
    label: "Standard",
    checked: false,
  },
} satisfies Meta<typeof RadioCard>;

export default meta;
type Story = StoryObj<typeof RadioCard>;

export const Default: Story = {
  args: {
    label: "Standard",
  },
  parameters: {
    docs: {
      description: { story: "An unchecked option with only a label." },
    },
  },
};

export const Checked: Story = {
  args: {
    label: "Standard",
    checked: true,
    readOnly: true,
  },
  parameters: {
    docs: {
      description: {
        story: "The selected state, showing the filled radio indicator and accent border.",
      },
    },
  },
};

export const WithDescription: Story = {
  args: {
    label: "Pro",
    description: "Includes advanced analytics and priority support.",
  },
  parameters: {
    docs: {
      description: {
        story: "An option with supplementary description text below the label.",
      },
    },
  },
};

export const Disabled: Story = {
  args: {
    label: "Enterprise",
    description: "Contact sales to enable this tier.",
    disabled: true,
  },
  parameters: {
    docs: {
      description: { story: "A non-interactive option with the radio input disabled." },
    },
  },
};

const PLANS = [
  { value: "free", label: "Free", description: "For personal projects and experimentation." },
  { value: "standard", label: "Standard", description: "For small teams getting started." },
  { value: "pro", label: "Pro", description: "Advanced analytics and priority support." },
] as const;

export const InteractiveGroup: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A controlled radio group: selecting one card updates local state and deselects the others, demonstrating real single-select behavior.",
      },
    },
  },
  render: () => {
    const [selected, setSelected] = useState<string>("standard");

    return (
      <fieldset className="flex w-72 flex-col gap-2">
        {PLANS.map((plan) => (
          <RadioCard
            key={plan.value}
            name="plan"
            value={plan.value}
            label={plan.label}
            description={plan.description}
            checked={selected === plan.value}
            onChange={() => setSelected(plan.value)}
          />
        ))}
      </fieldset>
    );
  },
};
