import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Textarea } from "./textarea";

const meta = {
  title: "UI/textarea",
  component: Textarea,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A styled multi-line text input that wraps the native `<textarea>` element. Use it for free-form input such as comments, descriptions, or messages. It forwards a ref and accepts all native textarea attributes.",
      },
    },
  },
  argTypes: {
    placeholder: {
      description: "Placeholder text shown when the field is empty.",
      control: "text",
    },
    rows: {
      description: "The visible number of text lines (native `rows` attribute).",
      control: "number",
    },
    disabled: {
      description: "Disables the textarea, preventing focus and interaction.",
      control: "boolean",
    },
    value: {
      description: "Controlled value of the textarea.",
      control: "text",
    },
    className: {
      description: "Additional Tailwind classes merged onto the base styles.",
      control: "text",
    },
  },
  args: {
    placeholder: "Enter your message...",
    disabled: false,
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  parameters: {
    docs: {
      description: { story: "The default textarea with placeholder text and the base min-height." },
    },
  },
};

export const WithValue: Story = {
  args: {
    defaultValue: "The quick brown fox jumps over the lazy dog.",
  },
  parameters: {
    docs: {
      description: { story: "A textarea rendered with an initial multi-line value." },
    },
  },
};

export const Rows: Story = {
  args: {
    rows: 8,
    placeholder: "A taller textarea with eight visible rows...",
  },
  parameters: {
    docs: {
      description: {
        story: "Use the native `rows` attribute to control the initial visible height.",
      },
    },
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: "This content cannot be edited.",
  },
  parameters: {
    docs: {
      description: {
        story: "A disabled textarea that cannot be focused or edited.",
      },
    },
  },
};

export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A controlled textarea whose value is owned by parent state via `value` and `onChange`, with a live character count.",
      },
    },
  },
  render: function ControlledTextarea(args) {
    const [value, setValue] = React.useState("");
    return (
      <div className="flex w-80 flex-col gap-2">
        <Textarea
          {...args}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Type something..."
        />
        <p className="text-muted-foreground text-sm">{value.length} characters</p>
      </div>
    );
  },
};

export const WithLabel: Story = {
  parameters: {
    docs: {
      description: {
        story: "A textarea associated with a label via `htmlFor`/`id` for accessible form usage.",
      },
    },
  },
  render: (args) => (
    <div className="flex w-80 flex-col gap-2">
      <label htmlFor="bio" className="text-foreground text-sm font-medium">
        Biography
      </label>
      <Textarea {...args} id="bio" placeholder="Tell us about yourself..." />
    </div>
  ),
};
