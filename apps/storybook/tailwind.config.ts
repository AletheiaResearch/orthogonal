import orthogonalUiPreset from "@orthogonal/ui/tailwind-preset";
import type { Config } from "tailwindcss";

const config: Config = {
  // The preset (semantic colors, borderRadius, typography + animate plugins, class dark mode) is the
  // single source of truth, shared with orto.
  presets: [orthogonalUiPreset],
  content: ["../../packages/ui/src/**/*.{ts,tsx}", "./.storybook/**/*.{ts,tsx}"],
};

export default config;
