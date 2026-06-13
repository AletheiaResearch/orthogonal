import type { Decorator, Preview } from "@storybook/react-vite";
import { useEffect } from "react";

// Design tokens (single source of truth) + Tailwind base. Imported as JS so Vite resolves the
// package CSS reliably (no @import path-resolution guesswork).
import "@orthogonal/ui/styles/tokens.css";
import "../styles/global.css";

/** Toggle the authoritative `.dark` class so stories preview both themes from the toolbar. */
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme ?? "light";
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <Story />
    </div>
  );
};

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      description: "Global theme for components",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withTheme],
};

export default preview;
