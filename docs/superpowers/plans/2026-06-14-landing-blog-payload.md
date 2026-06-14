# Landing Blog (PayloadCMS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PayloadCMS-backed news/blog/writings section at `/blog` to `apps/landing`, in the
editorial-hub style (dark, Cormorant serif), with live preview, drafts, SEO, and
noindex-until-launch.

**Architecture:** Payload is co-located inside `apps/landing` (Vercel/Node). App Router is split
into two root layouts via route groups: `(frontend)` (marketing home + blog, imports `globals.css`)
and `(payload)` (generated admin + REST/GraphQL, imports Payload CSS only). Public pages read the DB
through Payload's zero-HTTP Local API in Server Components. Postgres = Neon via Vercel using
`@payloadcms/db-vercel-postgres`.

**Tech Stack:** Next.js 16.2.7 (App Router, React 19), PayloadCMS 3.85.0 (`payload`,
`@payloadcms/next`, `@payloadcms/db-vercel-postgres`, `@payloadcms/richtext-lexical`,
`@payloadcms/plugin-seo`, `@payloadcms/live-preview-react`), `sharp`, `graphql@^16`, Tailwind 4,
Vitest 4.

**Spec:** `docs/superpowers/specs/2026-06-14-landing-blog-payload-design.md`

---

## Canonical conventions (used throughout)

**Environment variables** (add to `apps/landing/.env.example`): | Var | Purpose | | --- | --- | |
`POSTGRES_URL` | Pooled Neon endpoint — runtime queries. Read by the adapter. | |
`POSTGRES_URL_NON_POOLING` | Direct (non-pooled) Neon endpoint — used for `payload migrate` in
CI/build (PgBouncer breaks DDL). | | `PAYLOAD_SECRET` | Payload encryption secret (required). | |
`NEXT_PUBLIC_SITE_URL` | Canonical base URL (e.g. `https://www.orto.sh`); used by live-preview URL,
canonical, OG. | | `PREVIEW_SECRET` | Shared secret guarding the `/preview` route. | |
`SITE_INDEXABLE` | `"true"` allows indexing; anything else → noindex (default during coming-soon).
Server-read only. |

**Base URL helper** `src/lib/base-url.ts` (`getServerSideURL()`): prefer `NEXT_PUBLIC_SITE_URL`,
else `VERCEL_ENV === 'production'` → `https://www.orto.sh`, else `VERCEL_URL` →
`https://$VERCEL_URL`, else `http://localhost:3000`. The existing `layout.tsx` `baseUrl` logic is
replaced by this helper (DRY).

**SEO interface name:** `SeoMeta`. **Roles:** single-select `admin|editor`. **Modified-Next-16
facts:** `params`/`searchParams`/`draftMode()` are async (await them); `robots.ts` default export is
sync; `sitemap.ts` default export is async; per-page noindex =
`robots: { index: false, follow: false }` (no shorthand).

**Brand tokens:** bg `#101010`, foreground cream `#EDEBE6`, accent `#FF5C00`, `font-display` =
Cormorant. Dark default.

**Commit rule:** logical commits on branch `cms`, **not pushed**. Sole author Nejc Drobnic — **no
`Co-Authored-By` trailer**. Run `pnpm --filter @orthogonal/landing typecheck`, `pnpm exec oxlint`,
`pnpm exec oxfmt` before each commit; `build` where a DB is available.

---

## File structure

