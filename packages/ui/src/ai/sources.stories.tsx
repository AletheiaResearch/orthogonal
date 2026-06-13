import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Source, Sources, SourcesContent, SourcesTrigger } from "./sources";

/**
 * `Sources` is an AI-Elements-style collapsible block that lists the external
 * links an agent referenced while producing an answer. The header reads
 * "Used N sources" and toggles a list of safe external links (each opened in a
 * new tab with `rel="noopener noreferrer"`).
 *
 * It is fully decoupled from any agent or session protocol — it is driven only
 * by props and children, so you map your own citation data onto `<Source>`
 * children. Use it beneath a chat message to disclose grounding citations
 * without cluttering the response.
 */
const meta = {
  title: "AI/Sources",
  component: Sources,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A collapsible citations block listing external links an AI referenced. The header shows a source count and expands to reveal a list of safe external links. Decoupled and prop-driven.",
      },
    },
  },
  argTypes: {
    count: {
      description:
        'Number of sources, used to render the default trigger label ("Used N sources"). Pluralizes automatically.',
      control: { type: "number" },
    },
    defaultOpen: {
      description:
        "Whether the block starts expanded on first mount (uncontrolled). Defaults to `false`.",
      control: "boolean",
    },
    open: {
      description:
        "Controlled open state. When provided, the component does not manage its own state — pair with `onOpenChange`.",
      control: false,
    },
    onOpenChange: {
      description:
        "Called with the next open state whenever the trigger is activated. Required for controlled usage.",
      control: false,
    },
    children: {
      description:
        "Compose `<SourcesTrigger>` and `<SourcesContent>` (containing `<Source>` items) here.",
      control: false,
    },
  },
  args: {
    count: 3,
    defaultOpen: false,
  },
  decorators: [
    (Story) => (
      <div className="w-96 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Sources>;

export default meta;
type Story = StoryObj<typeof Sources>;

const SAMPLE_SOURCES = [
  { href: "https://react.dev/reference/react/useState", title: "useState – React" },
  {
    href: "https://nextjs.org/docs/app/building-your-application/rendering/server-components",
    title: "Server Components – Next.js",
  },
  {
    href: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy",
    title: "Referrer-Policy – MDN",
  },
];

/**
 * The default, collapsed state. Only the "Used 3 sources" header is visible;
 * clicking it reveals the list.
 */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Collapsed on mount. Click the header to disclose the list of referenced links.",
      },
    },
  },
  render: (args) => (
    <Sources {...args}>
      <SourcesTrigger />
      <SourcesContent>
        {SAMPLE_SOURCES.map((s) => (
          <Source key={s.href} href={s.href} title={s.title} />
        ))}
      </SourcesContent>
    </Sources>
  ),
};

/**
 * Expanded on mount via `defaultOpen`, showing the full list of sources.
 */
export const Open: Story = {
  args: { defaultOpen: true },
  parameters: {
    docs: {
      description: {
        story:
          "Starts expanded so the referenced links are immediately visible. The chevron points up.",
      },
    },
  },
  render: (args) => (
    <Sources {...args}>
      <SourcesTrigger />
      <SourcesContent>
        {SAMPLE_SOURCES.map((s) => (
          <Source key={s.href} href={s.href} title={s.title} />
        ))}
      </SourcesContent>
    </Sources>
  ),
};

/**
 * A single source — the label is singularized to "Used 1 source".
 */
export const SingleSource: Story = {
  args: { count: 1, defaultOpen: true },
  parameters: {
    docs: {
      description: {
        story:
          'With a count of 1 the header reads "Used 1 source" (singular), and only one link is shown.',
      },
    },
  },
  render: (args) => (
    <Sources {...args}>
      <SourcesTrigger />
      <SourcesContent>
        <Source href={SAMPLE_SOURCES[0]!.href} title={SAMPLE_SOURCES[0]!.title} />
      </SourcesContent>
    </Sources>
  ),
};

/**
 * When a `<Source>` has no `title`, the raw URL is displayed instead — useful
 * when only the href is known.
 */
export const WithoutTitles: Story = {
  args: { count: 2, defaultOpen: true },
  parameters: {
    docs: {
      description: {
        story:
          "Sources without a `title` fall back to rendering their `href`. The link is still truncated to fit.",
      },
    },
  },
  render: (args) => (
    <Sources {...args}>
      <SourcesTrigger />
      <SourcesContent>
        <Source href="https://example.com/a-fairly-long-url/that-should-truncate-nicely" />
        <Source href="https://another-example.org/docs" />
      </SourcesContent>
    </Sources>
  ),
};

/**
 * The trigger label can be overridden — here to "References" — for blocks that
 * are not strictly "sources".
 */
export const CustomLabel: Story = {
  args: { count: 4, defaultOpen: true },
  parameters: {
    docs: {
      description: {
        story: "Pass `label` to `<SourcesTrigger>` to override the default count-driven text.",
      },
    },
  },
  render: (args) => (
    <Sources {...args}>
      <SourcesTrigger label="References" />
      <SourcesContent>
        {SAMPLE_SOURCES.map((s) => (
          <Source key={s.href} href={s.href} title={s.title} />
        ))}
      </SourcesContent>
    </Sources>
  ),
};

/**
 * Controlled usage: the parent owns the open state via `open` + `onOpenChange`.
 */
export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The open state lives in the parent. Use `open` and `onOpenChange` to drive the block externally — for example syncing it with other UI.",
      },
    },
  },
  render: function ControlledStory(args) {
    const [open, setOpen] = React.useState(true);
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="border-border text-foreground hover:bg-muted rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          {open ? "Collapse" : "Expand"} externally
        </button>
        <Sources {...args} open={open} onOpenChange={setOpen}>
          <SourcesTrigger />
          <SourcesContent>
            {SAMPLE_SOURCES.map((s) => (
              <Source key={s.href} href={s.href} title={s.title} />
            ))}
          </SourcesContent>
        </Sources>
      </div>
    );
  },
};

/**
 * In context: a chat-style answer with its grounding sources disclosed beneath.
 */
export const InMessageContext: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A realistic placement — the Sources block sits below an assistant message, letting the reader expand the citations on demand.",
      },
    },
  },
  render: (args) => (
    <div className="space-y-3">
      <div className="bg-muted text-foreground rounded-md p-3 text-sm">
        Server Components render on the server and let you keep data-fetching out of the client
        bundle, while `useState` remains a client-only hook.
      </div>
      <Sources {...args}>
        <SourcesTrigger />
        <SourcesContent>
          {SAMPLE_SOURCES.map((s) => (
            <Source key={s.href} href={s.href} title={s.title} />
          ))}
        </SourcesContent>
      </Sources>
    </div>
  ),
};
