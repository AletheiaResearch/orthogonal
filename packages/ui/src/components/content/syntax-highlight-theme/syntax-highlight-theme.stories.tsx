import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";

import {
  SyntaxHighlightTheme,
  type SyntaxHighlightThemeDefinition,
  type SyntaxHighlightThemeProps,
} from "./index";

const REGISTRY: SyntaxHighlightThemeDefinition[] = [
  {
    id: "atom-one-light",
    label: "Atom One Light",
    colorScheme: "light",
    cssPath: "/hljs-themes/atom-one-light.css",
  },
  {
    id: "github",
    label: "GitHub",
    colorScheme: "light",
    cssPath: "/hljs-themes/github.css",
  },
  {
    id: "atom-one-dark",
    label: "Atom One Dark",
    colorScheme: "dark",
    cssPath: "/hljs-themes/atom-one-dark.css",
  },
  {
    id: "github-dark",
    label: "GitHub Dark",
    colorScheme: "dark",
    cssPath: "/hljs-themes/github-dark.css",
  },
];

/**
 * Small wrapper that mounts the (headless) component and surfaces the
 * stylesheet it injects into `document.head`, so the otherwise-invisible side
 * effect is observable in the Storybook canvas.
 */
function ThemeLinkInspector(props: SyntaxHighlightThemeProps) {
  const [href, setHref] = useState<string | null>(null);

  // Re-read the injected link after each render of the headless component.
  useEffect(() => {
    const el = document.getElementById("hljs-theme-link") as HTMLLinkElement | null;
    setHref(el?.getAttribute("href") ?? null);
  });

  return (
    <div className="space-y-2 text-sm">
      <SyntaxHighlightTheme {...props} />
      <p className="text-foreground font-medium">
        SyntaxHighlightTheme renders <code>null</code> — it only injects a <code>&lt;link&gt;</code>{" "}
        into the document head.
      </p>
      <p className="text-muted-foreground">
        Active stylesheet: <code className="bg-muted rounded px-1 py-0.5">{href ?? "(none)"}</code>
      </p>
    </div>
  );
}

/**
 * `SyntaxHighlightTheme` is a headless, single-instance component that keeps the
 * active highlight.js stylesheet in sync with the user's syntax-highlight
 * preferences and the resolved app theme. Mount it once near the app root.
 *
 * It is intentionally storage-agnostic: the host app owns the `preferences`
 * (typically backed by localStorage) and the `themeRegistry` (the available
 * themes and their asset paths). This component only resolves which stylesheet
 * to load and reuses a single `<link>` element by id.
 */
const meta = {
  title: "Composite/syntax-highlight-theme",
  component: SyntaxHighlightTheme,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Headless component that dynamically loads the correct highlight.js theme stylesheet from a registry, driven by the user's preferences and the resolved app theme. Render a single instance at the app root; it manages one shared <link> element and renders nothing itself.",
      },
    },
  },
  argTypes: {
    preferences: {
      description:
        "The resolved syntax-highlight preferences: `colorSchemeMode` ('light' | 'dark' | 'system'), and the preferred theme id for each of the light and dark schemes. Owned by the host app.",
      control: "object",
    },
    themeRegistry: {
      description:
        "All available highlight.js themes. Each entry carries an `id`, `label`, `colorScheme`, and `cssPath`. Light/dark fallback lists are derived internally by filtering on `colorScheme`.",
      control: "object",
    },
  },
  args: {
    preferences: {
      colorSchemeMode: "light",
      preferredLightTheme: "atom-one-light",
      preferredDarkTheme: "atom-one-dark",
    },
    themeRegistry: REGISTRY,
  },
  render: (args) => <ThemeLinkInspector {...args} />,
} satisfies Meta<typeof SyntaxHighlightTheme>;

export default meta;
type Story = StoryObj<typeof SyntaxHighlightTheme>;

/**
 * Light mode with the preferred light theme selected. The injected stylesheet
 * resolves to the `atom-one-light` css path.
 */
export const LightMode: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "`colorSchemeMode: 'light'` loads the `preferredLightTheme` stylesheet from the registry.",
      },
    },
  },
};

/**
 * Dark mode with the preferred dark theme selected. The injected stylesheet
 * resolves to the `atom-one-dark` css path.
 */
export const DarkMode: Story = {
  args: {
    preferences: {
      colorSchemeMode: "dark",
      preferredLightTheme: "atom-one-light",
      preferredDarkTheme: "atom-one-dark",
    },
  },
  parameters: {
    docs: {
      description: {
        story: "`colorSchemeMode: 'dark'` loads the `preferredDarkTheme` stylesheet instead.",
      },
    },
  },
};

/**
 * `system` mode defers to the resolved app theme (via `next-themes`). Outside a
 * dark-resolving context this falls back to the light scheme.
 */
export const SystemMode: Story = {
  args: {
    preferences: {
      colorSchemeMode: "system",
      preferredLightTheme: "github",
      preferredDarkTheme: "github-dark",
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          "`colorSchemeMode: 'system'` follows the resolved theme from next-themes, defaulting to light when no dark scheme is resolved.",
      },
    },
  },
};

/**
 * When the preferred id is missing from the registry, the component falls back
 * to the first entry matching the active color scheme.
 */
export const UnknownThemeFallback: Story = {
  args: {
    preferences: {
      colorSchemeMode: "light",
      preferredLightTheme: "no-such-theme",
      preferredDarkTheme: "atom-one-dark",
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          "An unrecognized `preferredLightTheme` falls back to the first light entry in the registry (`atom-one-light`).",
      },
    },
  },
};
