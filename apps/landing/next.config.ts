import path from "path";
import { fileURLToPath } from "url";

import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

// Media is served from the R2 public domain (R2_PUBLIC_URL, default below). Derive
// the next/image allow-list host from it so a custom domain doesn't break <Image>.
// Mirrors lib/r2.ts; declared in turbo.json `env` so it's available under strict mode.
const r2Host = new URL(process.env.R2_PUBLIC_URL?.trim() || "https://chronicles.orto.sh").hostname;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: r2Host,
        pathname: "/**",
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      ".cjs": [".cts", ".cjs"],
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };

    return webpackConfig;
  },
  turbopack: {
    // Monorepo root, so Turbopack can resolve pnpm-hoisted packages (next, etc.)
    // that live under the workspace root's node_modules/.pnpm store.
    root: path.resolve(dirname, "../.."),
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
