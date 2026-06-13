import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState } from "react";

import { Conversation, ConversationContent, ConversationScrollButton } from "./conversation";

/**
 * `Conversation` is a scrollable message container that auto-sticks to the
 * bottom as content streams in. The moment the user scrolls up, auto-scroll
 * pauses and a floating <ConversationScrollButton> appears so they can jump back
 * to the latest content.
 *
 * It is fully decoupled from any chat or agent protocol — it only renders the
 * children you give it inside <ConversationContent>. Wire it to messages,
 * streaming tokens, logs, or anything that grows over time.
 */
const meta = {
  title: "AI/Conversation",
  component: Conversation,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A scrollable container that pins to the bottom as content streams in and surfaces a scroll-to-bottom button once the user scrolls away. Pair it with ConversationContent (a padded column) and ConversationScrollButton.",
      },
    },
  },
  argTypes: {
    autoScrollBehavior: {
      description:
        "Scroll behavior used when content grows while pinned. Use `auto` for instant jumps on very chatty streams; `smooth` (default) for a gentler follow.",
      control: "radio",
      options: ["smooth", "auto"],
    },
    className: {
      description:
        "Classes merged onto the scroll viewport. Set a height so it can actually scroll.",
      control: "text",
    },
    children: {
      description:
        "Conversation content — typically a <ConversationContent> column plus a <ConversationScrollButton>.",
      control: false,
    },
  },
  args: {
    autoScrollBehavior: "smooth",
  },
} satisfies Meta<typeof Conversation>;

export default meta;
type Story = StoryObj<typeof Conversation>;

interface SampleMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
}

function Bubble({ message }: { message: SampleMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "bg-accent text-accent-foreground max-w-[80%] rounded-lg px-3 py-2 text-sm"
            : "bg-muted text-foreground max-w-[80%] rounded-lg px-3 py-2 text-sm"
        }
      >
        {message.text}
      </div>
    </div>
  );
}

const SEED: SampleMessage[] = [
  { id: 1, role: "user", text: "Can you walk me through how the sandbox warm pool works?" },
  {
    id: 2,
    role: "assistant",
    text: "Sure. The warm pool keeps a small set of pre-initialized sandboxes idle so a new session can attach instantly instead of waiting on a cold start.",
  },
  { id: 3, role: "user", text: "How does it decide the pool size?" },
  {
    id: 4,
    role: "assistant",
    text: "It tracks recent demand and keeps roughly enough instances warm to cover the typical burst, scaling the reserve up after spikes and letting it drain during quiet periods.",
  },
];

/**
 * A short conversation that fits comfortably in the viewport — already pinned to
 * the bottom, so no scroll button is shown.
 */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A handful of messages that fit within the container. The view is pinned to the bottom, so the scroll-to-bottom button stays hidden.",
      },
    },
  },
  render: (args) => (
    <Conversation {...args} className="border-border h-72 border">
      <ConversationContent>
        {SEED.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  ),
};

/**
 * Many messages overflow the viewport. Scroll up and the floating
 * scroll-to-bottom button appears; click it to smooth-scroll back to the end.
 */
export const Overflowing: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "More content than fits in the container. Scroll up to reveal the scroll-to-bottom button, then click it to return to the latest message.",
      },
    },
  },
  render: (args) => {
    const many: SampleMessage[] = Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      role: i % 2 === 0 ? "user" : "assistant",
      text:
        i % 2 === 0
          ? `Question ${i / 2 + 1}: what happens at step ${i + 1} of the session lifecycle?`
          : `At that step the control plane forwards the prompt over the WebSocket and the sandbox begins streaming events back.`,
    }));
    return (
      <Conversation {...args} className="border-border h-80 border">
        <ConversationContent>
          {many.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    );
  },
};

/**
 * Simulates a streaming session: a new assistant token is appended every few
 * hundred milliseconds. While pinned, the view follows the stream automatically.
 * Scroll up mid-stream and it stops following until you click the button.
 */
export const Streaming: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "New tokens are appended on an interval to mimic a live model stream. The container auto-sticks to the bottom while pinned, and pauses the moment you scroll up.",
      },
    },
  },
  render: (args) => {
    const Demo = () => {
      const words =
        "Streaming responses arrive token by token, and this container keeps the newest text in view so you never lose the thread as the model thinks out loud and continues generating its answer.".split(
          " "
        );
      const [count, setCount] = useState(1);
      const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

      useEffect(() => {
        intervalRef.current = setInterval(() => {
          setCount((c) => (c >= words.length ? 1 : c + 1));
        }, 350);
        return () => {
          if (intervalRef.current) clearInterval(intervalRef.current);
        };
      }, [words.length]);

      return (
        <Conversation {...args} className="border-border h-72 border">
          <ConversationContent>
            <Bubble message={{ id: 1, role: "user", text: "Explain streaming responses." }} />
            <Bubble message={{ id: 2, role: "assistant", text: words.slice(0, count).join(" ") }} />
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      );
    };
    return <Demo />;
  },
};

/**
 * The empty state — an empty <ConversationContent> with placeholder text. No
 * scroll button, since there is nothing to scroll past.
 */
export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story: "An empty conversation with a centered placeholder, before any messages exist.",
      },
    },
  },
  render: (args) => (
    <Conversation {...args} className="border-border flex h-72 items-center justify-center border">
      <ConversationContent className="items-center justify-center text-center">
        <p className="text-muted-foreground text-sm">No messages yet. Start the conversation.</p>
      </ConversationContent>
    </Conversation>
  ),
};