```
apps/landing/
  package.json                         (M) next bump + payload deps + scripts
  next.config.ts                       (M) withPayload wrapper
  tsconfig.json                        (M) add @payload-config alias
  vitest.config.ts                     (C) node env, src/**/*.test.ts
  .env.example                         (C) env vars above
  src/
    payload.config.ts                  (C) buildConfig
    payload-types.ts                   (C, generated) committed
    fields/slug.ts                     (C) slugify + reserved-slug validate
    lib/
      base-url.ts                      (C) getServerSideURL
      lexical-text.ts                  (C) extract plaintext from Lexical
      reading-time.ts                  (C) minutes from plaintext
      seo.ts                           (C) isIndexable() + image URL helper
    collections/
      Users.ts Media.ts Categories.ts Authors.ts Posts.ts   (C)
    components/
      RichText/converters.tsx          (C) LinkJSXConverter(internalDocToHref)
      RichText/index.tsx               (C) <RichText> wrapper
      RefreshRouteOnSave.tsx           (C) 'use client' live preview
      blog/FeaturedPost.tsx PostCard.tsx PostList.tsx CategoryTabs.tsx AuthorByline.tsx  (C)
    app/
      (frontend)/
        layout.tsx                     (moved from app/layout.tsx; uses base-url helper)
        page.tsx                       (moved; UNCHANGED content, no /blog link)
        opengraph-image.tsx            (moved); icon.svg/favicon (moved)
        preview/route.ts               (C) draftMode enable
        blog/page.tsx                  (C) editorial hub
        blog/[slug]/page.tsx           (C) post page + generateMetadata + generateStaticParams
        blog/category/[slug]/page.tsx  (C) category archive
      (payload)/                       (C, verbatim from v3.85.0 tag) layout.tsx, custom.scss, admin/[[...segments]]/{page,not-found}.tsx, admin/importMap.js, api/[...slug]/route.ts, api/graphql/route.ts, api/graphql-playground/route.ts
      robots.ts                        (C) app root
      sitemap.ts                       (C) app root
    app/layout.tsx                     (DELETE — content moves to (frontend)/layout.tsx)
```

---

## Task 1: Dependencies, version bump, scripts, Vitest

**Files:** Modify `apps/landing/package.json`; create `apps/landing/vitest.config.ts`; create
`apps/landing/.env.example`.

- [ ] **Step 1: Bump Next + add Payload deps.** Edit `apps/landing/package.json`:
  - `dependencies.next`: `"16.2.0"` → `"16.2.7"`.
  - Add to `dependencies` (literal pins): `"payload": "3.85.0"`, `"@payloadcms/next": "3.85.0"`,
    `"@payloadcms/db-vercel-postgres": "3.85.0"`, `"@payloadcms/richtext-lexical": "3.85.0"`,
    `"@payloadcms/plugin-seo": "3.85.0"`, `"@payloadcms/live-preview-react": "3.85.0"`,
    `"sharp": "catalog:"` (if catalog has it; else latest aged), `"graphql": "^16"`.
  - Add to `devDependencies`: `"cross-env": "catalog:"` (or aged latest), `"vitest": "catalog:"`,
    `"@vitejs/plugin-react": "catalog:"` (if present).
  - Add scripts:
    `"generate:types": "cross-env NODE_OPTIONS=--no-deprecation payload generate:types"`,
    `"generate:importmap": "cross-env NODE_OPTIONS=--no-deprecation payload generate:importmap"`,
    `"payload": "cross-env NODE_OPTIONS=--no-deprecation payload"`,
    `"ci": "payload migrate && next build"`, `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 2: Install.** Run from repo root: `pnpm --filter @orthogonal/landing install` Expected:
      resolves with no peer-dependency errors. **If `catalogMode: strict` rejects literal
      versions**, instead add each new dep via
      `pnpm --filter @orthogonal/landing add <pkg>@<version>` (pnpm routes it into the catalog
      automatically) and re-run. **If `minimumReleaseAge` blocks** a transitive: confirm the
      `3.85.0` set + `next@16.2.7` (already in lockfile via orto) clear the 7-day gate; do not take
      `3.85.1`/`4.x`.

- [ ] **Step 3: Verify next resolved.** Run:
      `node -e "console.log(require('./apps/landing/node_modules/next/package.json').version)"`
      Expected: `16.2.7`.

- [ ] **Step 4: Create `vitest.config.ts`:**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Create `.env.example`** with the six vars from the canonical table (keys +
      placeholder values + a one-line comment each).

- [ ] **Step 6: Commit.**

```bash
git add apps/landing/package.json apps/landing/vitest.config.ts apps/landing/.env.example pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "chore(landing): bump next to 16.2.7 + add Payload deps (pinned 3.85.0)"
```

---

## Task 2: Pure utilities (TDD) — base URL, lexical text, reading time, seo

These have no Payload/Next runtime dependency, so they are pure-TDD and run before any DB exists.
Types are kept local (not from `payload-types`) so tests run before type generation.

### 2a. `lib/lexical-text.ts`

**Files:** Create `src/lib/lexical-text.ts`, `src/lib/lexical-text.test.ts`.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from "vitest";
import { lexicalToPlainText } from "./lexical-text";

const state = {
  root: {
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world" },
        ],
      },
      { type: "heading", children: [{ type: "text", text: "A heading" }] },
    ],
  },
};

describe("lexicalToPlainText", () => {
  it("concatenates nested text nodes with spacing between blocks", () => {
    expect(lexicalToPlainText(state)).toBe("Hello world A heading");
  });
  it("returns empty string for nullish input", () => {
    expect(lexicalToPlainText(null)).toBe("");
    expect(lexicalToPlainText(undefined)).toBe("");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `pnpm --filter @orthogonal/landing test -- lexical-text` →
      fails (module not found).

- [ ] **Step 3: Implement `lib/lexical-text.ts`:**

```ts
type LexicalNode = {
  type?: string;
  text?: string;
  children?: LexicalNode[];
};
type LexicalState = { root?: LexicalNode } | null | undefined;

