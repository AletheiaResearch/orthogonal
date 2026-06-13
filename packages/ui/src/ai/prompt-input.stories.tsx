import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import {
  PromptInput,
  PromptInputEffort,
  PromptInputModelSelect,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./prompt-input";

const meta = {
  title: "AI/PromptInput",
  component: PromptInput,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "The composer: a form wrapping an auto-resizing textarea with a toolbar row (model selector slot, effort control, custom buttons) and a submit/stop button. It is fully decoupled — text is controlled by the parent and `onSubmit` simply receives the trimmed message. Use it as the input surface for any chat or agent UI.",
      },
    },
  },
  argTypes: {
    onSubmit: {
      description: "Called with the trimmed textarea contents on submit. Empty text is ignored.",
      action: "submitted",
    },
    className: {
      description: "Additional Tailwind classes merged onto the form container.",
      control: "text",
    },
  },
  args: {
    onSubmit: (_value: string) => {},
  },
} satisfies Meta<typeof PromptInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const MODELS = ["gpt-x", "claude-pro", "gemini-flash"];
const EFFORTS = ["low", "medium", "high"];

/** Minimal model-selector slot stand-in: cycles through a list on click. */
function FakeModelSelect({
  value,
  onSelect,
  disabled,
}: {
  value: string;
  onSelect: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(MODELS[(MODELS.indexOf(value) + 1) % MODELS.length])}
      className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition disabled:opacity-50"
    >
      {value}
    </button>
  );
}

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A complete composer with a model selector slot, effort control, and submit button. Type a message and press Enter (or click Send) to submit — empty input is ignored.",
      },
    },
  },
  render: function DefaultComposer(args) {
    const [text, setText] = React.useState("");
    const [model, setModel] = React.useState(MODELS[0]);
    const [effort, setEffort] = React.useState<string | undefined>("medium");
    const [last, setLast] = React.useState<string | null>(null);

    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <PromptInput
          {...args}
          onSubmit={(value) => {
            args.onSubmit?.(value);
            setLast(value);
            setText("");
          }}
        >
          <PromptInputTextarea
            value={text}
            onChange={setText}
            placeholder="What do you want to build?"
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputModelSelect>
                <FakeModelSelect value={model} onSelect={setModel} />
              </PromptInputModelSelect>
              <PromptInputEffort efforts={EFFORTS} value={effort} onSelect={setEffort} />
            </PromptInputTools>
            <PromptInputSubmit disabled={!text.trim()} />
          </PromptInputToolbar>
        </PromptInput>
        {last && (
          <p className="text-muted-foreground text-sm">
            Last submitted: <span className="text-foreground">{last}</span>
          </p>
        )}
      </div>
    );
  },
};

export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The resting state with no text. The submit button is disabled until the parent enables it (here, when `text.trim()` is non-empty).",
      },
    },
  },
  render: () => (
    <div className="mx-auto w-full max-w-2xl">
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea value="" onChange={() => {}} placeholder="Ask anything..." />
        <PromptInputToolbar>
          <PromptInputTools>
            <PromptInputModelSelect>
              <span className="text-muted-foreground text-sm">gpt-x</span>
            </PromptInputModelSelect>
          </PromptInputTools>
          <PromptInputSubmit disabled />
        </PromptInputToolbar>
      </PromptInput>
    </div>
  ),
};

export const Streaming: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'While a response is streaming, set `status="streaming"` on the submit button. It turns into a Stop button (type `button`) so its `onClick` can cancel the in-flight request instead of submitting.',
      },
    },
  },
  render: function StreamingComposer() {
    const [streaming, setStreaming] = React.useState(true);
    const [text, setText] = React.useState("Summarize the latest changes");

    return (
      <div className="mx-auto w-full max-w-2xl">
        <PromptInput onSubmit={() => setStreaming(true)}>
          <PromptInputTextarea value={text} onChange={setText} />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputModelSelect>
                <span className="text-muted-foreground text-sm">claude-pro</span>
              </PromptInputModelSelect>
            </PromptInputTools>
            <PromptInputSubmit
              status={streaming ? "streaming" : "ready"}
              disabled={!streaming && !text.trim()}
              onClick={streaming ? () => setStreaming(false) : undefined}
            />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    );
  },
};

export const AutoResize: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The textarea grows with its content up to `maxHeight` (240px by default), then scrolls. Press Shift+Enter to add lines and watch it expand.",
      },
    },
  },
  render: function AutoResizeComposer() {
    const [text, setText] = React.useState(
      Array.from({ length: 6 }, (_, i) => `Line ${i + 1} of a longer multi-line prompt.`).join("\n")
    );
    return (
      <div className="mx-auto w-full max-w-2xl">
        <PromptInput onSubmit={() => {}}>
          <PromptInputTextarea value={text} onChange={setText} maxHeight={160} />
          <PromptInputToolbar>
            <PromptInputTools />
            <PromptInputSubmit disabled={!text.trim()} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    );
  },
};

export const EffortControl: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The standalone effort control. It is decoupled from any model config — pass a plain `efforts` array and it cycles through them on each click, wrapping at the end.",
      },
    },
  },
  render: function EffortStory() {
    const [effort, setEffort] = React.useState<string | undefined>("low");
    return (
      <div className="flex items-center gap-3">
        <PromptInputEffort efforts={EFFORTS} value={effort} onSelect={setEffort} />
        <span className="text-muted-foreground text-sm">current: {effort}</span>
      </div>
    );
  },
};

export const Disabled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Every control accepts `disabled`, useful while a session is initializing. The textarea, model slot, effort control, and submit button are all inert here.",
      },
    },
  },
  render: () => (
    <div className="mx-auto w-full max-w-2xl">
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea value="Connecting to sandbox..." onChange={() => {}} disabled />
        <PromptInputToolbar>
          <PromptInputTools>
            <PromptInputModelSelect>
              <span className="text-muted-foreground text-sm opacity-50">gpt-x</span>
            </PromptInputModelSelect>
            <PromptInputEffort efforts={EFFORTS} value="medium" onSelect={() => {}} disabled />
          </PromptInputTools>
          <PromptInputSubmit disabled />
        </PromptInputToolbar>
      </PromptInput>
    </div>
  ),
};
