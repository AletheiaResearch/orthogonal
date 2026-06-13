import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Toggle } from "./toggle";

const meta = {
  title: "UI/toggle",
  component: Toggle,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A two-state button that can be turned on or off, built on Radix UI Toggle so it is fully keyboard accessible and supports controlled and uncontrolled usage. Reach for it for standalone binary actions in toolbars such as bold, italic, or mute. For a group of mutually related toggles use a toggle group, and for an immediate settings switch use Switch instead.",
      },
    },
  },
  argTypes: {
    variant: {
      description: "Visual style of the toggle. `outline` adds a border for stronger affordance.",
      control: "select",
      options: ["default", "outline"],
    },
    size: {
      description: "Control size. Affects height, minimum width, and horizontal padding.",
      control: "select",
      options: ["sm", "default", "lg"],
    },
    pressed: {
      description: "Controlled pressed state. Pair it with `onPressedChange` to manage updates.",
      control: "boolean",
    },
    defaultPressed: {
      description: "Initial pressed state when the toggle is left uncontrolled.",
      control: "boolean",
    },
    disabled: {
      description: "Prevents interaction and dims the control.",
      control: "boolean",
    },
    onPressedChange: {
      description: "Fires with the next pressed state whenever the value changes.",
      action: "pressedChange",
    },
  },
  args: {
    variant: "default",
    size: "default",
    disabled: false,
    children: "Bold",
  },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof Toggle>;

export const Default: Story = {
  parameters: {
    docs: {
      description: { story: "An uncontrolled toggle in its default off state." },
    },
  },
};

export const Pressed: Story = {
  args: { defaultPressed: true },
  parameters: {
    docs: {
      description: { story: "Rendered already on using the `defaultPressed` prop." },
    },
  },
};

export const Outline: Story = {
  args: { variant: "outline" },
  parameters: {
    docs: {
      description: {
        story: "The `outline` variant adds a border so the control reads clearly on flat surfaces.",
      },
    },
  },
};

export const Small: Story = {
  args: { size: "sm" },
  parameters: {
    docs: {
      description: { story: "The `sm` size for compact toolbars and dense layouts." },
    },
  },
};

export const Large: Story = {
  args: { size: "lg" },
  parameters: {
    docs: {
      description: { story: "The `lg` size for prominent, easy-to-hit controls." },
    },
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  parameters: {
    docs: {
      description: { story: "A disabled toggle that cannot be pressed and appears dimmed." },
    },
  },
};

export const DisabledPressed: Story = {
  args: { disabled: true, defaultPressed: true },
  parameters: {
    docs: {
      description: {
        story: "Disabled while showing an on value — useful for read-only or locked states.",
      },
    },
  },
};

export const Controlled: Story = {
  render: (args) => {
    const [pressed, setPressed] = useState(false);
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <Toggle {...args} pressed={pressed} onPressedChange={setPressed}>
          Italic
        </Toggle>
        <span className="text-muted-foreground">Current value: {String(pressed)}</span>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "A fully controlled toggle whose state is owned by the parent via `pressed` and `onPressedChange`.",
      },
    },
  },
};

export const Toolbar: Story = {
  render: (args) => (
    <div className="border-input flex items-center gap-1 rounded-md border p-1">
      <Toggle {...args} aria-label="Bold" size="sm">
        B
      </Toggle>
      <Toggle {...args} aria-label="Italic" size="sm">
        I
      </Toggle>
      <Toggle {...args} aria-label="Underline" size="sm">
        U
      </Toggle>
    </div>
  ),
  args: { children: undefined },
  parameters: {
    docs: {
      description: {
        story:
          "Several independent toggles grouped into a formatting toolbar, each tracking its own pressed state.",
      },
    },
  },
};
