import { defineConfig, type UserConfigExport } from "vite";

export interface WorkerAppViteOptions {
  entry?: string;
  outDir?: string;
}

/** Vite config for Cloudflare Worker entrypoints (control-plane, bots). */
export function defineWorkerAppViteConfig(options: WorkerAppViteOptions = {}): UserConfigExport {
  const { entry = "src/index.ts", outDir = "dist" } = options;

  return defineConfig({
    build: {
      lib: {
        entry,
        formats: ["es"],
        fileName: "index",
      },
      outDir,
      emptyOutDir: true,
      target: "es2022",
      minify: false,
      rollupOptions: {
        external: [/^cloudflare:/, /^node:/],
      },
    },
  });
}
