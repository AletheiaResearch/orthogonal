import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { WebPreview, WebPreviewBody, WebPreviewNavigation } from "./index";

const meta = {
  title: "AI/WebPreview",
  component: WebPreview,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A generic embedded web preview panel: a labelled toolbar with open-in-new-tab and optional close actions sitting above a sandboxed iframe with loading and error overlays. It is decoupled from any session/agent/auth protocol — pass a resolved `src` and, if needed, render-prop overlays. Use it to embed a live deployment, docs page, or any URL inside your app.",
      },
    },
  },
  argTypes: {
    src: {
      description:
        "Resolved URL to embed. Pass a fully-formed src — this primitive is protocol-agnostic.",
      control: "text",
    },
    title: {
      description:
        "Label shown in the toolbar and used as the iframe's accessible title. Defaults to the src.",
      control: "text",
    },
    sandbox: {
      description:
        "Space-separated iframe `sandbox` flags. Defaults to a script/same-origin/popup/form-friendly set.",
      control: "text",
    },
    allow: {
      description:
        "Space-separated iframe feature-policy string for the `allow` attribute (e.g. `camera; microphone`).",
      control: "text",
    },
    onClose: {
      description:
        "When provided, renders a close button in the toolbar that invokes this callback.",
      action: "onClose",
    },
    loadingNode: {
      description: "Overlay shown while the frame is loading. Falls back to a default spinner row.",
      control: false,
    },
    errorNode: {
      description: "Overlay shown when the frame fails to load. Falls back to a default error row.",
      control: false,
    },
    className: {
      description: "Additional classes merged onto the root container via `cn`.",
      control: "text",
    },
  },
  args: {
    src: "https://example.com/",
    title: "example.com",
  },
  decorators: [
    (Story) => (
      <div style={{ height: 420, width: 640, border: "1px solid var(--border-muted, #e5e1d8)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WebPreview>;

export default meta;

type Story = StoryObj<typeof WebPreview>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The full panel with a title, an open-in-new-tab action, and the default loading overlay. No close button is shown because `onClose` is not provided.",
      },
    },
  },
};

export const WithoutTitle: Story = {
  args: {
    title: undefined,
  },
  parameters: {
    docs: {
      description: {
        story: "When no `title` is supplied the toolbar falls back to showing the raw `src`.",
      },
    },
  },
};

export const Closable: Story = {
  args: {
    onClose: () => {},
  },
  parameters: {
    docs: {
      description: {
        story:
          "Providing `onClose` reveals a close button in the toolbar — useful when the preview lives in a dismissible side panel.",
      },
    },
  },
};

export const CustomLoadingOverlay: Story = {
  args: {
    // A src that never resolves keeps the loading overlay on screen so the
    // custom node is reliably visible in the canvas.
    src: "https://10.255.255.1/",
    title: "Booting deployment",
    loadingNode: (
      <div className="text-muted-foreground flex flex-col items-center gap-1 text-sm">
        <span className="text-foreground font-medium">Starting your dev server</span>
        <span className="text-xs">This can take a few seconds...</span>
      </div>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Pass a custom `loadingNode` to replace the default spinner row — for example, a richer 'booting' message while a sandbox warms up. The overlay shows from initial mount and stays until the iframe fires `load`.",
      },
    },
  },
};

export const CustomErrorOverlay: Story = {
  args: {
    src: "about:blank",
    title: "Offline deployment",
    errorNode: (
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-foreground text-sm font-medium">Deployment offline</span>
        <span className="text-muted-foreground text-xs">
          The preview server is not responding. Redeploy and try again.
        </span>
      </div>
    ),
  },
  // Drive the error state deterministically — the same path the unit test
  // exercises via fireEvent.error — so the canvas reliably shows the overlay.
  play: async ({ canvasElement }) => {
    const iframe = canvasElement.querySelector("iframe");
    iframe?.dispatchEvent(new Event("error"));
  },
  parameters: {
    docs: {
      description: {
        story:
          "Pass a custom `errorNode` to render a branded failure state. The story dispatches the iframe's `error` event on mount so the overlay is always visible.",
      },
    },
  },
};

export const ComposedSlots: Story = {
  render: (args) => {
    const Wrapper = () => {
      const [closed, setClosed] = useState(false);
      if (closed) {
        return (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            Preview closed.{" "}
            <button type="button" className="ml-1 underline" onClick={() => setClosed(false)}>
              Reopen
            </button>
          </div>
        );
      }
      return (
        <div className="bg-background text-foreground flex h-full flex-col overflow-hidden">
          <WebPreviewNavigation
            actions={
              <button
                type="button"
                onClick={() => setClosed(true)}
                className="text-muted-foreground hover:bg-accent hover:text-foreground rounded px-2 py-0.5 text-xs transition-colors"
              >
                Dismiss
              </button>
            }
          >
            <span className="truncate font-medium">{args.title ?? args.src}</span>
          </WebPreviewNavigation>
          <WebPreviewBody src={args.src} title={args.title} />
        </div>
      );
    };
    return <Wrapper />;
  },
  args: {
    src: "https://example.com/",
    title: "Custom layout",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Build a bespoke panel by composing `WebPreviewNavigation` and `WebPreviewBody` directly — here with a custom 'Dismiss' action driven by local state.",
      },
    },
  },
};
