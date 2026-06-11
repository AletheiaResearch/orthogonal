import next from "@orthogonal/tooling-configs/oxlint/next";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [next],
  settings: {
    next: {
      rootDir: ".",
    },
  },
});
