import { defineNodeScriptViteConfig } from "@orthogonal/tooling-configs/vite/node-script";

export default defineNodeScriptViteConfig({
  entry: "scripts/build-vercel-base-snapshot.ts",
  fileName: "vercel-base-snapshot",
});
