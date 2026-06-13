import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Input } from "./index";

const meta = {
  title: "UI/input",
  component: Input,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A styled text input that wraps the native `<input>` element. Use it for single-line form fields such as text, email, password, search, and number inputs. It forwards a ref and accepts all native input attributes.",
      },
    },
  },
  argTypes: {
    type: {
      description: "The native input type (e.g. text, email, password, search, number).",
      control: "select",
      options: ["text", "email", "password", "search", "number", "tel", "url"],
    },
    placeholder: {
      description: "Placeholder text shown when the field is empty.",
      control: "text",
    },
    disabled: {
      description: "Disables the input, preventing focus and interaction.",
      control: "boolean",
    },
    value: {
      description: "Controlled value of the input.",
      control: "text",
    },
    className: {
      description: "Additional Tailwind classes merged onto the base styles.",
      control: "text",
    },
  },
  args: {
    type: "text",
    placeholder: "Enter text...",
    disabled: false,
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  parameters: {
    docs: {
      description: { story: "The default text input with placeholder text." },
    },
  },
};

export const Email: Story = {
  args: {
    type: "email",
    placeholder: "you@example.com",
  },
  parameters: {
    docs: {
      description: { story: "An email field using the `email` input type." },
    },
  },
};

export const Password: Story = {
  args: {
    type: "password",
    placeholder: "Enter password",
  },
  parameters: {
    docs: {
      description: {
        story: "A password field that masks the entered characters.",
      },
    },
  },
};

export const WithValue: Story = {
  args: {
    defaultValue: "Hello world",
  },
  parameters: {
    docs: {
      description: { story: "An input rendered with an initial value." },
    },
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: "Cannot edit",
  },
  parameters: {
    docs: {
      description: {
        story: "A disabled input that cannot be focused or edited.",
      },
    },
  },
};

export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A controlled input whose value is owned by parent state via `value` and `onChange`.",
      },
    },
  },
  render: function ControlledInput(args) {
    const [value, setValue] = React.useState("");
    return (
      <div className="flex w-72 flex-col gap-2">
        <Input
          {...args}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Type something..."
        />
        <p className="text-muted-foreground text-sm">Current value: {value || "(empty)"}</p>
      </div>
    );
  },
};

export const Search: Story = {
  args: {
    type: "search",
    placeholder: "Search...",
  },
  parameters: {
    docs: {
      description: { story: "A search field using the `search` input type." },
    },
  },
};
