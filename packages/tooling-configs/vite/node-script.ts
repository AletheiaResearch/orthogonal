import { defineConfig, type UserConfigExport } from "vite";

export interface NodeScriptViteOptions {
  entry: string;
  fileName: string;
  outDir?: string;
}

/** Vite config for one-off Node scripts shipped as bundled ESM artifacts. */
export function defineNodeScriptViteConfig(options: NodeScriptViteOptions): UserConfigExport {
  const { entry, fileName, outDir = "dist" } = options;

  return defineConfig({
    build: {
      lib: {
        entry,
        formats: ["es"],
        fileName,
      },
      outDir,
      emptyOutDir: false,
      target: "node22",
      minify: false,
      rollupOptions: {
        external: [/^node:/],
      },
    },
  });
}
