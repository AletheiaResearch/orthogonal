import type { Meta, StoryObj } from "@storybook/react-vite";

import { SafeMarkdown } from "./index";

const meta = {
  title: "Composite/safe-markdown",
  component: SafeMarkdown,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'Renders untrusted Markdown as styled HTML with a strict rehype-sanitize allowlist that blocks XSS vectors (script/style/iframe and arbitrary attributes). Use it to display user- or model-generated Markdown content such as chat messages, PR descriptions, or session output where the source cannot be trusted. Links open in a new tab with `rel="noopener noreferrer nofollow"`.',
      },
    },
  },
  argTypes: {
    content: {
      description: "The raw Markdown string to render. GitHub Flavored Markdown is supported.",
      control: "text",
    },
    className: {
      description:
        "Additional Tailwind classes appended to the `prose` wrapper, e.g. to constrain width or adjust spacing.",
      control: "text",
    },
  },
  args: {
    content: "Render **safe** Markdown with a single `content` prop.",
  },
} satisfies Meta<typeof SafeMarkdown>;

export default meta;

type Story = StoryObj<typeof SafeMarkdown>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Basic inline formatting: bold text and inline code from a short Markdown string.",
      },
    },
  },
};

export const RichDocument: Story = {
  args: {
    content: [
      "# Release notes",
      "",
      "We shipped a few **improvements** this week:",
      "",
      "- Faster session startup",
      "- Better _error_ messages",
      "- New `--verbose` flag",
      "",
      "## Details",
      "",
      "See the [changelog](https://example.com/changelog) for the full list.",
    ].join("\n"),
  },
  parameters: {
    docs: {
      description: {
        story:
          "A fuller document combining headings, lists, emphasis, inline code, and a link to exercise the custom renderers together.",
      },
    },
  },
};

export const CodeBlock: Story = {
  args: {
    content: [
      "Install and run:",
      "",
      "```bash",
      "pnpm install",
      "pnpm run build",
      "```",
      "",
      "```ts",
      "export function greet(name: string): string {",
      "  return `Hello, ${name}!`;",
      "}",
      "```",
    ].join("\n"),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Fenced code blocks are wrapped in a `not-prose` `<pre>` and keep their language class so rehype-highlight can apply syntax highlighting.",
      },
    },
  },
};

export const Table: Story = {
  args: {
    content: [
      "| Package | Status | Notes |",
      "| ------- | ------ | ----- |",
      "| shared  | ✅     | built first |",
      "| web     | ✅     | Next.js |",
      "| orto    | ⚠️     | Vercel-only |",
    ].join("\n"),
  },
  parameters: {
    docs: {
      description: {
        story:
          "GitHub Flavored Markdown tables render with bordered, padded cells inside a horizontally scrollable container.",
      },
    },
  },
};

export const Blockquote: Story = {
  args: {
    content: [
      "> The best way to predict the future is to invent it.",
      ">",
      "> — Alan Kay",
      "",
      "Surrounding paragraph text for context.",
    ].join("\n"),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Blockquotes are styled with a left border, italic text, and muted foreground color.",
      },
    },
  },
};

export const SanitizedXss: Story = {
  args: {
    content: [
      "This input contains dangerous HTML that is stripped:",
      "",
      "<script>alert('xss')</script>",
      "",
      "<img src=x onerror=alert(1) />",
      "",
      "But this **safe** content still renders, and only http(s) [links](https://example.com) survive.",
    ].join("\n"),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Demonstrates the strict sanitization schema: script tags, event-handler attributes, and disallowed elements are removed while safe Markdown is preserved.",
      },
    },
  },
};

export const Constrained: Story = {
  args: {
    className: "max-w-sm rounded border border-border p-3",
    content:
      "The `className` prop is merged onto the `prose` wrapper, here constraining the width and adding a card-like border.",
  },
  parameters: {
    docs: {
      description: {
        story: "Shows how a custom `className` composes with the default `prose` styling.",
      },
    },
  },
};
