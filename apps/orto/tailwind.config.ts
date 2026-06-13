import orthogonalUiPreset from "@orthogonal/ui/tailwind-preset";
import type { Config } from "tailwindcss";

const config: Config = {
  presets: [orthogonalUiPreset],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "!../../packages/ui/src/**/*.stories.{ts,tsx}",
    "!../../packages/ui/src/**/*.test.{ts,tsx}",
  ],
};

export default config;
