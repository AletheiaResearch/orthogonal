import type { Meta, StoryObj } from "@storybook/react-vite";
import { toast } from "sonner";

import { Toaster } from "./sonner";

/**
 * `Toaster` is the host component that renders toast notifications. Mount it
 * once near the root of your application, then fire notifications imperatively
 * from anywhere with the `toast()` function from `sonner`.
 *
 * It is a thin wrapper around Sonner's toaster that syncs the active color
 * scheme via `next-themes` and applies the design system's surface, border,
 * and typography tokens to every toast.
 */
const meta = {
  title: "UI/sonner",
  component: Toaster,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The toast notification host. Render it once at the app root, then trigger transient messages from anywhere via sonner's imperative `toast()` API. Styling and theme follow the design tokens automatically.",
      },
    },
  },
  argTypes: {
    position: {
      description: "Screen corner (or center edge) where toasts stack and animate in.",
      control: "select",
      options: [
        "top-left",
        "top-center",
        "top-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ],
    },
    theme: {
      description:
        "Color scheme for toasts. Defaults to the value resolved from `next-themes`; set explicitly to override.",
      control: "inline-radio",
      options: ["light", "dark", "system"],
    },
    richColors: {
      description:
        "Use saturated, intent-specific background colors for success/error/warning/info toasts.",
      control: "boolean",
    },
    closeButton: {
      description: "Render a dismiss button on every toast.",
      control: "boolean",
    },
    expand: {
      description: "Keep stacked toasts expanded instead of collapsing them into a pile.",
      control: "boolean",
    },
    duration: {
      description: "Default time in milliseconds before a toast auto-dismisses.",
      control: "number",
    },
  },
  args: {
    position: "bottom-right",
  },
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof Toaster>;

const triggerButtonClass =
  "rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted";

/**
 * The default toaster. Click the button to fire a plain notification; the host
 * itself renders nothing until a toast is dispatched.
 */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Baseline toaster mounted with default options. Use the button to dispatch a simple message toast.",
      },
    },
  },
  render: (args) => (
    <div className="flex min-h-32 items-start gap-2">
      <button
        type="button"
        className={triggerButtonClass}
        onClick={() => toast("Event has been created")}
      >
        Show toast
      </button>
      <Toaster {...args} />
    </div>
  ),
};

/**
 * A toast with a title, a secondary description line, and an action button —
 * the richest single-toast layout.
 */
export const WithDescriptionAndAction: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A toast carrying a description and an actionable button, demonstrating the action/cancel button styling.",
      },
    },
  },
  render: (args) => (
    <div className="flex min-h-32 items-start gap-2">
      <button
        type="button"
        className={triggerButtonClass}
        onClick={() =>
          toast("Event has been created", {
            description: "Sunday, December 03, 2023 at 9:00 AM",
            action: {
              label: "Undo",
              onClick: () => {},
            },
          })
        }
      >
        Show detailed toast
      </button>
      <Toaster {...args} />
    </div>
  ),
};

/**
 * Each intent variant exposed by sonner: success, error, warning, and info.
 * Pair with `richColors` to give each its own background hue.
 */
export const Variants: Story = {
  args: { richColors: true },
  parameters: {
    docs: {
      description: {
        story:
          "The semantic toast variants (success, error, warning, info) shown with `richColors` enabled for intent-specific coloring.",
      },
    },
  },
  render: (args) => (
    <div className="flex min-h-32 flex-wrap items-start gap-2">
      <button
        type="button"
        className={triggerButtonClass}
        onClick={() => toast.success("Profile saved")}
      >
        Success
      </button>
      <button
        type="button"
        className={triggerButtonClass}
        onClick={() => toast.error("Something went wrong")}
      >
        Error
      </button>
      <button
        type="button"
        className={triggerButtonClass}
        onClick={() => toast.warning("Storage almost full")}
      >
        Warning
      </button>
      <button
        type="button"
        className={triggerButtonClass}
        onClick={() => toast.info("A new version is available")}
      >
        Info
      </button>
      <Toaster {...args} />
    </div>
  ),
};

/**
 * A promise-driven toast that transitions through loading, then success or
 * error as the promise settles.
 */
export const PromiseToast: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "`toast.promise` shows a loading state and swaps to success/error when the promise resolves or rejects.",
      },
    },
  },
  render: (args) => (
    <div className="flex min-h-32 items-start gap-2">
      <button
        type="button"
        className={triggerButtonClass}
        onClick={() =>
          toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
            loading: "Saving changes...",
            success: "Changes saved",
            error: "Could not save changes",
          })
        }
      >
        Run async action
      </button>
      <Toaster {...args} />
    </div>
  ),
};

/**
 * Toasts pinned to the top-center of the viewport, illustrating the
 * `position` prop.
 */
export const TopCenter: Story = {
  args: { position: "top-center" },
  parameters: {
    docs: {
      description: {
        story: "Toaster positioned at the top-center edge via the `position` prop.",
      },
    },
  },
  render: (args) => (
    <div className="flex min-h-32 items-start gap-2">
      <button
        type="button"
        className={triggerButtonClass}
        onClick={() => toast("Pinned to the top")}
      >
        Show top toast
      </button>
      <Toaster {...args} />
    </div>
  ),
};

/**
 * Forces the dark color scheme and enables a per-toast close button,
 * independent of the surrounding theme.
 */
export const DarkWithCloseButton: Story = {
  args: { theme: "dark", closeButton: true },
  parameters: {
    docs: {
      description: {
        story:
          "Dark theme forced via the `theme` prop with a dismiss control on every toast (`closeButton`).",
      },
    },
  },
  render: (args) => (
    <div className="flex min-h-32 items-start gap-2 rounded-md bg-zinc-900 p-4">
      <button
        type="button"
        className={triggerButtonClass}
        onClick={() => toast("Dark mode notification")}
      >
        Show dark toast
      </button>
      <Toaster {...args} />
    </div>
  ),
};
