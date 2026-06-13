import type { Meta, StoryObj } from "@storybook/react-vite";

import { BoltIcon, FileIcon, TerminalIcon } from "../../primitives/icons";
import { ToolGroup } from "./index";

/**
 * `ToolGroup` collapses a run of related tool invocations under a single summary
 * header — for example `Read · 3 files` — and expands to reveal a ruled,
 * indented list of the individual tool entries you render as children.
 *
 * It is a fully decoupled presentation primitive: it has no knowledge of any
 * agent or session protocol and is driven entirely by props (`label`, `summary`,
 * `count`, `icon`, `defaultOpen`) plus whatever children you pass. Use it in a
 * chat or activity transcript to keep noisy bursts of tool calls tidy while
 * still letting the reader drill in.
 */
const meta = {
  title: "AI/ToolGroup",
  component: ToolGroup,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'Collapses a run of related tool invocations under one summary header (e.g. "Read · 3 files"), expanding to a ruled list of tool children. Decoupled from any protocol — props and children only.',
      },
    },
  },
  argTypes: {
    label: {
      description: "Primary header label, typically the tool name (e.g. `Read`). Always visible.",
      control: "text",
    },
    summary: {
      description:
        "Optional secondary summary shown after the label in muted text (e.g. `3 files`). Takes precedence over the derived `count`.",
      control: "text",
    },
    count: {
      description:
        "Optional number of invocations. When set and no `summary` is given, it renders as a derived summary like `· 3`.",
      control: { type: "number" },
    },
    defaultOpen: {
      description:
        "Whether the group starts expanded on first mount. State is managed internally thereafter. Defaults to `false`.",
      control: "boolean",
    },
    icon: {
      description:
        "Optional leading icon for the header, usually a tool glyph. Accepts any React node.",
      control: false,
    },
    children: {
      description:
        "The tool entries revealed inside the ruled list when expanded. Accepts any React node.",
      control: false,
    },
  },
  args: {
    label: "Read",
    summary: "3 files",
    defaultOpen: false,
    children: (
      <>
        <ToolRow>src/app.tsx</ToolRow>
        <ToolRow>src/lib/utils.ts</ToolRow>
        <ToolRow>package.json</ToolRow>
      </>
    ),
  },
} satisfies Meta<typeof ToolGroup>;

export default meta;
type Story = StoryObj<typeof ToolGroup>;

/** A small stand-in for a `Tool` child row used throughout these stories. */
function ToolRow({ children }: { children: React.ReactNode }) {
  return <div className="text-muted-foreground py-1 font-mono text-xs">{children}</div>;
}

/**
 * The default collapsed state. Only the header (`Read · 3 files`) is shown; click
 * it to reveal the ruled list of children.
 */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Collapsed on mount — only the summary header is visible. Click the header to expand the ruled list.",
      },
    },
  },
};

/**
 * Starts expanded via `defaultOpen`, showing the indented, left-ruled list of
 * tool children beneath the header.
 */
export const Expanded: Story = {
  args: {
    defaultOpen: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Expanded on mount — the children are shown in a ruled, indented list and the chevron is rotated.",
      },
    },
  },
};

/**
 * A leading `icon` is rendered before the label to reinforce the tool type.
 */
export const WithIcon: Story = {
  args: {
    label: "Read",
    summary: "3 files",
    defaultOpen: true,
    icon: <FileIcon className="h-3.5 w-3.5" />,
  },
  parameters: {
    docs: {
      description: {
        story: "A tool glyph leads the header, sitting before the label.",
      },
    },
  },
};

/**
 * When no `summary` is supplied but a `count` is, the component derives a terse
 * summary such as `· 5`.
 */
export const DerivedFromCount: Story = {
  args: {
    label: "Edit",
    summary: undefined,
    count: 5,
    defaultOpen: true,
    icon: <BoltIcon className="h-3.5 w-3.5" />,
    children: (
      <>
        <ToolRow>components/header.tsx</ToolRow>
        <ToolRow>components/footer.tsx</ToolRow>
        <ToolRow>components/sidebar.tsx</ToolRow>
        <ToolRow>styles/theme.css</ToolRow>
        <ToolRow>README.md</ToolRow>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        story: "No explicit `summary`; the `count` prop is rendered as the derived `· 5` summary.",
      },
    },
  },
};

/**
 * Without a `summary` or `count`, only the label is shown in the header.
 */
export const LabelOnly: Story = {
  args: {
    label: "Search",
    summary: undefined,
    count: undefined,
    defaultOpen: false,
    children: <ToolRow>grep -r &quot;ToolGroup&quot; src/</ToolRow>,
  },
  parameters: {
    docs: {
      description: {
        story: "Header shows just the label when neither `summary` nor `count` is provided.",
      },
    },
  },
};

/**
 * Several groups stacked in a transcript-like column, mixing collapsed and
 * expanded states and different tool types — the typical activity-feed layout.
 */
export const StackedInTranscript: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Multiple groups stacked as they would appear in an agent transcript, each independently expandable.",
      },
    },
  },
  render: () => (
    <div className="divide-border-muted w-96 divide-y">
      <ToolGroup
        label="Read"
        summary="3 files"
        defaultOpen
        icon={<FileIcon className="h-3.5 w-3.5" />}
      >
        <ToolRow>src/app.tsx</ToolRow>
        <ToolRow>src/lib/utils.ts</ToolRow>
        <ToolRow>package.json</ToolRow>
      </ToolGroup>
      <ToolGroup label="Bash" summary="2 commands" icon={<TerminalIcon className="h-3.5 w-3.5" />}>
        <ToolRow>pnpm install</ToolRow>
        <ToolRow>pnpm run build</ToolRow>
      </ToolGroup>
      <ToolGroup label="Edit" count={1} icon={<BoltIcon className="h-3.5 w-3.5" />}>
        <ToolRow>src/tool-group.tsx</ToolRow>
      </ToolGroup>
    </div>
  ),
};
