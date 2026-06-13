import type { Meta, StoryObj } from "@storybook/react-vite";

import { AppIcon } from "./index";

const meta = {
  title: "UI/app-icon",
  component: AppIcon,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Renders an application's brand icon. When an `iconUrl` is supplied it shows that image; otherwise it falls back to the built-in generic `InspectIcon` document glyph. Use it in headers, sidebars, and session lists so a custom-branded deployment can override the default mark without any other code changes.",
      },
    },
  },
  argTypes: {
    iconUrl: {
      description:
        "URL of a custom logo image. When truthy, an `<img>` is rendered; when empty or omitted, the fallback `InspectIcon` is shown instead.",
      control: "text",
    },
    alt: {
      description:
        "Alternative text for the custom image. Only applies to the image branch; ignored by the fallback icon.",
      control: "text",
    },
    className: {
      description:
        "Utility classes applied to whichever element renders (the image or the svg icon).",
      control: "text",
    },
  },
  args: {
    className: "size-8",
  },
} satisfies Meta<typeof AppIcon>;

export default meta;
type Story = StoryObj<typeof AppIcon>;

export const Fallback: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story:
          "With no `iconUrl`, the component renders the default `InspectIcon` glyph. This is what an un-branded deployment shows.",
      },
    },
  },
};

export const WithImage: Story = {
  args: {
    iconUrl: "https://placehold.co/64x64/png?text=Logo",
    alt: "Acme logo",
  },
  parameters: {
    docs: {
      description: {
        story:
          "When `iconUrl` is provided, the supplied image is rendered with the given `alt` text instead of the fallback icon.",
      },
    },
  },
};

export const ImageWithoutAlt: Story = {
  args: {
    iconUrl: "https://placehold.co/64x64/png?text=Logo",
  },
  parameters: {
    docs: {
      description: {
        story:
          "An image rendered without an `alt` value. Provide `alt` for accessibility whenever the icon conveys meaning.",
      },
    },
  },
};

export const Large: Story = {
  args: {
    className: "size-16 text-primary",
  },
  parameters: {
    docs: {
      description: {
        story:
          "The fallback icon scaled up and tinted via `className`. The svg inherits `currentColor`, so text utilities recolor it.",
      },
    },
  },
};

export const SideBySide: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The custom-image branch and the fallback-icon branch shown together for comparison.",
      },
    },
  },
  render: () => (
    <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
      <AppIcon
        className="size-10"
        iconUrl="https://placehold.co/64x64/png?text=Logo"
        alt="Acme logo"
      />
      <AppIcon className="size-10" />
    </div>
  ),
};
