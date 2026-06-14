import type { CollectionConfig } from "payload";

import { R2_PUBLIC_BASE } from "../lib/r2";

export const Media: CollectionConfig = {
  slug: "media",
  access: {
    read: () => true, // public images
  },
  upload: {
    mimeTypes: ["image/*"],
    // When R2 is enabled the Payload /api/media proxy route is disabled
    // (disablePayloadAccessControl), so a size-name here would 404 — build the
    // public R2 URL from the thumbnail's stored filename instead. When R2_BUCKET
    // is unset, media lives on local disk; return null so Payload falls back to
    // its default /api/media/file/... thumbnail rather than a dead R2 URL.
    adminThumbnail: ({ doc }) => {
      if (!process.env.R2_BUCKET) return null;
      const sizes = doc?.sizes as { thumbnail?: { filename?: string | null } } | undefined;
      const filename =
        sizes?.thumbnail?.filename ?? (typeof doc?.filename === "string" ? doc.filename : null);
      return filename ? `${R2_PUBLIC_BASE}/${filename}` : null;
    },
    imageSizes: [
      { name: "thumbnail", width: 400, height: 300, position: "centre" },
      { name: "card", width: 1024, height: 576, position: "centre" },
      { name: "og", width: 1200, height: 630, position: "centre" },
    ],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true, // accessibility: alt text mandatory
    },
    {
      name: "caption",
      type: "text",
    },
  ],
};
