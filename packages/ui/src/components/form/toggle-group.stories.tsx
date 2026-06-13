import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

const meta = {
  title: "UI/toggle-group",
  component: ToggleGroup,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'A set of two-state buttons that can be toggled on or off, sharing a single selection context. Built on Radix UI ToggleGroup. Use `type="single"` for mutually exclusive choices (like text alignment) and `type="multiple"` for independent formatting toggles (like bold/italic). Variant and size set on the group are inherited by every item.',
      },
    },
  },
  argTypes: {
    type: {
      description:
        "`single` allows one active item at a time; `multiple` allows any number of items to be active.",
      control: "radio",
      options: ["single", "multiple"],
    },
    variant: {
      description: "Visual style applied to every item in the group.",
      control: "radio",
      options: ["default", "outline"],
    },
    size: {
      description: "Sizing applied to every item in the group.",
      control: "radio",
      options: ["sm", "default", "lg"],
    },
    disabled: {
      description: "Disables every item in the group.",
      control: "boolean",
    },
    onValueChange: {
      description:
        "Fires with the next value whenever the selection changes — a string for `single`, an array for `multiple`.",
      action: "valueChange",
    },
  },
  args: {
    type: "single",
    variant: "default",
    size: "default",
    disabled: false,
  },
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof ToggleGroup>;

export const Default: Story = {
  render: (args) => (
    <ToggleGroup {...args} aria-label="text alignment">
      <ToggleGroupItem value="left">Left</ToggleGroupItem>
      <ToggleGroupItem value="center">Center</ToggleGroupItem>
      <ToggleGroupItem value="right">Right</ToggleGroupItem>
    </ToggleGroup>
  ),
  parameters: {
    docs: {
      description: {
        story: "A single-selection group where exactly one option can be active at a time.",
      },
    },
  },
};

export const Outline: Story = {
  args: { variant: "outline" },
  render: (args) => (
    <ToggleGroup {...args} aria-label="text alignment">
      <ToggleGroupItem value="left">Left</ToggleGroupItem>
      <ToggleGroupItem value="center">Center</ToggleGroupItem>
      <ToggleGroupItem value="right">Right</ToggleGroupItem>
    </ToggleGroup>
  ),
  parameters: {
    docs: {
      description: {
        story: "The `outline` variant gives each item a visible border, suiting toolbars.",
      },
    },
  },
};

export const Multiple: Story = {
  args: { type: "multiple", variant: "outline", defaultValue: ["bold"] },
  render: (args) => (
    <ToggleGroup {...args} aria-label="text formatting">
      <ToggleGroupItem value="bold">Bold</ToggleGroupItem>
      <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
      <ToggleGroupItem value="underline">Underline</ToggleGroupItem>
    </ToggleGroup>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'With `type="multiple"`, any combination of items can be active — ideal for text formatting controls.',
      },
    },
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <ToggleGroup type="single" size="sm" variant="outline" aria-label="small alignment">
        <ToggleGroupItem value="left">L</ToggleGroupItem>
        <ToggleGroupItem value="center">C</ToggleGroupItem>
        <ToggleGroupItem value="right">R</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup type="single" size="default" variant="outline" aria-label="default alignment">
        <ToggleGroupItem value="left">L</ToggleGroupItem>
        <ToggleGroupItem value="center">C</ToggleGroupItem>
        <ToggleGroupItem value="right">R</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup type="single" size="lg" variant="outline" aria-label="large alignment">
        <ToggleGroupItem value="left">L</ToggleGroupItem>
        <ToggleGroupItem value="center">C</ToggleGroupItem>
        <ToggleGroupItem value="right">R</ToggleGroupItem>
      </ToggleGroup>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "The three available sizes — `sm`, `default`, and `lg` — applied to whole groups.",
      },
    },
  },
};

export const Disabled: Story = {
  args: { disabled: true, variant: "outline", defaultValue: "center" },
  render: (args) => (
    <ToggleGroup {...args} aria-label="text alignment">
      <ToggleGroupItem value="left">Left</ToggleGroupItem>
      <ToggleGroupItem value="center">Center</ToggleGroupItem>
      <ToggleGroupItem value="right">Right</ToggleGroupItem>
    </ToggleGroup>
  ),
  parameters: {
    docs: {
      description: {
        story: "A fully disabled group whose items cannot be toggled and appear dimmed.",
      },
    },
  },
};

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState("center");
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <ToggleGroup
          type="single"
          variant="outline"
          value={value}
          onValueChange={(next) => next && setValue(next)}
          aria-label="text alignment"
        >
          <ToggleGroupItem value="left">Left</ToggleGroupItem>
          <ToggleGroupItem value="center">Center</ToggleGroupItem>
          <ToggleGroupItem value="right">Right</ToggleGroupItem>
        </ToggleGroup>
        <span className="text-muted-foreground">Current value: {value}</span>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "A controlled single-selection group whose value is owned by the parent. Guarding against an empty next value keeps one item always selected.",
      },
    },
  },
};
