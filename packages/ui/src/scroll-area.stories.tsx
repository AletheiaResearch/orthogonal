import type { Meta, StoryObj } from "@storybook/react-vite";

import { ScrollArea, ScrollBar } from "./scroll-area";

const meta = {
  title: "UI/scroll-area",
  component: ScrollArea,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A scroll container built on Radix UI that renders a native scroll viewport with a custom, themeable scrollbar. Use it whenever content can overflow a fixed-size region (sidebars, logs, long lists, chat transcripts) and you want a consistent scrollbar appearance across browsers and platforms.",
      },
    },
  },
  argTypes: {
    className: {
      description:
        "Extra Tailwind classes merged onto the scroll root. Set a height/width here (e.g. `h-72 w-48`) so the area can actually overflow.",
      control: "text",
    },
    children: {
      description: "The (potentially overflowing) content to render inside the scroll viewport.",
      control: false,
    },
  },
  args: {
    className: "h-48 w-64 rounded-md border",
  },
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof ScrollArea>;

const tags = Array.from({ length: 40 }, (_, i) => `Item ${i + 1}`);

/** The default vertical scroll area: a tall list constrained to a fixed height. */
export const Vertical: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Default usage. A long list is clipped to a fixed height and the custom vertical scrollbar appears on hover/interaction.",
      },
    },
  },
  render: (args) => (
    <ScrollArea {...args}>
      <div className="p-4">
        <h4 className="mb-4 text-sm font-medium leading-none">Tags</h4>
        {tags.map((tag) => (
          <div key={tag} className="py-1 text-sm">
            {tag}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

/** Horizontal scrolling using an explicit `ScrollBar` with `orientation="horizontal"`. */
export const Horizontal: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'When content overflows horizontally, render a `ScrollBar` with `orientation="horizontal"`. Here a row of cards is wider than the container.',
      },
    },
  },
  args: {
    className: "w-96 whitespace-nowrap rounded-md border",
  },
  render: (args) => (
    <ScrollArea {...args}>
      <div className="flex w-max gap-4 p-4">
        {Array.from({ length: 12 }, (_, i) => (
          <figure key={i} className="shrink-0">
            <div className="bg-muted flex h-32 w-32 items-center justify-center rounded-md text-sm">
              Photo {i + 1}
            </div>
          </figure>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};

/** A larger paragraph block, showing the scroll area wrapping prose content. */
export const LongText: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A scroll area around a block of prose. Useful for terms, changelogs, or any long-form copy that should stay inside a bounded box.",
      },
    },
  },
  args: {
    className: "h-56 w-80 rounded-md border",
  },
  render: (args) => (
    <ScrollArea {...args}>
      <div className="space-y-4 p-4 text-sm leading-relaxed">
        {Array.from({ length: 8 }, (_, i) => (
          <p key={i}>
            Paragraph {i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
            quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
};

/** Both axes overflow at once, demonstrating vertical and horizontal scrollbars together. */
export const BothAxes: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Content overflowing on both axes. The default vertical bar plus an explicit horizontal `ScrollBar` produce a two-dimensional scroll region with a corner.",
      },
    },
  },
  args: {
    className: "h-56 w-80 rounded-md border",
  },
  render: (args) => (
    <ScrollArea {...args}>
      <div className="w-[640px] space-y-1 p-4">
        {Array.from({ length: 30 }, (_, row) => (
          <div key={row} className="whitespace-nowrap text-sm">
            {Array.from({ length: 12 }, (_, col) => `R${row + 1}C${col + 1}`).join("    ")}
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};
