import { lexicalEditor } from "@payloadcms/richtext-lexical";
import type { CollectionConfig } from "payload";

export const Authors: CollectionConfig = {
  slug: "authors",
  access: {
    read: () => true,
  },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "title"],
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "title", // optional job title / byline
      type: "text",
    },
    {
      name: "bio",
      type: "richText",
      editor: lexicalEditor({}),
    },
    {
      name: "avatar",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "user", // optional link to a Payload user
      type: "relationship",
      relationTo: "users",
    },
  ],
};
