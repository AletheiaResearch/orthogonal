import type { Meta, StoryObj } from "@storybook/react-vite";

import { CodeBlock, CodeBlockCopyButton } from "./index";

const TS_SAMPLE = `export function greet(name: string) {
  return \`Hello, \${name}!\`;
}

greet("world");`;

const SHELL_SAMPLE = `pnpm install
pnpm run build
pnpm --filter @orthogonal/ui test`;

const meta = {
  title: "AI/CodeBlock",
  component: CodeBlock,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A standalone fenced-code display with a language label and a slot for actions such as a copy-to-clipboard button. It renders source verbatim and degrades gracefully without a syntax-highlight theme, so it works in any context where you need to show a code snippet — AI assistant responses, docs, or devtools — without coupling to a highlighter or agent protocol.",
      },
    },
  },
  argTypes: {
    code: {
      description: "The raw source to display. Rendered verbatim with no parsing.",
      control: "text",
    },
    language: {
      description:
        "Optional language identifier shown as a header label and exposed via `data-language` / `language-*` for external highlighters.",
      control: "text",
    },
    showLineNumbers: {
      description: "Renders a gutter of 1-based line numbers alongside the code.",
      control: "boolean",
      table: { defaultValue: { summary: "false" } },
    },
    children: {
      description:
        "Slotted into the header's trailing edge — typically a `CodeBlockCopyButton`. The current code is provided via context.",
      control: false,
    },
    className: {
      description: "Additional Tailwind classes merged onto the container via `cn`.",
      control: "text",
    },
  },
  args: {
    code: TS_SAMPLE,
    language: "ts",
    showLineNumbers: false,
  },
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof CodeBlock>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "A basic TypeScript snippet with a language label and no extra actions.",
      },
    },
  },
};

export const WithCopyButton: Story = {
  args: {
    children: <CodeBlockCopyButton onCopy={() => console.log("copied")} />,
  },
  parameters: {
    docs: {
      description: {
        story:
          "The common configuration: a copy-to-clipboard button slotted into the header. Click it to copy the snippet — the icon flips to a check mark for a couple of seconds.",
      },
    },
  },
};

export const WithLineNumbers: Story = {
  args: {
    showLineNumbers: true,
    children: <CodeBlockCopyButton />,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Enables the line-number gutter, useful for longer snippets or when referencing specific lines.",
      },
    },
  },
};

export const ShellCommands: Story = {
  args: {
    code: SHELL_SAMPLE,
    language: "bash",
    children: <CodeBlockCopyButton />,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A shell snippet labeled `bash`. The language label is purely informational here since the component does no highlighting on its own.",
      },
    },
  },
};

export const NoLanguage: Story = {
  args: {
    code: "Plain text with no syntax to speak of.\nJust two lines.",
    language: undefined,
    children: <CodeBlockCopyButton />,
  },
  parameters: {
    docs: {
      description: {
        story:
          "When no `language` is provided the header falls back to a neutral `text` label and no `language-*` class is emitted.",
      },
    },
  },
};

export const CustomCopyLabel: Story = {
  args: {
    children: <CodeBlockCopyButton className="w-auto px-2 text-xs">Copy</CodeBlockCopyButton>,
  },
  parameters: {
    docs: {
      description: {
        story:
          "`CodeBlockCopyButton` accepts custom `children`, so you can render a text label instead of the default icon while keeping the copy + success behavior.",
      },
    },
  },
};

export const SingleLine: Story = {
  args: {
    code: `npx create-next-app@latest`,
    language: "bash",
    children: <CodeBlockCopyButton />,
  },
  parameters: {
    docs: {
      description: {
        story: "A compact single-line command — a frequent inline-install pattern.",
      },
    },
  },
};
