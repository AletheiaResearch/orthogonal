import type { CollectionConfig } from "payload";

import { formatSlugHook, validateSlug } from "../fields/slug";

export const Categories: CollectionConfig = {
  slug: "categories",
  access: {
    read: () => true,
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug"],
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      hooks: {
        beforeValidate: [formatSlugHook],
      },
      validate: validateSlug,
    },
    {
      name: "description",
      type: "textarea",
    },
  ],
};
