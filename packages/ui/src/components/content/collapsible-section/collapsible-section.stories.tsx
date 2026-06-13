import type { Meta, StoryObj } from "@storybook/react-vite";

import { CollapsibleSection } from "./index";

/**
 * `CollapsibleSection` is a self-contained, single-section disclosure: a header
 * row that toggles the visibility of its children when clicked, with a chevron
 * that rotates to indicate the open/closed state.
 *
 * Use it to group related controls or content behind a labelled, expandable
 * header — for example the stacked sections of a sidebar or settings panel. It
 * manages its own open state internally, so the only configuration is the
 * `title` and the initial `defaultOpen` value.
 */
const meta = {
  title: "Composite/collapsible-section",
  component: CollapsibleSection,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A labelled disclosure section that toggles its children open and closed when the header is clicked, with a rotating chevron indicator. Ideal for stacking groups of content in a sidebar or settings panel.",
      },
    },
  },
  argTypes: {
    title: {
      description: "The text label rendered in the always-visible header row.",
      control: "text",
    },
    defaultOpen: {
      description:
        "Whether the section starts expanded on first mount. State is managed internally thereafter. Defaults to `true`.",
      control: "boolean",
    },
    children: {
      description: "The content revealed when the section is open. Accepts any React node.",
      control: false,
    },
  },
  args: {
    title: "Section title",
    defaultOpen: true,
    children: (
      <p className="text-muted-foreground text-sm">
        This content is revealed when the section is expanded.
      </p>
    ),
  },
} satisfies Meta<typeof CollapsibleSection>;

export default meta;
type Story = StoryObj<typeof CollapsibleSection>;

/**
 * The default state: the section is expanded on mount and its children are
 * visible. Clicking the header collapses it.
 */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Expanded by default — the children are shown and the chevron points up. Click the header to collapse.",
      },
    },
  },
};

/**
 * Starts collapsed via `defaultOpen={false}`. Only the header is shown until the
 * user clicks to expand it.
 */
export const Collapsed: Story = {
  args: {
    title: "Collapsed section",
    defaultOpen: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Initially closed — only the header row is rendered. Click it to reveal the children.",
      },
    },
  },
};

/**
 * Sections render their full border treatment when wrapped together: each has a
 * bottom border except the last, mirroring how they appear stacked in a sidebar.
 */
export const Stacked: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Multiple sections stacked in a bordered container, each independently expandable — the typical sidebar arrangement.",
      },
    },
  },
  render: () => (
    <div className="border-border-muted w-72 overflow-hidden rounded-md border">
      <CollapsibleSection title="Repositories" defaultOpen>
        <p className="text-muted-foreground text-sm">
          Pick which repositories the agent can access.
        </p>
      </CollapsibleSection>
      <CollapsibleSection title="Branches" defaultOpen={false}>
        <p className="text-muted-foreground text-sm">Restrict sessions to specific branches.</p>
      </CollapsibleSection>
      <CollapsibleSection title="Secrets" defaultOpen={false}>
        <p className="text-muted-foreground text-sm">
          Encrypted environment variables for the sandbox.
        </p>
      </CollapsibleSection>
    </div>
  ),
};

/**
 * The children can be any React node, including interactive controls and lists,
 * not just plain text.
 */
export const RichContent: Story = {
  args: {
    title: "Advanced options",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Demonstrates arbitrary React children — here a small list with an action — inside the expanded panel.",
      },
    },
  },
  render: (args) => (
    <div className="w-72">
      <CollapsibleSection {...args}>
        <ul className="text-muted-foreground mb-3 space-y-1 text-sm">
          <li>Enable verbose logging</li>
          <li>Use warm pool snapshots</li>
          <li>Skip dependency cache</li>
        </ul>
        <button type="button" className="text-foreground text-sm font-medium underline">
          Reset to defaults
        </button>
      </CollapsibleSection>
    </div>
  ),
};
