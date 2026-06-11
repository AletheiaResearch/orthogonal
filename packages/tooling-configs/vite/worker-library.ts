import { defineConfig, type UserConfigExport } from "vite";

export interface WorkerLibraryViteOptions {
  entry?: string;
  outDir?: string;
}

/**
 * Vite config for workspace libraries consumed by Cloudflare Workers (e.g. @open-inspect/shared).
 * Bundles all runtime dependencies so transitive CJS requires (cron-parser → luxon) resolve in workerd.
 */
export function defineWorkerLibraryViteConfig(
  options: WorkerLibraryViteOptions = {}
): UserConfigExport {
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
        external: () => false,
      },
    },
  });
}
