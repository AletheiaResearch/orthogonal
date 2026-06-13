import type { Meta, StoryObj } from "@storybook/react-vite";

import { ErrorBanner } from "./index";

const meta = {
  title: "UI/error-banner",
  component: ErrorBanner,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A presentational banner for surfacing inline error and validation messages. Use it near forms, settings panels, or any action that can fail to give the user a clear, destructive-styled explanation.",
      },
    },
  },
  argTypes: {
    children: {
      description: "The error content to display. Accepts plain text or rich React nodes.",
      control: "text",
    },
    className: {
      description: "Additional Tailwind classes merged onto the banner's base styles via `cn`.",
      control: "text",
    },
  },
  args: {
    children: "Something went wrong. Please try again.",
  },
} satisfies Meta<typeof ErrorBanner>;

export default meta;

type Story = StoryObj<typeof ErrorBanner>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "The standard error banner with a short, single-line message.",
      },
    },
  },
};

export const LongMessage: Story = {
  args: {
    children:
      "We couldn't save your changes because the connection to the server timed out. Check your network and try again in a few moments.",
  },
  parameters: {
    docs: {
      description: {
        story: "A longer, multi-sentence message that wraps within the banner's padding.",
      },
    },
  },
};

export const RichContent: Story = {
  args: {
    children: (
      <span>
        Upload failed — the file exceeds the <strong>10 MB</strong> limit.
      </span>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Children can be arbitrary React nodes, allowing emphasis or links inside the message.",
      },
    },
  },
};

export const CustomClassName: Story = {
  args: {
    className: "mt-4 font-medium",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Extra utility classes are merged with the base destructive styling, here adding top margin and bolder text.",
      },
    },
  },
};

export const WithAlertRole: Story = {
  args: {
    role: "alert",
    "aria-live": "assertive",
    children: "Form submission failed. Fix the highlighted fields and submit again.",
  },
  parameters: {
    docs: {
      description: {
        story:
          'Arbitrary div props are forwarded, so you can add ARIA attributes like `role="alert"` for assistive technologies.',
      },
    },
  },
};
