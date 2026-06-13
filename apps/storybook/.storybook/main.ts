import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  // Stories live in the @orthogonal/ui package source — Storybook is installed ONLY here, never in
  // orto. This glob is what makes the package's co-located *.stories.tsx render.
  stories: ["../../../packages/ui/src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  core: {
    disableTelemetry: true,
  },
};

export default config;
