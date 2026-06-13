import type { Meta, StoryObj } from "@storybook/react-vite";

import { ScreenshotArtifactCard } from "./index";

const SAMPLE_IMAGE =
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=60";
const SAMPLE_VIDEO =
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";

const meta = {
  title: "Media/screenshot-artifact-card",
  component: ScreenshotArtifactCard,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A clickable preview card for a screenshot or video artifact. It renders a 16:10 thumbnail with a loading placeholder, a play indicator for videos, and a graceful 'Preview unavailable' fallback on load failure. Use it in artifact galleries or session media lists where activating the card opens the full asset.",
      },
    },
  },
  argTypes: {
    artifactId: {
      description: "Identifier passed back through `onOpen` when the card is activated.",
      control: "text",
    },
    src: {
      description: "Resolved URL of the media to render (image or video source).",
      control: "text",
    },
    isVideo: {
      description: "Render a `<video>` preview with a play indicator instead of an `<img>`.",
      control: "boolean",
    },
    caption: {
      description: "Accessible label and visible caption. Falls back to a default per media type.",
      control: "text",
    },
    sourceUrl: {
      description: "Optional origin URL shown beneath the caption (hidden in compact mode).",
      control: "text",
    },
    compact: {
      description: "Tighten padding and hide the source URL for dense layouts.",
      control: "boolean",
    },
    onOpen: {
      description: "Invoked with `artifactId` when the user activates the card.",
      action: "onOpen",
    },
    className: {
      description: "Additional classes merged onto the card container via `cn`.",
      control: "text",
    },
  },
  args: {
    artifactId: "artifact-1",
    src: SAMPLE_IMAGE,
    caption: "Landing page hero",
    sourceUrl: "https://orthogonal.dev/",
    isVideo: false,
    compact: false,
    onOpen: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ScreenshotArtifactCard>;

export default meta;

type Story = StoryObj<typeof ScreenshotArtifactCard>;

export const Screenshot: Story = {
  parameters: {
    docs: {
      description: {
        story: "A standard image artifact with a caption and source URL.",
      },
    },
  },
};

export const Video: Story = {
  args: {
    artifactId: "artifact-2",
    src: SAMPLE_VIDEO,
    isVideo: true,
    caption: "Checkout flow recording",
  },
  parameters: {
    docs: {
      description: {
        story:
          "A video artifact: a play indicator overlays the thumbnail and the default caption becomes 'Video recording' when none is supplied.",
      },
    },
  },
};

export const DefaultCaption: Story = {
  args: {
    caption: undefined,
    sourceUrl: undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          "With no caption provided, the card falls back to a media-type default ('Screenshot').",
      },
    },
  },
};

export const Compact: Story = {
  args: {
    compact: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Compact mode tightens the padding and hides the source URL for dense gallery grids.",
      },
    },
  },
};

export const BrokenMedia: Story = {
  args: {
    artifactId: "artifact-broken",
    src: "https://example.invalid/does-not-exist.png",
    caption: "Unavailable asset",
  },
  parameters: {
    docs: {
      description: {
        story:
          "When the media URL fails to load, the card shows a 'Preview unavailable' fallback instead of a broken thumbnail.",
      },
    },
  },
};
