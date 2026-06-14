import { getPayload } from "payload";

import type { Post } from "./payload-types";
import config from "./payload.config";

/**
 * Dev-only seed: a few categories, an author, and two published posts (one
 * featured) so /blog and live preview have content. Run with:
 *   pnpm --filter @orthogonal/landing seed
 * Idempotent: skips entirely if any posts already exist, and reuses existing
 * categories by slug so partial reruns don't hit unique constraints. Refuses to
 * run in production/Vercel. Requires a reachable database.
 */

const paragraph = (text: string): NonNullable<Post["content"]> => ({
  root: {
    type: "root",
    direction: "ltr",
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "paragraph",
        direction: "ltr",
        format: "",
        indent: 0,
        version: 1,
        children: [
          { type: "text", detail: 0, format: 0, mode: "normal", style: "", text, version: 1 },
        ],
      },
    ],
  },
});

// afterChange/afterDelete revalidation only works inside a request scope, so
// suppress it while seeding from the CLI.
const ctx = { context: { disableRevalidate: true } };

const seed = async () => {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    console.error("Refusing to seed in a production/Vercel environment. Skipping.");
    process.exit(0);
  }

  const payload = await getPayload({ config });

  const { totalDocs: postCount } = await payload.count({ collection: "posts" });
  if (postCount > 0) {
    payload.logger.info("Posts already exist — skipping seed.");
    return;
  }

  const { totalDocs: userCount } = await payload.count({ collection: "users" });
  if (userCount === 0) {
    await payload.create({
      collection: "users",
      data: {
        email: "admin@orto.sh",
        password: "changeme123",
        name: "Nejc Drobnic",
        roles: "admin",
      },
      ...ctx,
    });
    payload.logger.info("Created admin user: admin@orto.sh / changeme123 (change this!)");
  }

  // Look up by slug and reuse so reruns after posts are deleted don't hit the
  // unique slug constraint.
  const ensureCategory = async (title: string, slug: string, description: string) => {
    const existing = await payload.find({
      collection: "categories",
      where: { slug: { equals: slug } },
      limit: 1,
    });
    if (existing.docs[0]) return existing.docs[0];
    return payload.create({
      collection: "categories",
      data: { title, slug, description },
      ...ctx,
    });
  };

  const writing = await ensureCategory("Writing", "writing", "Essays and notes.");
  const news = await ensureCategory("News", "news", "Product and company news.");

  const author = await payload.create({
    collection: "authors",
    data: { name: "Nejc Drobnic", title: "Founder", bio: paragraph("Building Orthogonal.") },
    ...ctx,
  });

  await payload.create({
    collection: "posts",
    data: {
      title: "Building on every axis at once",
      slug: "building-on-every-axis-at-once",
      excerpt: "Why orthogonality is the right primitive for background coding agents.",
      content: paragraph(
        "Orthogonal lets you build on every axis at once — spinning up sandboxed agents that work in parallel without stepping on each other."
      ),
      authors: [author.id],
      categories: [writing.id],
      publishedAt: "2026-06-12T09:00:00.000Z",
      featured: true,
      _status: "published",
    },
    ...ctx,
  });

  await payload.create({
    collection: "posts",
    data: {
      title: "Introducing background coding agents",
      slug: "introducing-background-coding-agents",
      excerpt: "Sandboxed environments that work while you don't.",
      content: paragraph(
        "Today we're introducing background coding agents: persistent, sandboxed environments that pick up tasks and report back through the same channels you already use."
      ),
      authors: [author.id],
      categories: [news.id],
      publishedAt: "2026-06-03T09:00:00.000Z",
      _status: "published",
    },
    ...ctx,
  });

  payload.logger.info("Seed complete.");
};

// Top-level await so `payload run` waits for the async work before exiting.
try {
  await seed();
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
