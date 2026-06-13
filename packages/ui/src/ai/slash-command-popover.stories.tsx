import type { Meta, StoryObj } from "@storybook/react-vite";
import { Eraser, HelpCircle, RotateCcw, SlidersHorizontal } from "lucide-react";
import * as React from "react";

import { SlashCommandPopover, type SlashCommand } from "./slash-command-popover";

const meta = {
  title: "AI/SlashCommandPopover",
  component: SlashCommandPopover,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "A purely presentational, controlled command list designed to float above a chat input. It owns no state — the parent decides when it is `open`, which (already filtered) `commands` to show, and which row is `activeIndex`. Hovering a row reports the new active index; clicking selects. Styling is fully theme-driven. Pair it with `Composer`, which wires the trigger detection, filtering, and keyboard navigation.",
      },
    },
  },
  argTypes: {
    open: {
      description: "Whether the popover is shown. Renders nothing when false.",
      control: "boolean",
    },
    commands: {
      description: "The already-filtered commands to render, in display order.",
      control: "object",
    },
    activeIndex: {
      description: "Index of the highlighted row.",
      control: { type: "number", min: 0 },
    },
    onSelect: {
      description: "Fired with the command when a row is clicked or activated.",
      action: "selected",
    },
    onActiveIndexChange: {
      description: "Fired with a row's index when the pointer hovers it.",
      action: "activeIndexChanged",
    },
  },
  args: {
    open: true,
    activeIndex: 0,
    commands: [],
    onSelect: () => {},
    onActiveIndexChange: () => {},
  },
} satisfies Meta<typeof SlashCommandPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

const COMMANDS: SlashCommand[] = [
  {
    id: "help",
    trigger: "help",
    title: "Help",
    description: "Show available commands",
    icon: <HelpCircle />,
  },
  {
    id: "clear",
    trigger: "clear",
    title: "Clear",
    description: "Clear the conversation",
    icon: <Eraser />,
  },
  {
    id: "model",
    trigger: "model",
    title: "Model",
    description: "Switch the active model",
    icon: <SlidersHorizontal />,
  },
  {
    id: "retry",
    trigger: "retry",
    title: "Retry",
    description: "Re-run the last prompt",
    icon: <RotateCcw />,
  },
];

/** A stateful wrapper so the controlled `activeIndex` responds to hover/selection in the canvas. */
function StatefulPopover({
  commands,
  initialIndex = 0,
}: {
  commands: SlashCommand[];
  initialIndex?: number;
}) {
  const [activeIndex, setActiveIndex] = React.useState(initialIndex);
  const [selected, setSelected] = React.useState<SlashCommand | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <SlashCommandPopover
        open
        commands={commands}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
        onSelect={setSelected}
      />
      <p className="text-muted-foreground text-sm">
        {selected ? (
          <>
            Selected: <span className="text-foreground">/{selected.trigger}</span>
          </>
        ) : (
          "Hover to highlight, click to select."
        )}
      </p>
    </div>
  );
}

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The full command list with the first row highlighted. Hover any row to move the highlight; click to select.",
      },
    },
  },
  render: () => <StatefulPopover commands={COMMANDS} />,
};

export const WithDescriptions: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Commands can carry an optional `description` rendered as muted secondary text beneath the title, plus a leading `icon`.",
      },
    },
  },
  render: () => <StatefulPopover commands={COMMANDS} />,
};

export const Filtered: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The popover is presentational — the parent passes an already-filtered list. Here only commands matching the query "re" are shown.',
      },
    },
  },
  render: () => <StatefulPopover commands={COMMANDS.filter((c) => c.trigger.includes("re"))} />,
};

export const NoIcons: Story = {
  parameters: {
    docs: {
      description: {
        story: "Icons are optional. Without them, rows align on the title and trigger token.",
      },
    },
  },
  render: () =>
    React.createElement(StatefulPopover, {
      commands: COMMANDS.map(({ icon: _icon, ...rest }) => rest),
    }),
};

export const Closed: Story = {
  args: { open: false },
  parameters: {
    docs: {
      description: {
        story: "When `open` is false (or the command list is empty), the popover renders nothing.",
      },
    },
  },
  render: (args) => (
    <div className="mx-auto w-full max-w-md">
      <SlashCommandPopover {...args} commands={COMMANDS} />
      <p className="text-muted-foreground text-sm">Nothing renders while closed.</p>
    </div>
  ),
};
