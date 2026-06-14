import path from "path";
import { fileURLToPath } from "url";

import { vercelPostgresAdapter } from "@payloadcms/db-vercel-postgres";
import { seoPlugin } from "@payloadcms/plugin-seo";
import type { GenerateDescription, GenerateTitle, GenerateURL } from "@payloadcms/plugin-seo/types";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { s3Storage } from "@payloadcms/storage-s3";
import { buildConfig } from "payload";
import sharp from "sharp";

import { Authors } from "./collections/Authors";
import { Categories } from "./collections/Categories";
import { Media } from "./collections/Media";
import { Posts } from "./collections/Posts";
import { Users } from "./collections/Users";
import { getServerSideURL } from "./lib/base-url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const generateTitle: GenerateTitle = ({ doc }) =>
  doc?.title ? `${doc.title} — Orthogonal` : "Orthogonal";

const generateDescription: GenerateDescription = ({ doc }) =>
  (doc?.excerpt as string | undefined) ?? "";

const generateURL: GenerateURL = ({ doc }) => `${getServerSideURL()}/blog/${doc?.slug}`;

export default buildConfig({
  editor: lexicalEditor({}),
  db: vercelPostgresAdapter({
    pool: {
      connectionString: process.env.CHRONICLES_POSTGRES_URL,
    },
    push: false, // never auto-sync schema; rely on `payload migrate`
  }),
  secret: process.env.PAYLOAD_SECRET || "",
  sharp,
  admin: {
    user: "users",
    meta: {
      robots: "noindex,nofollow",
    },
    livePreview: {
      // Relative URL so the iframe is served from the SAME host the admin is
      // browsed on (preview branch alias, prod domain, or localhost). The
      // live-preview handshake requires same-origin, and Vercel previews have
      // multiple hostnames, so a relative URL is the only reliable choice.
      // Routes through /preview to enable draft mode before rendering the post.
      url: ({ data }) =>
        `/preview?path=${encodeURIComponent(`/blog/${data.slug ?? ""}`)}&previewSecret=${process.env.PREVIEW_SECRET ?? ""}`,
      collections: ["posts"],
      breakpoints: [
        { label: "Mobile", name: "mobile", width: 375, height: 667 },
        { label: "Tablet", name: "tablet", width: 768, height: 1024 },
        { label: "Desktop", name: "desktop", width: 1440, height: 900 },
      ],
    },
  },
  collections: [Users, Media, Categories, Authors, Posts],
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  plugins: [
    seoPlugin({
      collections: ["posts"],
      uploadsCollection: "media",
      interfaceName: "SeoMeta",
      generateTitle,
      generateDescription,
      generateURL,
    }),
    s3Storage({
      enabled: Boolean(process.env.R2_BUCKET),
      collections: {
        media: {
          // Serve straight from R2 via the public custom domain — no Payload
          // /api/media proxy route is registered.
          disablePayloadAccessControl: true,
          // Applied to the original AND every image size variant (thumbnail/
          // card/og). `filename` is already the resized variant filename, so
          // each size resolves to its own https://chronicles.orto.sh/... URL.
          generateFileURL: ({ filename, prefix }) => {
            const key = prefix ? `${prefix}/${filename}` : filename;
            return `https://chronicles.orto.sh/${key}`;
          },
        },
      },
      bucket: process.env.R2_BUCKET || "",
      config: {
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
        },
        // R2 ignores real regions; "auto" is the documented value.
        region: "auto",
        // S3 API endpoint, serves uploads only — not file serving.
        endpoint: process.env.R2_ENDPOINT,
        // R2 requires path-style addressing (bucket in the path, not vhost).
        forcePathStyle: true,
      },
      // No `acl` for R2 — public access comes from the custom-domain binding
      // in Cloudflare, not from AWS-style object ACLs.
    }),
  ],
});
