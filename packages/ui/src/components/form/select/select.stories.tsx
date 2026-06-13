import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./index";

const meta = {
  title: "UI/select",
  component: Select,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A single-select dropdown built on Radix UI Select. Compose it from `SelectTrigger`/`SelectValue` (the closed control) and `SelectContent` containing `SelectItem`s, optionally organized with `SelectGroup`, `SelectLabel`, and `SelectSeparator`. Use it when a user must pick exactly one option from a known list and you want full keyboard, accessibility, and theming support.",
      },
    },
  },
  argTypes: {
    defaultValue: {
      description: "Uncontrolled initial selected value (matches an item's `value`).",
      control: "text",
    },
    value: {
      description: "Controlled selected value. Pair with `onValueChange`.",
      control: "text",
    },
    onValueChange: {
      description: "Called with the new value whenever the selection changes.",
      control: false,
    },
    disabled: {
      description: "Disables the entire select, preventing it from opening.",
      control: "boolean",
    },
  },
  args: {},
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof Select>;

/** The default select: a trigger with a placeholder and a short flat list of items. */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Baseline usage. The trigger shows the placeholder until an option is chosen, then displays the selected item's text.",
      },
    },
  },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className="w-56" aria-label="Fruit">
        <SelectValue placeholder="Pick a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="blueberry">Blueberry</SelectItem>
        <SelectItem value="grapes">Grapes</SelectItem>
      </SelectContent>
    </Select>
  ),
};

/** A pre-selected value via the uncontrolled `defaultValue` prop. */
export const WithDefaultValue: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Setting `defaultValue` selects an item on first render without making the component controlled.",
      },
    },
  },
  args: {
    defaultValue: "banana",
  },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className="w-56" aria-label="Fruit">
        <SelectValue placeholder="Pick a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="blueberry">Blueberry</SelectItem>
        <SelectItem value="grapes">Grapes</SelectItem>
      </SelectContent>
    </Select>
  ),
};

/** The `density="compact"` trigger variant for tighter layouts and toolbars. */
export const CompactTrigger: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "`SelectTrigger` accepts a `density` prop. `compact` reduces the trigger padding (`px-2 py-1`) versus the default (`px-3 py-2`) for dense UIs.",
      },
    },
  },
  render: (args) => (
    <div className="flex items-center gap-4">
      <Select {...args}>
        <SelectTrigger density="default" className="w-40" aria-label="Default density">
          <SelectValue placeholder="Default" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="high">High</SelectItem>
        </SelectContent>
      </Select>
      <Select>
        <SelectTrigger density="compact" className="w-40" aria-label="Compact density">
          <SelectValue placeholder="Compact" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="high">High</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

/** Items organized into labeled groups separated by a divider. */
export const Grouped: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Use `SelectGroup` with `SelectLabel` to caption sections and `SelectSeparator` to divide them, keeping long option lists scannable.",
      },
    },
  },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className="w-56" aria-label="Timezone">
        <SelectValue placeholder="Select a timezone" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>North America</SelectLabel>
          <SelectItem value="est">Eastern (EST)</SelectItem>
          <SelectItem value="cst">Central (CST)</SelectItem>
          <SelectItem value="pst">Pacific (PST)</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Europe</SelectLabel>
          <SelectItem value="gmt">Greenwich (GMT)</SelectItem>
          <SelectItem value="cet">Central European (CET)</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

/** A list containing a disabled, non-selectable item. */
export const DisabledItem: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Pass `disabled` to a `SelectItem` to render it dimmed and prevent it from being highlighted or chosen.",
      },
    },
  },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className="w-56" aria-label="Plan">
        <SelectValue placeholder="Choose a plan" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="free">Free</SelectItem>
        <SelectItem value="pro">Pro</SelectItem>
        <SelectItem value="enterprise" disabled>
          Enterprise (contact sales)
        </SelectItem>
      </SelectContent>
    </Select>
  ),
};

/** The whole select disabled, so it cannot be opened. */
export const Disabled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Passing `disabled` to the root `Select` disables the trigger entirely. Useful while a form section is locked or loading.",
      },
    },
  },
  args: {
    disabled: true,
    defaultValue: "pro",
  },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className="w-56" aria-label="Plan">
        <SelectValue placeholder="Choose a plan" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="free">Free</SelectItem>
        <SelectItem value="pro">Pro</SelectItem>
      </SelectContent>
    </Select>
  ),
};

/** A long option list that overflows, exercising the scroll up/down buttons. */
export const LongList: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "When the content exceeds its max height, the built-in `SelectScrollUpButton` / `SelectScrollDownButton` appear and the viewport scrolls.",
      },
    },
  },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className="w-56" aria-label="Number">
        <SelectValue placeholder="Pick a number" />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: 50 }, (_, i) => (
          <SelectItem key={i} value={String(i + 1)}>
            Option {i + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
};

/** A fully controlled select that mirrors its current value below the control. */
export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Drive the selection with `value` + `onValueChange`. Here a small wrapper keeps the value in React state and renders it back out.",
      },
    },
  },
  render: () => {
    function ControlledExample() {
      const [value, setValue] = useState<string>("");
      return (
        <div className="flex flex-col gap-3">
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="w-56" aria-label="Color">
              <SelectValue placeholder="Pick a color" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="red">Red</SelectItem>
              <SelectItem value="green">Green</SelectItem>
              <SelectItem value="blue">Blue</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-sm">
            Selected value: <span className="font-medium">{value || "(none)"}</span>
          </p>
        </div>
      );
    }
    return <ControlledExample />;
  },
};
