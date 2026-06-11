import base from "@orthogonal/tooling-configs/oxlint/base";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/build/**",
    "**/.wrangler/**",
    "**/coverage/**",
    "**/.venv/**",
    "**/venv/**",
    "opencode-reference/**",
    "**/*.d.ts",
    "packages/modal-infra/**",
    "packages/sandbox-runtime/**",
    "packages/modal-infra/**/*.js",
  ],
  options: {
    typeAware: true,
  },
});
