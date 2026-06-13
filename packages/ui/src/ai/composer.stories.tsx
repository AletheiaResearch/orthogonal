import type { Meta, StoryObj } from "@storybook/react-vite";
import { Eraser, HelpCircle, RotateCcw, SlidersHorizontal } from "lucide-react";
import * as React from "react";

import { Composer } from "./composer";
import { PromptInputEffort, PromptInputModelSelect } from "./prompt-input";
import { type SlashCommand } from "./slash-command-popover";

const meta = {
  title: "AI/Composer",
  component: Composer,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "A chat composer that layers slash-command discovery on top of `PromptInput`. It reuses the existing input shell (auto-resizing textarea, toolbar, submit/stop button) and owns only the slash layer: detecting when the input is a slash token, opening the `SlashCommandPopover`, filtering commands, tracking the active row, and handling keyboard nav (Up/Down to move, Enter to select, Escape to close). Fully decoupled — `commands` are plain data and selection is reported via `onCommand`, so the host wires real behavior. Type `/` to open the popover.",
      },
    },
  },
  argTypes: {
    commands: {
      description: "The full set of slash commands; filtered internally as the user types.",
      control: "object",
    },
    onSubmit: {
      description:
        "Called with the trimmed message text on submit (Enter with popover closed, or Send).",
      action: "submitted",
    },
    onCommand: {
      description: "Called when a slash command is chosen. Defaults to clearing the slash token.",
      action: "command",
    },
    placeholder: {
      description: "Placeholder shown in the textarea when empty.",
      control: "text",
    },
    status: {
      description: 'Submit button status. "streaming" turns it into a Stop button.',
      control: "radio",
      options: ["ready", "streaming"],
    },
    className: {
      description: "Extra classes merged onto the PromptInput form container.",
      control: "text",
    },
  },
  args: {
    commands: [],
    onSubmit: (_text: string) => {},
    placeholder: "Send a message, or type / for commands",
  },
} satisfies Meta<typeof Composer>;

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

const MODELS = ["gpt-x", "claude-pro", "gemini-flash"];
const EFFORTS = ["low", "medium", "high"];

/** A stateful host that records the last submit/command, like a real consumer. */
function ComposerHost({ commands, toolbar, ...props }: React.ComponentProps<typeof Composer>) {
  const [lastSubmit, setLastSubmit] = React.useState<string | null>(null);
  const [lastCommand, setLastCommand] = React.useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <Composer
        {...props}
        commands={commands}
        toolbar={toolbar}
        onSubmit={(text) => {
          props.onSubmit?.(text);
          setLastSubmit(text);
        }}
        onCommand={(command) => {
          props.onCommand?.(command);
          setLastCommand(command.trigger);
        }}
      />
      <div className="text-muted-foreground flex flex-col gap-1 text-sm">
        {lastSubmit !== null && (
          <p>
            Submitted: <span className="text-foreground">{lastSubmit}</span>
          </p>
        )}
        {lastCommand !== null && (
          <p>
            Ran command: <span className="text-foreground">/{lastCommand}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A complete composer. Type a message and press Enter to submit, or type `/` to open the command popover and navigate it with the arrow keys.",
      },
    },
  },
  render: (args) => <ComposerHost {...args} commands={COMMANDS} />,
};

export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The resting state with no text — the submit button is disabled until the user types.",
      },
    },
  },
  render: (args) => <ComposerHost {...args} commands={COMMANDS} />,
};

export const WithCommands: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Type `/` to reveal every command. Each row shows its title, `/trigger` token, an optional icon, and a description.",
      },
    },
  },
  render: (args) => (
    <ComposerHost {...args} commands={COMMANDS} placeholder="Type / to see commands" />
  ),
};

export const Filtered: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Filtering matches against both the trigger and the title. Type `/cl` to narrow the list to commands like `/clear`.",
      },
    },
  },
  render: (args) => <ComposerHost {...args} commands={COMMANDS} placeholder="Try typing /cl" />,
};

export const WithDescriptions: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Commands carry optional `description` text shown beneath each title, useful for explaining what a command does before it is run.",
      },
    },
  },
  render: (args) => <ComposerHost {...args} commands={COMMANDS} />,
};

export const WithToolbar: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The `toolbar` slot accepts any toolbar controls — here a model selector and an effort cycler — laid out to the left of the submit button.",
      },
    },
  },
  render: function WithToolbarComposer(args) {
    const [model, setModel] = React.useState(MODELS[0]);
    const [effort, setEffort] = React.useState<string | undefined>("medium");
    return (
      <ComposerHost
        {...args}
        commands={COMMANDS}
        toolbar={
          <>
            <PromptInputModelSelect>
              <button
                type="button"
                onClick={() => setModel(MODELS[(MODELS.indexOf(model) + 1) % MODELS.length])}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition"
              >
                {model}
              </button>
            </PromptInputModelSelect>
            <PromptInputEffort efforts={EFFORTS} value={effort} onSelect={setEffort} />
          </>
        }
      />
    );
  },
};

export const Streaming: Story = {
  args: { status: "streaming" },
  parameters: {
    docs: {
      description: {
        story:
          'With `status="streaming"`, the submit button becomes a Stop button — wire `onStop` to cancel the in-flight response.',
      },
    },
  },
  render: function StreamingComposer(args) {
    const [streaming, setStreaming] = React.useState(true);
    return (
      <ComposerHost
        {...args}
        commands={COMMANDS}
        status={streaming ? "streaming" : "ready"}
        onStop={() => setStreaming(false)}
        onSubmit={() => setStreaming(true)}
      />
    );
  },
};
