import type { Meta, StoryObj } from "@storybook/react-vite";
import { GlobeIcon, SearchIcon, TerminalIcon } from "lucide-react";
import * as React from "react";

import { Tool, ToolHeader, ToolInput, ToolOutput } from "./tool";

const meta = {
  title: "AI/Tool",
  component: Tool,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "A generic, protocol-agnostic collapsible card for visualizing a tool/function invocation in an AI UI. Compose `ToolHeader` (name + status badge + chevron) with collapsible `ToolInput` (formatted arguments) and `ToolOutput` (result or error) panes. It is fully decoupled from any event/session type — feed it plain props and render-children — and supports both controlled (`open` + `onOpenChange`) and uncontrolled (`defaultOpen`) usage.",
      },
    },
  },
  argTypes: {
    defaultOpen: {
      description: "Initial open state when the component manages its own state (uncontrolled).",
      control: "boolean",
      table: { defaultValue: { summary: "false" } },
    },
    open: {
      description: "Controlled open state. When set, the parent owns the open/closed state.",
      control: "boolean",
    },
    onOpenChange: {
      description: "Fired with the requested next open state whenever the header is toggled.",
      action: "openChange",
    },
    className: {
      description: "Extra Tailwind classes merged onto the card via `cn`.",
      control: "text",
    },
  },
  args: {
    defaultOpen: true,
  },
} satisfies Meta<typeof Tool>;

export default meta;
type Story = StoryObj<typeof Tool>;

const SAMPLE_ARGS = {
  query: "border radius tokens",
  path: "packages/ui/src",
  caseSensitive: false,
};

function Json({ value }: { value: unknown }) {
  return <pre className="whitespace-pre-wrap font-mono">{JSON.stringify(value, null, 2)}</pre>;
}

export const Completed: Story = {
  parameters: {
    docs: {
      description: {
        story: "A finished invocation with both formatted input and output panes (success tone).",
      },
    },
  },
  render: (args) => (
    <Tool {...args}>
      <ToolHeader
        name="search_files"
        state="output-available"
        summary='"border radius tokens"'
        icon={<SearchIcon className="h-3.5 w-3.5" />}
      />
      <ToolInput>
        <Json value={SAMPLE_ARGS} />
      </ToolInput>
      <ToolOutput>
        <pre className="whitespace-pre-wrap font-mono">
          {"packages/ui/src/styles/tokens.css:82  --radius: 0.25rem;"}
        </pre>
      </ToolOutput>
    </Tool>
  ),
};

export const InputStreaming: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The tool's arguments are still streaming in. The badge shows a spinner and a 'Pending' label; no output pane yet.",
      },
    },
  },
  render: (args) => (
    <Tool {...args}>
      <ToolHeader
        name="run_command"
        state="input-streaming"
        icon={<TerminalIcon className="h-3.5 w-3.5" />}
      />
      <ToolInput>
        <pre className="whitespace-pre-wrap font-mono">{'{ "command": "pnpm run buil'}</pre>
      </ToolInput>
    </Tool>
  ),
};

export const Running: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Arguments are complete and the tool is executing. The accent-toned badge reads 'Running' with a spinner.",
      },
    },
  },
  render: (args) => (
    <Tool {...args}>
      <ToolHeader
        name="fetch_url"
        state="input-available"
        summary="https://example.com"
        icon={<GlobeIcon className="h-3.5 w-3.5" />}
      />
      <ToolInput>
        <Json value={{ url: "https://example.com", method: "GET" }} />
      </ToolInput>
    </Tool>
  ),
};

export const Error: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A failed invocation. The badge is destructive-toned and `ToolOutput.errorText` renders the failure message instead of a result.",
      },
    },
  },
  render: (args) => (
    <Tool {...args}>
      <ToolHeader
        name="run_command"
        state="output-error"
        summary="pnpm test"
        icon={<TerminalIcon className="h-3.5 w-3.5" />}
      />
      <ToolInput>
        <Json value={{ command: "pnpm test", cwd: "packages/ui" }} />
      </ToolInput>
      <ToolOutput errorText="Command exited with code 1: 3 tests failed in tool.test.tsx" />
    </Tool>
  ),
};

export const Collapsed: Story = {
  args: { defaultOpen: false },
  parameters: {
    docs: {
      description: {
        story: "The default resting state: only the header is shown until the user expands it.",
      },
    },
  },
  render: (args) => (
    <Tool {...args}>
      <ToolHeader
        name="search_files"
        state="output-available"
        summary='"tokens"'
        icon={<SearchIcon className="h-3.5 w-3.5" />}
      />
      <ToolInput>
        <Json value={SAMPLE_ARGS} />
      </ToolInput>
      <ToolOutput>
        <pre className="whitespace-pre-wrap font-mono">3 matches found</pre>
      </ToolOutput>
    </Tool>
  ),
};

export const DefaultIcon: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "When no `icon` is passed, the header falls back to a generic wrench glyph so unknown tools still look intentional.",
      },
    },
  },
  render: (args) => (
    <Tool {...args}>
      <ToolHeader name="unknown_tool" state="output-available" summary="no icon supplied" />
      <ToolOutput>
        <pre className="whitespace-pre-wrap font-mono">ok</pre>
      </ToolOutput>
    </Tool>
  ),
};

export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Controlled usage: the parent owns the open state via `open` + `onOpenChange`. Here an external button toggles the same card the header toggles.",
      },
    },
  },
  render: () => {
    const ControlledExample = () => {
      const [open, setOpen] = React.useState(true);
      return (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="border-border bg-background text-foreground hover:bg-muted self-start rounded-sm border px-2 py-1 text-xs"
          >
            {open ? "Collapse externally" : "Expand externally"}
          </button>
          <Tool open={open} onOpenChange={setOpen}>
            <ToolHeader
              name="apply_patch"
              state="output-available"
              summary="src/tool.tsx"
              icon={<TerminalIcon className="h-3.5 w-3.5" />}
            />
            <ToolInput>
              <Json value={{ file: "src/tool.tsx", additions: 220, deletions: 0 }} />
            </ToolInput>
            <ToolOutput>
              <pre className="whitespace-pre-wrap font-mono">Patch applied cleanly.</pre>
            </ToolOutput>
          </Tool>
        </div>
      );
    };
    return <ControlledExample />;
  },
};

export const Stacked: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Several tool cards rendered in a list, each in a different lifecycle state — the shape of a typical agent transcript.",
      },
    },
  },
  render: () => (
    <div className="flex flex-col gap-2">
      <Tool defaultOpen={false}>
        <ToolHeader
          name="search_files"
          state="output-available"
          summary='"tokens"'
          icon={<SearchIcon className="h-3.5 w-3.5" />}
        />
        <ToolOutput>
          <pre className="whitespace-pre-wrap font-mono">3 matches</pre>
        </ToolOutput>
      </Tool>
      <Tool defaultOpen={false}>
        <ToolHeader
          name="fetch_url"
          state="input-available"
          summary="https://example.com"
          icon={<GlobeIcon className="h-3.5 w-3.5" />}
        />
        <ToolInput>
          <Json value={{ url: "https://example.com" }} />
        </ToolInput>
      </Tool>
      <Tool defaultOpen>
        <ToolHeader
          name="run_command"
          state="output-error"
          summary="pnpm test"
          icon={<TerminalIcon className="h-3.5 w-3.5" />}
        />
        <ToolOutput errorText="Command exited with code 1" />
      </Tool>
    </div>
  ),
};
