import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { MediaLightbox } from "./index";

const SAMPLE_IMAGE =
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1100&q=80";
const SAMPLE_VIDEO = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const meta = {
  title: "Media/media-lightbox",
  component: MediaLightbox,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A modal lightbox for previewing a single image or video at large size. The caller resolves the media URL and passes it as `src`, so the component stays decoupled from any data layer. Use it when a user selects a screenshot or recording from a gallery and you want a focused, dismissible preview.",
      },
    },
  },
  argTypes: {
    src: {
      description: "The resolved media URL to display. Pass null to show the empty state.",
      control: "text",
    },
    type: {
      description: 'The kind of media. Defaults to "image" when omitted.',
      control: "inline-radio",
      options: ["image", "video"],
    },
    title: {
      description: "Heading shown above the media. Falls back to a type-derived label.",
      control: "text",
    },
    description: {
      description: "Supporting text beneath the title. Falls back to a type-derived label.",
      control: "text",
    },
    open: {
      description: "Controlled open state of the underlying dialog.",
      control: "boolean",
    },
    onOpenChange: {
      description: "Called when the dialog requests to open or close (e.g. Escape, overlay click).",
      action: "openChange",
    },
  },
  args: {
    src: SAMPLE_IMAGE,
    type: "image",
    open: true,
  },
} satisfies Meta<typeof MediaLightbox>;

export default meta;
type Story = StoryObj<typeof MediaLightbox>;

export const Image: Story = {
  parameters: {
    docs: {
      description: {
        story: "An image preview using the default type-derived title and description.",
      },
    },
  },
};

export const ImageWithCaption: Story = {
  parameters: {
    docs: {
      description: {
        story: "An image preview with an explicit title and description supplied by the caller.",
      },
    },
  },
  args: {
    title: "Checkout flow",
    description: "Captured during the payment step of the e2e run.",
  },
};

export const Video: Story = {
  parameters: {
    docs: {
      description: {
        story: "A video preview with playback controls and the video-derived labels.",
      },
    },
  },
  args: {
    src: SAMPLE_VIDEO,
    type: "video",
  },
};

export const EmptyState: Story = {
  parameters: {
    docs: {
      description: {
        story: "The placeholder shown when no media is selected (src is null).",
      },
    },
  },
  args: {
    src: null,
  },
};

export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A controlled example where a trigger button owns the open state. Closing via Escape or the overlay flows back through onOpenChange.",
      },
    },
  },
  render: (args) => {
    const ControlledExample = () => {
      const [open, setOpen] = useState(false);
      return (
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="border-border rounded-md border px-4 py-2 text-sm"
          >
            Open preview
          </button>
          <span className="text-muted-foreground text-xs">State: {open ? "open" : "closed"}</span>
          <MediaLightbox {...args} open={open} onOpenChange={setOpen} />
        </div>
      );
    };
    return <ControlledExample />;
  },
};
