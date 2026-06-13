import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileText } from "lucide-react";
import * as React from "react";

import { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from "./task";

/**
 * `Task` is a collapsible plan / checklist surface for an agent's to-do list.
 * Compose it from `TaskTrigger` (the clickable header), `TaskContent` (the
 * body), and a list of `TaskItem`s — each carrying a `pending`,
 * `in-progress`, or `completed` status. Use `TaskItemFile` for inline file
 * references. Drive it controlled (`open` + `onOpenChange`) or uncontrolled
 * (`defaultOpen`).
 */
const meta = {
  title: "AI/Task",
  component: Task,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "A collapsible plan / checklist surface (AI-Elements Task family) for rendering an agent's to-do list. Compose TaskTrigger, TaskContent, and TaskItem (pending / in-progress / completed); use TaskItemFile for referenced-file chips. It is decoupled from any agent or session protocol — pass plain props and children.",
      },
    },
  },
  argTypes: {
    title: {
      description:
        "Header label rendered when no explicit `TaskTrigger` child is provided. Accepts any React node.",
      control: "text",
    },
    defaultOpen: {
      description:
        "Open state on first mount when the component is uncontrolled. Defaults to `true`.",
      control: "boolean",
    },
    open: {
      description:
        "Controlled open state. When set, the parent owns visibility and must respond to `onOpenChange`.",
      control: "boolean",
    },
    onOpenChange: {
      description: "Fires with the requested next open state whenever the trigger is toggled.",
      action: "openChange",
    },
  },
  args: {
    defaultOpen: true,
  },
} satisfies Meta<typeof Task>;

export default meta;
type Story = StoryObj<typeof Task>;

/**
 * The canonical layout: a header trigger over a mixed list of completed,
 * in-progress, and pending steps.
 */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "A typical agent plan with a header and three steps spanning every status.",
      },
    },
  },
  render: (args) => (
    <div className="max-w-md">
      <Task {...args}>
        <TaskTrigger title="Add dark-mode toggle" status="in-progress" />
        <TaskContent>
          <TaskItem status="completed">Read the theme provider</TaskItem>
          <TaskItem status="in-progress">Wire up the toggle button</TaskItem>
          <TaskItem status="pending">Persist the choice to localStorage</TaskItem>
        </TaskContent>
      </Task>
    </div>
  ),
};

/**
 * Each item status shown side by side: completed (checked, muted), in-progress
 * (spinner, emphasized), and pending (dashed circle, muted).
 */
export const ItemStatuses: Story = {
  parameters: {
    docs: {
      description: {
        story: "All three TaskItem statuses rendered together to compare their styling.",
      },
    },
  },
  render: (args) => (
    <div className="max-w-md">
      <Task {...args}>
        <TaskTrigger title="Status legend" />
        <TaskContent>
          <TaskItem status="completed">Completed — done and checked off</TaskItem>
          <TaskItem status="in-progress">In progress — currently running</TaskItem>
          <TaskItem status="pending">Pending — not started yet</TaskItem>
        </TaskContent>
      </Task>
    </div>
  ),
};

/**
 * Items can reference files inline using `TaskItemFile`, optionally with a
 * leading icon for a richer chip.
 */
export const WithFileReferences: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Steps that mention specific files using the `TaskItemFile` chip, including one with a leading icon.",
      },
    },
  },
  render: (args) => (
    <div className="max-w-md">
      <Task {...args}>
        <TaskTrigger title="Touched files" status="in-progress" />
        <TaskContent>
          <TaskItem status="completed">
            Updated <TaskItemFile>src/auth/session.ts</TaskItemFile> and{" "}
            <TaskItemFile>src/auth/index.ts</TaskItemFile>
          </TaskItem>
          <TaskItem status="in-progress">
            Editing{" "}
            <TaskItemFile>
              <FileText aria-hidden="true" className="size-3" />
              src/routes/login.tsx
            </TaskItemFile>
          </TaskItem>
          <TaskItem status="pending">Add a regression test</TaskItem>
        </TaskContent>
      </Task>
    </div>
  ),
};