/** Depth-first collect of all text-node strings under a Lexical editor state. */
export function lexicalToPlainText(state: LexicalState): string {
  if (!state?.root?.children) return "";
  const parts: string[] = [];
  const walk = (node: LexicalNode) => {
    if (typeof node.text === "string") parts.push(node.text);
    node.children?.forEach(walk);
  };
  // Join block-level children with a space so words don't run together.
  state.root.children.forEach((block) => {
    const before = parts.length;
    walk(block);
    if (parts.length > before) parts.push(" "); // block separator marker
  });
  return parts.join("").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 4: Run — expect PASS.** `pnpm --filter @orthogonal/landing test -- lexical-text` → 2
      passing.

### 2b. `lib/reading-time.ts`

**Files:** Create `src/lib/reading-time.ts`, `src/lib/reading-time.test.ts`.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from "vitest";
import { readingTimeMinutes } from "./reading-time";

describe("readingTimeMinutes", () => {
  it("computes ceil(words / 200), min 1", () => {
    expect(readingTimeMinutes("word ".repeat(200))).toBe(1);
    expect(readingTimeMinutes("word ".repeat(201))).toBe(2);
    expect(readingTimeMinutes("")).toBe(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement:**

```ts
const WORDS_PER_MINUTE = 200;

/** Reading time in whole minutes from plain text. Always at least 1. */
export function readingTimeMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
```

- [ ] **Step 4: Run — expect PASS.**

### 2c. `lib/seo.ts`

**Files:** Create `src/lib/seo.ts`, `src/lib/seo.test.ts`.

- [ ] **Step 1: Write the failing test:**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { isIndexable } from "./seo";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isIndexable", () => {
  it('is true only when SITE_INDEXABLE === "true"', () => {
    vi.stubEnv("SITE_INDEXABLE", "true");
    expect(isIndexable()).toBe(true);
  });
  it("is false when unset or any other value", () => {
    vi.stubEnv("SITE_INDEXABLE", "");
    expect(isIndexable()).toBe(false);
    vi.stubEnv("SITE_INDEXABLE", "false");
    expect(isIndexable()).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement:**

```ts
/** Whether the site should be search-indexable. False during coming-soon. */
export function isIndexable(): boolean {
  return process.env.SITE_INDEXABLE === "true";
}
```

- [ ] **Step 4: Run — expect PASS.**

### 2d. `lib/base-url.ts`

**Files:** Create `src/lib/base-url.ts`, `src/lib/base-url.test.ts`.

- [ ] **Step 1: Write the failing test:**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getServerSideURL } from "./base-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getServerSideURL", () => {
  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    expect(getServerSideURL()).toBe("https://example.com");
  });
  it("falls back to production host then localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(getServerSideURL()).toBe("https://www.orto.sh");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(getServerSideURL()).toBe("http://localhost:3000");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement:**

```ts
/** Canonical base URL for SSR/build (no trailing slash). */
export function getServerSideURL(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_ENV === "production") return "https://www.orto.sh";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
```

- [ ] **Step 4: Run — expect PASS.**

### 2e. `fields/slug.ts` (slugify + reserved-slug validate)

**Files:** Create `src/fields/slug.ts`, `src/fields/slug.test.ts`.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from "vitest";
import { slugify, validateSlug } from "./slug";

describe("slugify", () => {
  it("lowercases, strips diacritics, hyphenates", () => {
    expect(slugify("  Héllo, World! ")).toBe("hello-world");
    expect(slugify("Multiple   spaces__here")).toBe("multiple-spaces-here");
  });
});

describe("validateSlug", () => {
  it("accepts a clean slug", () => {
    expect(validateSlug("my-post", {} as never)).toBe(true);
  });
  it("rejects reserved slugs", () => {
    expect(typeof validateSlug("category", {} as never)).toBe("string");
  });
  it("rejects malformed slugs", () => {
    expect(typeof validateSlug("Bad Slug", {} as never)).toBe("string");
  });
  it("passes through empty (required handles it)", () => {
    expect(validateSlug("", {} as never)).toBe(true);
  });
});
```

> `validateSlug` takes Payload's `(value, options)` signature; tests pass a throwaway second arg.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/fields/slug.ts`** (the `formatSlugHook` is also exported here for
      collections):

```ts
import type { FieldHook, Validate } from "payload";

export const RESERVED_SLUGS = [
  "category",
  "categories",
  "author",
  "authors",
  "tag",
  "tags",
  "admin",
  "api",
  "blog",
  "preview",
  "sitemap.xml",
  "rss.xml",
  "feed",
] as const;

export const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

export const formatSlugHook: FieldHook = ({ value, originalDoc, data }) => {
  if (typeof value === "string" && value.length > 0) return slugify(value);
  const fallback = (data?.title ?? originalDoc?.title) as string | undefined;
  if (typeof fallback === "string" && fallback.length > 0) return slugify(fallback);
  return value;
};

export const validateSlug: Validate<string | undefined> = (value) => {
  if (!value) return true;
  if ((RESERVED_SLUGS as readonly string[]).includes(value)) {
    return `"${value}" is a reserved slug and cannot be used.`;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return "Slug may contain only lowercase letters, numbers, and single hyphens.";
  }
  return true;
};
```

- [ ] **Step 4: Run — expect PASS.** Run the full util suite:
      `pnpm --filter @orthogonal/landing test` → all green.

- [ ] **Step 5: Commit.**

```bash
git add apps/landing/src/lib apps/landing/src/fields
git commit -m "feat(landing): blog utilities — base url, lexical text, reading time, slug, seo"
```

---

## Task 3: Payload collections + config

**Files:** Create `src/collections/{Users,Media,Categories,Authors,Posts}.ts`,
`src/payload.config.ts`.

- [ ] **Step 1: Create the five collections** verbatim from the verified grounding (sections 2–6 of
      the payloadConfig grounding output): `Users.ts` (auth, `roles` single-select admin|editor,
      admin/create/update/delete access), `Media.ts` (upload, `imageSizes` thumbnail/card/og,
      required `alt`), `Categories.ts` (title + slug via `formatSlugHook`/`validateSlug` +
      description), `Authors.ts` (name, title, bio richText, avatar upload→media, user
      relationship), `Posts.ts` (title, slug, excerpt, content richText, heroImage, authors hasMany,
      categories hasMany, publishedAt sidebar, featured checkbox, drafts.autosave 375, anon read =
      `{ _status: { equals: 'published' } }`, afterChange/afterDelete revalidate hooks for
      `/blog/${slug}` + `/sitemap.xml` guarded by `context.disableRevalidate`).

- [ ] **Step 2: Create `src/payload.config.ts`** verbatim from grounding section 7, with:
      `db: vercelPostgresAdapter({ pool: { connectionString: process.env.POSTGRES_URL }, push: false })`;
      `secret: process.env.PAYLOAD_SECRET || ''`; `sharp`; `admin.user: 'users'`,
      `admin.meta.robots: 'noindex,nofollow'`, `admin.livePreview` (url →
      `${process.env.NEXT_PUBLIC_SITE_URL}/blog/${data.slug}`, `collections: ['posts']`,
      breakpoints); `collections: [Users, Media, Categories, Authors, Posts]`;
      `typescript.outputFile` → `src/payload-types.ts`;
      `plugins: [seoPlugin({ collections: ['posts'], uploadsCollection: 'media', interfaceName: 'SeoMeta', generateTitle, generateDescription, generateURL })]`.

  > Add `push: false` (not in the grounding snippet) so dev never auto-syncs schema; we rely on
  > migrations.

- [ ] **Step 3: Add tsconfig alias.** Edit `apps/landing/tsconfig.json` `compilerOptions.paths` to
      add alongside `@/*`:

```json
"@payload-config": ["./src/payload.config.ts"]
```

- [ ] **Step 4: Wrap next.config.** Replace `apps/landing/next.config.ts` with the verified
      `withPayload` version (grounding scaffold §2): import `withPayload` from
      `@payloadcms/next/withPayload`, the `images.localPatterns` for `/api/media/file/**`, the
      `webpack.extensionAlias`, `turbopack.root`, and
      `export default withPayload(nextConfig, { devBundleServerPackages: false })`.

- [ ] **Step 5: Typecheck gate (no DB needed for type generation of config types, but generate:types
      loads config).** With a `.env` providing a placeholder `POSTGRES_URL`/`PAYLOAD_SECRET`, run:
      `pnpm --filter @orthogonal/landing generate:types` Expected: writes `src/payload-types.ts`
      with `Post`, `Media`, `Category`, `Author`, `User`, `SeoMeta` types. If it errors needing a
      DB, point `POSTGRES_URL` at the provisioned Neon dev branch.

- [ ] **Step 6: Commit.**

```bash
git add apps/landing/src/collections apps/landing/src/payload.config.ts apps/landing/src/payload-types.ts apps/landing/tsconfig.json apps/landing/next.config.ts
git commit -m "feat(landing): Payload config + blog collections (posts, media, authors, categories) + SEO plugin"
```

---

## Task 4: `(payload)` route group + route-group split

**Files:** Create the 8 generated `(payload)` files; move existing
`app/layout.tsx`/`page.tsx`/`opengraph-image.tsx`/`icon.svg` into `(frontend)/`; delete top-level
`app/layout.tsx`.

- [ ] **Step 1: Create `src/app/(payload)/` verbatim** from the `v3.85.0` tag (do not transcribe by
      hand — fetch each raw file so the generated banner/hashes are exact):
  - `(payload)/layout.tsx`, `(payload)/custom.scss` (empty),
    `(payload)/admin/[[...segments]]/page.tsx`, `(payload)/admin/[[...segments]]/not-found.tsx`,
    `(payload)/admin/importMap.js`, `(payload)/api/[...slug]/route.ts`,
    `(payload)/api/graphql/route.ts`, `(payload)/api/graphql-playground/route.ts`.
  - Source base:
    `https://raw.githubusercontent.com/payloadcms/payload/v3.85.0/templates/blank/src/app/(payload)/...`
    (full list + contents in the grounding scaffold §1).

- [ ] **Step 2: Move marketing routes into `(frontend)`.**
  - `git mv apps/landing/src/app/page.tsx apps/landing/src/app/(frontend)/page.tsx`
  - `git mv apps/landing/src/app/opengraph-image.tsx apps/landing/src/app/(frontend)/opengraph-image.tsx`
  - `git mv apps/landing/src/app/icon.svg apps/landing/src/app/(frontend)/icon.svg` (and
    `favicon.ico` if present)
  - `git mv apps/landing/src/app/layout.tsx apps/landing/src/app/(frontend)/layout.tsx`
  - Keep `globals.css` where it is (`src/app/globals.css`); update the import in
    `(frontend)/layout.tsx` to `import '../globals.css'`.

- [ ] **Step 3: Refactor `(frontend)/layout.tsx`** to use the base-url helper: replace the inline
      `baseUrl` block with `import { getServerSideURL } from '@/lib/base-url'` and
      `metadataBase: new URL(getServerSideURL())`. Leave the `<html class="… dark">` + body
      `#101010`/`#EDEBE6` + font variables exactly as-is. (This is now a root layout of the
      `(frontend)` group.)

- [ ] **Step 4: Confirm no top-level layout remains.** `ls apps/landing/src/app/layout.tsx` → must
      NOT exist. `(frontend)/page.tsx` is the `/` route (lives in a group, satisfying the
      multi-root-layout rule).

- [ ] **Step 5: Regenerate import map** (now that config + collections exist):
      `pnpm --filter @orthogonal/landing generate:importmap` → updates
      `(payload)/admin/importMap.js`.

- [ ] **Step 6: Verify boot (DB required).** With Neon env set:
      `pnpm --filter @orthogonal/landing dev`, open `/admin` → Payload setup screen renders; open
      `/` → coming-soon home renders unchanged. Stop dev.

- [ ] **Step 7: Commit.**

```bash
git add apps/landing/src/app
git commit -m "feat(landing): scaffold (payload) admin + (frontend) route-group split"
```

---

## Task 5: Blog frontend — RichText, components, pages

**Files:** Create `src/components/RichText/{converters.tsx,index.tsx}`,
`src/components/RefreshRouteOnSave.tsx`, `src/components/blog/*`,
`src/app/(frontend)/blog/{page.tsx,[slug]/page.tsx,category/[slug]/page.tsx}`,
`src/app/(frontend)/preview/route.ts`, plus `src/lib/posts.ts` (shared queries).

- [ ] **Step 1: `lib/posts.ts`** — shared Local API helpers (DRY across hub, post, category,
      sitemap):

```ts
import { getPayload } from "payload";
import config from "@payload-config";
import type { Post } from "@/payload-types";

export async function getPublishedPosts(opts?: { limit?: number; categorySlug?: string }) {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "posts",
    where: {
      _status: { equals: "published" },
      ...(opts?.categorySlug ? { "categories.slug": { equals: opts.categorySlug } } : {}),
    },
    depth: 1,
    sort: "-publishedAt",
    limit: opts?.limit ?? 0,
  });
  return docs as Post[];
}

export async function getPostBySlug(slug: string, draft: boolean) {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "posts",
    depth: 2,
    draft,
    limit: 1,
    overrideAccess: draft,
    where: { slug: { equals: slug }, ...(draft ? {} : { _status: { equals: "published" } }) },
  });
  return (docs?.[0] as Post | undefined) ?? null;
}

export async function getCategories() {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "categories",
    depth: 0,
    limit: 0,
    sort: "title",
  });
  return docs;
}
```

- [ ] **Step 2: `components/RichText/converters.tsx` + `index.tsx`** — verbatim from the frontend
      grounding §2 (`LinkJSXConverter({ internalDocToHref })` mapping `posts` → `/blog/${slug}`;
      `<RichText>` wrapper typed `DefaultTypedEditorState`). Extend `defaultConverters` with
      brand-styled heading/quote/upload converters (Tailwind classes; Cormorant via `font-display`
      on headings).

- [ ] **Step 3: `components/RefreshRouteOnSave.tsx`** — verbatim from frontend grounding §3a, but
      read `serverURL={process.env.NEXT_PUBLIC_SITE_URL!}` (canonical var).

- [ ] **Step 4: `app/(frontend)/preview/route.ts`** — verbatim from frontend grounding §3b (verify
      `PREVIEW_SECRET`, `payload.auth`, `draftMode().enable()`, `redirect(path)`).

- [ ] **Step 5: Blog presentational components** (`components/blog/*`), styled to the locked
      editorial-hub mockup (dark, Cormorant serif headlines, `#FF5C00` chips, cover thumbnails,
      author avatar + date + read time):
  - `AuthorByline.tsx` (avatar + name(s) + date +
    `readingTimeMinutes(lexicalToPlainText(post.content))`).
  - `PostCard.tsx` (list row: category chip, serif title, thumbnail, byline).
  - `FeaturedPost.tsx` (cover + chip + large serif title + excerpt + byline).
  - `CategoryTabs.tsx` ("All" → `/blog` + each category → `/blog/category/[slug]`, active underlined
    `#FF5C00`).
  - `PostList.tsx` (maps `PostCard`; renders empty-state "Nothing published yet" when 0).

- [ ] **Step 6: `app/(frontend)/blog/page.tsx`** (editorial hub): fetch via `getPublishedPosts()` +
      `getCategories()`. Featured = first `featured===true` else first; list excludes featured.
      Empty/1-post states per spec.

- [ ] **Step 7: `app/(frontend)/blog/[slug]/page.tsx`** — verbatim assembly from frontend grounding
      §3c+§4+§5: `getPostBySlug` with `draftMode()`, render `<RichText>`, `FeaturedPost`-style
      header, `{isDraftMode && <RefreshRouteOnSave />}`; `generateMetadata` mapping `meta` +
      absolute OG image via `getServerSideURL`,
      `robots: isIndexable() ? undefined : { index:false, follow:false }`; `generateStaticParams`
      over published slugs (`limit:0, depth:0, select:{slug:true}`).

- [ ] **Step 8: `app/(frontend)/blog/category/[slug]/page.tsx`** — `getCategories` for tabs +
      `getPublishedPosts({ categorySlug })` for the list; `notFound()` if category slug unknown;
      reuse `PostList` + `CategoryTabs`.

- [ ] **Step 9: Verify.** `pnpm --filter @orthogonal/landing typecheck`; with DB + seed (Task 7)
      `pnpm dev` → `/blog`, `/blog/[slug]`, `/blog/category/[slug]` render; live preview refreshes
      on save in `/admin`.

- [ ] **Step 10: Commit.**

```bash
git add apps/landing/src/components apps/landing/src/lib/posts.ts apps/landing/src/app/(frontend)/blog apps/landing/src/app/(frontend)/preview
git commit -m "feat(landing): blog frontend — editorial hub, post & category pages, Lexical renderer, live preview"
```

---

## Task 6: SEO surface — robots.ts + sitemap.ts

**Files:** Create `src/app/robots.ts`, `src/app/sitemap.ts`. (Per-page `generateMetadata` already
added in Task 5.)

- [ ] **Step 1: `src/app/robots.ts`** (sync default export; app root, outside groups):

```ts
import type { MetadataRoute } from "next";
import { getServerSideURL } from "@/lib/base-url";
import { isIndexable } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const base = getServerSideURL();
  if (!isIndexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
```

- [ ] **Step 2: `src/app/sitemap.ts`** (async default export; queries published posts + categories):

```ts
import type { MetadataRoute } from "next";
import { getServerSideURL } from "@/lib/base-url";
import { getCategories, getPublishedPosts } from "@/lib/posts";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getServerSideURL();
  const [posts, categories] = await Promise.all([getPublishedPosts(), getCategories()]);
  return [
    { url: `${base}/blog`, changeFrequency: "daily", priority: 0.8 },
    ...categories.map((c) => ({
      url: `${base}/blog/category/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
```

> Freshness is handled by the Posts `afterChange`/`afterDelete` hooks calling
> `revalidatePath('/sitemap.xml')` (Task 3).

- [ ] **Step 3: Verify.** `pnpm --filter @orthogonal/landing typecheck`. With `SITE_INDEXABLE`
      unset: `curl localhost:3000/robots.txt` → `Disallow: /` and no `Sitemap:` line. With
      `SITE_INDEXABLE=true`: allow-all + sitemap line; `curl localhost:3000/sitemap.xml` lists
      `/blog` + posts.

- [ ] **Step 4: Commit.**

```bash
git add apps/landing/src/app/robots.ts apps/landing/src/app/sitemap.ts
git commit -m "feat(landing): SEO surface — robots + sitemap with noindex-until-launch flag"
```

---

## Task 7: Seed script + final verification (optional content, recommended)

**Files:** Create `src/seed/index.ts` and a `seed` script, OR seed via `/admin` manually. Seeding
makes live-preview + pages verifiable.

- [ ] **Step 1:** Add a `seed` script that uses the Local API to create: 1 admin User, 2 Categories
      (Writing, News), 1 Author (Nejc Drobnic), 1 Media item, and 2 Posts (one `featured`, one not)
      — guard with `context: { disableRevalidate: true }`. Mark clearly as dev-only.

- [ ] **Step 2: Full verification pass.**
  - `pnpm --filter @orthogonal/landing typecheck` → clean.
  - `pnpm exec oxlint apps/landing` and `pnpm exec oxfmt --check apps/landing` → clean.
  - With Neon env + migrations applied (`pnpm --filter @orthogonal/landing payload migrate`) + seed:
    `pnpm --filter @orthogonal/landing build` → succeeds; `pnpm start` → `/`, `/blog`,
    `/blog/[slug]`, `/blog/category/[slug]`, `/admin` all work; home page has **no** `/blog` link.

- [ ] **Step 3: Commit.**

```bash
git add apps/landing/src/seed apps/landing/package.json
git commit -m "test(landing): blog seed script + verification"
```

---

## Self-review notes (gaps surfaced & closed)

- **catalogMode strict / minimumReleaseAge** — Task 1 Step 2 handles both (use `pnpm add` to
  auto-catalog; `3.85.0`+`16.2.7` clear the 7-day gate).
- **DB needed for type/import-map generation and boot** — flagged in Tasks 3–4 (provision Neon dev
  branch; placeholder env otherwise).
- **Pooled vs non-pooled** — runtime `POSTGRES_URL`; `ci` script runs `payload migrate` (point its
  env `POSTGRES_URL` at `POSTGRES_URL_NON_POOLING` in the Vercel build env). `push:false` set so no
  accidental dev schema sync.
- **Multiple root layouts** — top-level `app/layout.tsx` deleted; `/` lives in `(frontend)`;
  `(payload)` layout renders its own `<html>` and imports only Payload CSS (no `globals.css`) → no
  Tailwind-reset bleed.
- **Reserved slug** — `category`/`blog`/`preview`/etc. rejected by `validateSlug` so posts can't
  shadow `/blog/category/*` or `/preview`.
- **All spec sections** (collections, live preview, drafts/autosave, SEO 3-layer, robots/sitemap
  noindex flag, route split, tests) map to Tasks 1–7.
- **Out of scope** confirmed absent: no MCP, no RSS, no newsletter, no `/blog` link from home.
