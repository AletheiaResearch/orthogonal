import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Switch } from "./index";

const meta = {
  title: "UI/switch",
  component: Switch,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A toggle control for flipping a single setting between on and off. Built on Radix UI Switch, so it is fully keyboard accessible and supports controlled and uncontrolled usage. Reach for it over a checkbox when the change takes effect immediately, such as in settings panels and preference rows.",
      },
    },
  },
  argTypes: {
    checked: {
      description:
        "Controlled checked state. When set, pair it with `onCheckedChange` to manage updates.",
      control: "boolean",
    },
    defaultChecked: {
      description: "Initial checked state when the switch is left uncontrolled.",
      control: "boolean",
    },
    disabled: {
      description: "Prevents interaction and dims the control.",
      control: "boolean",
    },
    required: {
      description: "Marks the switch as required within a form.",
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
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  parameters: {
    docs: {
      description: { story: "An uncontrolled switch in its default off state." },
    },
  },
};

export const On: Story = {
  args: { defaultChecked: true },
  parameters: {
    docs: {
      description: { story: "Rendered already on using the `defaultChecked` prop." },
    },
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  parameters: {
    docs: {
      description: { story: "A disabled switch that cannot be toggled and appears dimmed." },
    },
  },
};

export const DisabledOn: Story = {
  args: { disabled: true, defaultChecked: true },
  parameters: {
    docs: {
      description: {
        story: "Disabled while showing an on value — useful for read-only or locked settings.",
      },
    },
  },
};

export const WithLabel: Story = {
  render: (args) => (
    <label className="flex items-center gap-2 text-sm">
      <Switch {...args} id="airplane-mode" />
      Airplane mode
    </label>
  ),
  parameters: {
    docs: {
      description: {
        story: "Paired with a `<label>` so clicking the text also toggles the switch.",
      },
    },
  },
};

export const Controlled: Story = {
  render: (args) => {
    const [checked, setChecked] = useState(false);
    return (
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          <Switch {...args} checked={checked} onCheckedChange={setChecked} />
          Enable notifications
        </label>
        <span className="text-muted-foreground">Current value: {String(checked)}</span>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "A fully controlled switch whose state is owned by the parent via `checked` and `onCheckedChange`.",
      },
    },
  },
};

export const SettingsList: Story = {
  render: () => {
    const settings = ["Wi-Fi", "Bluetooth", "Do not disturb"];
    return (
      <fieldset className="flex flex-col gap-3 text-sm">
        <legend className="mb-1 font-medium">Connectivity</legend>
        {settings.map((setting, index) => (
          <label key={setting} className="flex items-center justify-between gap-6">
            {setting}
            <Switch defaultChecked={index === 0} id={`setting-${index}`} />
          </label>
        ))}
      </fieldset>
    );
  },
  parameters: {
    docs: {
      description: {
        story: "Several independent switches grouped inside a fieldset for a settings panel.",
      },
    },
  },
};
