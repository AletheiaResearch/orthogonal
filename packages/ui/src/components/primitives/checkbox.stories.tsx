import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Checkbox } from "./checkbox";

const meta = {
  title: "UI/checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A control that lets users toggle a single boolean value on or off. Built on Radix UI Checkbox, so it is fully keyboard accessible and supports controlled, uncontrolled, and indeterminate states. Use it in forms, settings panels, and lists where each item can be independently selected.",
      },
    },
  },
  argTypes: {
    checked: {
      description:
        'Controlled checked state. Accepts `true`, `false`, or `"indeterminate"`. When set, pair it with `onCheckedChange` to manage updates.',
      control: "boolean",
    },
    defaultChecked: {
      description: "Initial checked state when the checkbox is left uncontrolled.",
      control: "boolean",
    },
    disabled: {
      description: "Prevents interaction and dims the control.",
      control: "boolean",
    },
    required: {
      description: "Marks the checkbox as required within a form.",
      control: "boolean",
    },
    onCheckedChange: {
      description: "Fires with the next checked state whenever the value changes.",
      action: "checkedChange",
    },
  },
  args: {
    disabled: false,
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  parameters: {
    docs: {
      description: { story: "An uncontrolled checkbox in its default unchecked state." },
    },
  },
};

export const Checked: Story = {
  args: { defaultChecked: true },
  parameters: {
    docs: {
      description: { story: "Rendered already checked using the `defaultChecked` prop." },
    },
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  parameters: {
    docs: {
      description: { story: "A disabled checkbox that cannot be toggled and appears dimmed." },
    },
  },
};

export const DisabledChecked: Story = {
  args: { disabled: true, defaultChecked: true },
  parameters: {
    docs: {
      description: {
        story: "Disabled while showing a checked value — useful for read-only confirmations.",
      },
    },
  },
};

export const WithLabel: Story = {
  render: (args) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox {...args} id="terms" />
      Accept terms and conditions
    </label>
  ),
  parameters: {
    docs: {
      description: {
        story: "Paired with a `<label>` so clicking the text also toggles the checkbox.",
      },
    },
  },
};

export const Controlled: Story = {
  render: (args) => {
    const [checked, setChecked] = useState<boolean | "indeterminate">(false);
    return (
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox {...args} checked={checked} onCheckedChange={setChecked} />
          Subscribe to the newsletter
        </label>
        <span className="text-muted-foreground">Current value: {String(checked)}</span>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "A fully controlled checkbox whose state is owned by the parent via `checked` and `onCheckedChange`.",
      },
    },
  },
};

export const Group: Story = {
  render: () => {
    const options = ["Email", "SMS", "Push notification"];
    return (
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-medium">Notification channels</legend>
        {options.map((option, index) => (
          <label key={option} className="flex items-center gap-2">
            <Checkbox defaultChecked={index === 0} id={`channel-${index}`} />
            {option}
          </label>
        ))}
      </fieldset>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "Several independent checkboxes grouped inside a fieldset for multi-select preferences.",
      },
    },
  },
};
