import type { CollectionConfig } from "payload";

export const Media: CollectionConfig = {
  slug: "media",
  access: {
    read: () => true, // public images
  },
  upload: {
    mimeTypes: ["image/*"],
    // Serve admin previews from R2 too — the Payload /api/media proxy route is
    // disabled (disablePayloadAccessControl), so a size-name here would 404.
    // Build the URL from the thumbnail's stored filename.
    adminThumbnail: ({ doc }) => {
      const sizes = doc?.sizes as { thumbnail?: { filename?: string | null } } | undefined;
      const filename =
        sizes?.thumbnail?.filename ?? (typeof doc?.filename === "string" ? doc.filename : null);
      return filename ? `https://chronicles.orto.sh/${filename}` : null;
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
