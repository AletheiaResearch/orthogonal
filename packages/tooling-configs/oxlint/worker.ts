import { defineConfig } from "oxlint";

import base from "./base.ts";

export default defineConfig({
  extends: [base],
  plugins: ["typescript", "unicorn", "import", "oxc"],
  env: {
    worker: true,
  },
  rules: {
    "typescript/no-floating-promises": "error",
    "typescript/await-thenable": "error",
    "typescript/no-misused-promises": "error",
  },
});
