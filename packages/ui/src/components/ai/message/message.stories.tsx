import type { Meta, StoryObj } from "@storybook/react-vite";

import { Message, MessageAvatar, MessageContent } from "./index";

const meta = {
  title: "AI/Message",
  component: Message,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A single chat turn: an avatar, a content bubble, and any optional header/footer you compose as children. Layout and tone key off the `from` role (user, assistant, or system). It is fully decoupled — pair `Message` with `MessageAvatar` and `MessageContent` to build chat and agent transcripts without binding to any session protocol.",
      },
    },
  },
  argTypes: {
    from: {
      description:
        "Author of the turn. User turns align to the trailing edge (avatar last); assistant and system turns align to the leading edge (avatar first).",
      control: "select",
      options: ["user", "assistant", "system"],
      table: { defaultValue: { summary: "assistant" } },
    },
    className: {
      description: "Additional Tailwind classes merged onto the row container via `cn`.",
      control: "text",
    },
    children: {
      description: "Turn content — typically a `MessageAvatar` and a `MessageContent`.",
      control: false,
    },
  },
  args: {
    from: "assistant",
  },
} satisfies Meta<typeof Message>;

export default meta;
type Story = StoryObj<typeof Message>;

export const Assistant: Story = {
  args: { from: "assistant" },
  parameters: {
    docs: {
      description: {
        story:
          "A standard assistant turn: avatar on the leading edge with a contained content bubble.",
      },
    },
  },
  render: (args) => (
    <Message {...args}>
      <MessageAvatar name="Assistant" fallback="AI" />
      <MessageContent>
        Sure — I can help with that. Here is a summary of the changes I made to the build pipeline.
      </MessageContent>
    </Message>
  ),
};

export const User: Story = {
  args: { from: "user" },
  parameters: {
    docs: {
      description: {
        story: "A user turn, mirrored so the avatar sits on the trailing edge after the bubble.",
      },
    },
  },
  render: (args) => (
    <Message {...args}>
      <MessageAvatar name="Ada Lovelace" />
      <MessageContent>Can you refactor the message component to be server-safe?</MessageContent>
    </Message>
  ),
};

export const System: Story = {
  args: { from: "system" },
  parameters: {
    docs: {
      description: {
        story:
          "A system turn — useful for status notices or context injected into the transcript. Pairs naturally with the flat content variant.",
      },
    },
  },
  render: (args) => (
    <Message {...args}>
      <MessageAvatar fallback="SYS" />
      <MessageContent variant="flat" className="text-muted-foreground">
        Session started. The assistant has access to the repository in read-only mode.
      </MessageContent>
    </Message>
  ),
};

export const ContainedVsFlat: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The two `MessageContent` variants side by side. `contained` (default) renders a filled, bordered bubble; `flat` drops the background for dense or full-width layouts.",
      },
    },
  },
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 480 }}>
      <Message from="assistant">
        <MessageAvatar name="Assistant" fallback="AI" />
        <MessageContent variant="contained">
          Contained: a rounded bubble with a subtle border and muted background.
        </MessageContent>
      </Message>
      <Message from="assistant">
        <MessageAvatar name="Assistant" fallback="AI" />
        <MessageContent variant="flat">
          Flat: no background or border — content flows inline with the layout.
        </MessageContent>
      </Message>
    </div>
  ),
};

export const AvatarImageVsInitials: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "`MessageAvatar` renders an image when `src` is set, an explicit `fallback` when provided, or initials derived from `name` otherwise.",
      },
    },
  },
  render: () => (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <MessageAvatar src="https://avatars.githubusercontent.com/u/9919?v=4" name="GitHub" />
      <MessageAvatar fallback="AI" />
      <MessageAvatar name="Ada Lovelace" />
      <MessageAvatar name="system" />
    </div>
  ),
};

export const WithHeaderAndFooter: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Headers and footers are pure composition — nest them inside `MessageContent`. Here a name/timestamp header and an actions footer wrap the body.",
      },
    },
  },
  render: () => (
    <Message from="assistant">
      <MessageAvatar name="Assistant" fallback="AI" />
      <MessageContent className="space-y-2">
        <header className="text-muted-foreground flex items-center justify-between text-xs">
          <span className="text-foreground font-medium">Assistant</span>
          <time>2:14 PM</time>
        </header>
        <p>I have opened a pull request with the build fix.</p>
        <footer className="text-accent flex gap-3 text-xs">
          <button type="button">Copy</button>
          <button type="button">Retry</button>
        </footer>
      </MessageContent>
    </Message>
  ),
};

export const Conversation: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A composed transcript alternating user and assistant turns, with a leading system notice — the primary real-world usage.",
      },
    },
  },
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 560 }}>
      <Message from="system">
        <MessageAvatar fallback="SYS" />
        <MessageContent variant="flat" className="text-muted-foreground">
          Connected to the build agent.
        </MessageContent>
      </Message>
      <Message from="user">
        <MessageAvatar name="Ada Lovelace" />
        <MessageContent>Why is the deploy failing?</MessageContent>
      </Message>
      <Message from="assistant">
        <MessageAvatar name="Assistant" fallback="AI" />
        <MessageContent>
          The shared package was not rebuilt before the dependent packages. Building it first
          resolves the type errors.
        </MessageContent>
      </Message>
      <Message from="user">
        <MessageAvatar name="Ada Lovelace" />
        <MessageContent>Great — go ahead and fix it.</MessageContent>
      </Message>
    </div>
  ),
};
