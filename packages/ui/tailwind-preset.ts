import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Shared Tailwind preset for @orthogonal/ui.
 *
 * Maps the semantic design-token CSS variables (defined in ./src/styles/tokens.css) to Tailwind
 * color utilities, sets class-based dark mode, and registers the typography + animate plugins the
 * components depend on. Consumers spread this via `presets: [orthogonalUiPreset]` and supply their
 * own `content` globs (which must include this package's source).
 */
const preset: Omit<Config, "content"> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        accent: "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
        "accent-muted": "var(--accent-muted)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        secondary: "var(--secondary)",
        "secondary-foreground": "var(--secondary-foreground)",
        border: "var(--border)",
        "border-muted": "var(--border-muted)",
        input: "var(--input)",
        ring: "var(--ring)",
        popover: "var(--popover)",
        "popover-foreground": "var(--popover-foreground)",
        destructive: "var(--destructive)",
        "destructive-foreground": "var(--destructive-foreground)",
        success: "var(--success)",
        "success-muted": "var(--success-muted)",
        warning: "var(--warning)",
        "warning-foreground": "var(--warning-foreground)",
        "warning-muted": "var(--warning-muted)",
        info: "var(--info)",
        "info-foreground": "var(--info-foreground)",
        "info-muted": "var(--info-muted)",
        "destructive-muted": "var(--destructive-muted)",
        "destructive-border": "var(--destructive-border)",
        overlay: "var(--overlay)",
      },
      borderRadius: {
        lg: "calc(var(--radius) * 2)",
        md: "var(--radius)",
        sm: "calc(var(--radius) / 2)",
      },
    },
  },
  plugins: [typography, animate],
};

export default preset;