/**
 * A fully completed plan — useful for confirming the resting "done" state.
 */
export const AllCompleted: Story = {
  parameters: {
    docs: {
      description: {
        story: "Every step completed, with a completed header status icon.",
      },
    },
  },
  render: (args) => (
    <div className="max-w-md">
      <Task {...args}>
        <TaskTrigger title="Ship the release" status="completed" />
        <TaskContent>
          <TaskItem status="completed">Bump the version</TaskItem>
          <TaskItem status="completed">Run the test suite</TaskItem>
          <TaskItem status="completed">Tag and publish</TaskItem>
        </TaskContent>
      </Task>
    </div>
  ),
};

/**
 * Starts collapsed via `defaultOpen={false}`; click the header to expand.
 */
export const StartCollapsed: Story = {
  args: { defaultOpen: false },
  parameters: {
    docs: {
      description: {
        story: "Mounted closed with `defaultOpen={false}`. Click the header to reveal the steps.",
      },
    },
  },
  render: (args) => (
    <div className="max-w-md">
      <Task {...args}>
        <TaskTrigger title="Collapsed by default" status="pending" />
        <TaskContent>
          <TaskItem status="pending">Hidden until you expand</TaskItem>
          <TaskItem status="pending">Another queued step</TaskItem>
        </TaskContent>
      </Task>
    </div>
  ),
};

/**
 * Uses the root `title` prop instead of an explicit `TaskTrigger` child — the
 * shortest way to render a header.
 */
export const TitleProp: Story = {
  args: { title: "Quick plan (title prop)" },
  parameters: {
    docs: {
      description: {
        story:
          "When you don't need a status icon, pass `title` to `Task` directly and skip `TaskTrigger`.",
      },
    },
  },
  render: (args) => (
    <div className="max-w-md">
      <Task {...args}>
        <TaskContent>
          <TaskItem status="completed">Step one</TaskItem>
          <TaskItem status="in-progress">Step two</TaskItem>
        </TaskContent>
      </Task>
    </div>
  ),
};

/**
 * Several tasks stacked into a single plan view, mimicking an agent working
 * through a multi-phase to-do list.
 */
export const Stacked: Story = {
  parameters: {
    docs: {
      description: {
        story: "Multiple independent Task surfaces stacked to form a richer plan board.",
      },
    },
  },
  render: (args) => (
    <div className="flex max-w-md flex-col gap-3">
      <Task {...args}>
        <TaskTrigger title="Phase 1 · Investigate" status="completed" />
        <TaskContent>
          <TaskItem status="completed">Reproduce the bug</TaskItem>
          <TaskItem status="completed">
            Locate it in <TaskItemFile>src/db/pool.ts</TaskItemFile>
          </TaskItem>
        </TaskContent>
      </Task>
      <Task {...args}>
        <TaskTrigger title="Phase 2 · Fix" status="in-progress" />
        <TaskContent>
          <TaskItem status="completed">Patch the connection limit</TaskItem>
          <TaskItem status="in-progress">Add a backoff</TaskItem>
          <TaskItem status="pending">Verify under load</TaskItem>
        </TaskContent>
      </Task>
    </div>
  ),
};

/**
 * Controlled mode: open state lives in parent React state and is toggled both
 * by the header and an external button.
 */
export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Fully controlled via `open` and `onOpenChange`, with an external button also driving visibility.",
      },
    },
  },
  render: function ControlledStory(args) {
    const [open, setOpen] = React.useState(true);
    return (
      <div className="flex max-w-md flex-col gap-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="border-border text-foreground hover:bg-accent-muted self-start rounded-md border px-3 py-1.5 text-sm"
        >
          {open ? "Collapse" : "Expand"} externally
        </button>
        <Task {...args} open={open} onOpenChange={setOpen}>
          <TaskTrigger title="Externally controlled plan" status="in-progress" />
          <TaskContent>
            <TaskItem status="completed">State is owned by the parent</TaskItem>
            <TaskItem status="in-progress">Header and button both toggle it</TaskItem>
          </TaskContent>
        </Task>
      </div>
    );
  },
};
