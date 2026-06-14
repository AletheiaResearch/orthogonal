import path from "path";
import { fileURLToPath } from "url";

import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "chronicles.orto.sh",
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
