import type { Access, CollectionConfig } from "payload";

const isAdmin: Access = ({ req: { user } }) => user?.roles === "admin";

export const Users: CollectionConfig = {
  slug: "users",
  auth: true, // enables email/password auth + admin login
  access: {
    // `access.admin` controls who can log into the Admin Panel.
    admin: ({ req: { user } }) => user?.roles === "admin" || user?.roles === "editor",
    read: ({ req: { user } }) => Boolean(user),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "roles"],
  },
  fields: [
    {
      name: "name",
      type: "text",
    },
    {
      name: "roles",
      type: "select",
      required: true,
      defaultValue: "editor",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Editor", value: "editor" },
      ],
      access: {
        // Only admins may change roles (field-level access).
        update: ({ req: { user } }) => user?.roles === "admin",
      },
    },
  ],
};
