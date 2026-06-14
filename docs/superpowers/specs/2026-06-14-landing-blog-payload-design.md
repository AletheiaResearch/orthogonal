# Landing Blog (PayloadCMS) — Design Spec

**Date:** 2026-06-14 **Branch:** `cms` **Status:** Approved (design); ready for implementation
planning **Scope:** Add a news/blog/writings section to `apps/landing`, backed by PayloadCMS, in the
Amp-Chronicle / Cursor "editorial hub" style. Not linked from the coming-soon home page.

---

## 1. Goal & context

`apps/landing` (`@orthogonal/landing`) is the public coming-soon marketing site, deployed to
**Vercel** on Next.js 16 App Router + React 19 + Tailwind 4. It currently renders a single
static-ish hero page. We are adding a content section at **`/blog`** managed through a co-located
PayloadCMS admin, with live preview heavily desired.

Design reference: Amp Chronicle (`ampcode.com/chronicle`) + Cursor blog (`cursor.com/blog`). Chosen
layout: **editorial hub** — a featured piece on top + a filterable list below.

### Brand tokens (reuse exactly)

- Background `#101010`, foreground cream `#EDEBE6`, accent orange `#FF5C00`.
- Fonts: Cormorant (display serif, `--font-display`) for headlines; Geist sans body; Geist Mono for
  dates/labels. Dark is the default theme (light also supported via existing oklch tokens).

### ⚠️ Architectural consequence (signed off)

Co-locating Payload turns `apps/landing` from a static-ish page into a **server-rendered app with a
Postgres dependency and a public `/admin` panel**. The landing deploy now depends on DB availability
and build-time migrations. Accepted because "the blog is part of landing," and it buys the zero-HTTP
Local API + same-origin live preview.

---

## 2. Decisions (locked)

| Topic           | Decision                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Host app        | Co-locate Payload **inside `apps/landing`** (Vercel/Node). `packages/web` (Cloudflare) stays Payload-free — `sharp` + `pg` can't run on Workers. |
| DB adapter      | `@payloadcms/db-vercel-postgres` → Neon (provisioned via Vercel).                                                                                |
| Authorship      | Dedicated **Authors** collection (name, bio, avatar) — supports guest writers, powers byline+avatar.                                             |
| Taxonomy        | **Categories** collection (editor-managed) → enables `/blog/category/[slug]` archive pages; tabs are real nav links.                             |
| Indexing        | **Noindex until launch** via a `SITE_INDEXABLE` env flag (default `false`). `/blog` reachable by direct URL only.                                |
| Live preview    | **In scope for v1** (heavily desired). Server-side strategy: `draftMode()` + `RefreshRouteOnSave`, with drafts + autosave.                       |
| MCP plugin      | **Out of scope.** It is an authoring/automation tool for MCP clients, not reader-facing search.                                                  |
| Layout / canvas | Editorial hub; **dark** default (light supported).                                                                                               |
| URL             | `/blog`.                                                                                                                                         |

---

## 3. Versions (all PayloadCMS packages pinned `3.85.0`)

The `@payloadcms/*` set is peer-locked to the exact `payload` version. `3.85.1` (2026-06-09) and
`4.0.x` are inside the repo's 7-day `minimumReleaseAge` gate; `3.85.0` (2026-05-26) clears it.

- `payload@3.85.0`
- `@payloadcms/next@3.85.0`
- `@payloadcms/db-vercel-postgres@3.85.0`
- `@payloadcms/richtext-lexical@3.85.0`
- `@payloadcms/plugin-seo@3.85.0`
- `@payloadcms/live-preview-react@3.85.0`
- `sharp` (already in `pnpm-workspace` allowBuilds), `graphql@^16`

**Critical Next floor:** `@payloadcms/next@3.85.0` peer requires `next >=16.2.6 <17`. `apps/landing`
pins `next 16.2.0` (direct pin in its `package.json`). **Bump to `16.2.7`** (already in the lockfile
via `apps/orto`, clears the publish-age gate). React stays `19.2.4` (Payload confirms 19.2 OK). This
edits only `apps/landing/package.json`; the catalog and other apps are untouched.

**Modified Next caveat:** `apps/landing/AGENTS.md` warns this Next.js has breaking changes vs.
training data — read `node_modules/next/dist/docs/` for the `robots`/`sitemap` metadata conventions
and multiple-root-layout behavior before writing those files.

---

## 4. File / route structure

```
apps/landing/
  next.config.ts                 ← wrap: export default withPayload(nextConfig)
  package.json                   ← next 16.2.0 → 16.2.7 + payload deps
  tsconfig.json                  ← add path alias "@payload-config": ["./src/payload.config.ts"]
  .env.example                   ← new env vars (see §8)
  src/
    payload.config.ts            ← buildConfig(...)
    payload-types.ts             ← generated (pnpm payload generate:types)
    collections/
      Users.ts  Posts.ts  Media.ts  Categories.ts  Authors.ts
    lib/
      reading-time.ts            ← Lexical → plaintext → minutes
      lexical-text.ts            ← extract plaintext from Lexical state
      base-url.ts                ← centralize prod/preview/localhost base URL
      rich-text/converters.tsx   ← JSX converters incl. LinkJSXConverter(internalDocToHref)
    components/blog/
      FeaturedPost.tsx  PostCard.tsx  PostList.tsx  CategoryTabs.tsx
      AuthorByline.tsx  RichText.tsx  RefreshOnSave.tsx ('use client')
    app/
      (frontend)/
        layout.tsx               ← MOVED from app/layout.tsx (renders <html>, imports globals.css)
        page.tsx                 ← coming-soon home, UNCHANGED, no /blog link
        opengraph-image.tsx      ← moved; icon.svg / favicon moved
        blog/
          page.tsx               ← editorial hub
          [slug]/page.tsx        ← post page (Lexical, SEO, draftMode preview)
          category/[slug]/page.tsx ← category archive
      (payload)/                 ← generated by Payload: admin/[[...segments]], api/[...slug], graphql, graphql-playground, layout.tsx, custom.scss, importMap.js
      robots.ts                  ← app root, OUTSIDE both groups
      sitemap.ts                 ← app root, OUTSIDE both groups
```

- The top-level `app/layout.tsx` is **deleted**; its content moves to `(frontend)/layout.tsx`. Next
  permits multiple root layouts across route groups only when no top-level layout exists.
- **CSS isolation:** `globals.css` (Tailwind 4 preflight + shadcn + tw-animate) is imported **only**
  in `(frontend)/layout.tsx`. The `(payload)` group uses Payload's own styles only — otherwise
  Tailwind's reset bleeds into and breaks the admin panel.
- **Route precedence:** literal `/blog/category/[slug]` wins over dynamic `/blog/[slug]`; `category`
  (and any literal `/blog/*` segment) is a **reserved post slug** enforced by validation so a post
  can't shadow the archive route.

---

## 5. Data model

### Users (auth)

`admin.user: 'users'`. Field `roles` (select: admin | editor) with field-level access for RBAC.
Gates `/admin` login.

### Posts

- `title` (text, required)
- `slug` (text, unique, indexed; auto-slugified from title via `beforeValidate`, editable; validates
  URL-safety + rejects reserved slugs e.g. `category`)
- `excerpt` (textarea) — the list/feature dek
- `content` (richText, `lexicalEditor({})`)
- `heroImage` (upload relationship → Media) — cover/OG source
- `authors` (relationship → Authors, hasMany)
- `categories` (relationship → Categories, hasMany)
- `publishedAt` (date)
- `featured` (checkbox) — featured-slot selection (see §6)
- `meta` (group, injected by SEO plugin; `interfaceName: 'Meta'`)
- `versions: { drafts: { autosave: { interval: 375 } } }`
- Access: `read` → `{ _status: { equals: 'published' } }` for anonymous, `true` for authed editors.

### Media (upload, requires sharp/Node)

`alt` (required), optional caption, image sizes: `thumbnail`, `card`, `og` (1200×630). Used as
`uploadsCollection` for SEO and as `heroImage`/avatar source.

### Categories

`title`, `slug` (unique), `description` (optional). Drives tabs + `/blog/category/[slug]`.

### Authors

`name`, `bio` (richText), `avatar` (upload → Media), optional `title`, optional socials, optional
`user` relationship → Users.

No globals in v1 (YAGNI). Default OG falls back to the existing `opengraph-image`.

---

## 6. Frontend behavior

- **Editorial hub `/blog`:**
  - **Featured** = most-recent published post with `featured: true`; fallback = most-recent
    published post. The list below **excludes** the featured post.
  - **Category tabs** = "All" (`/blog`) + one link per Category (`/blog/category/[slug]`), rendered
    from the Categories collection. Active tab underlined in `#FF5C00`.
  - Each row/feature: orange category chip (first category), Cormorant serif headline, cover
    thumbnail, author avatar + name, date, **read time** (computed, not stored).
- **Empty states:** 0 published posts → tasteful "Nothing published yet" panel (on-brand). 1 post →
  show only the featured; hide list + tabs.
- **Post page `/blog/[slug]`:**
  - `generateStaticParams` over published slugs.
  - Fetch via Local API with sufficient `depth` so upload/relationship nodes populate.
  - Render body with `<RichText>` from `@payloadcms/richtext-lexical/react` using JSX converters
    that spread `...LinkJSXConverter({ internalDocToHref })` mapping internal post refs →
    `/blog/[slug]` (**required** — internal links throw at render without it). Brand-styled
    converters for headings/quote/code/upload.
  - Author byline block; prev/next or "more from category" optional (nice-to-have).
- **Category archive `/blog/category/[slug]`:** reuse PostList filtered by category.
- **Reading time:** `lib/reading-time.ts` extracts plaintext from Lexical (`lib/lexical-text.ts`),
  `ceil(words / 200)`, min 1. Used in list + post header.

---

## 7. SEO & indexing

Three complementary layers:

1. **SEO plugin** (`@payloadcms/plugin-seo`) in `payload.config.ts`:
   `seoPlugin({ collections: ['posts'], uploadsCollection: 'media', interfaceName: 'Meta', generateTitle, generateDescription, generateURL })`.
   Adds `meta` group (title/description/image), editor SERP preview + character counters.
2. **`generateMetadata`** in `[slug]/page.tsx`: maps `meta.*` → Next `Metadata` (title, description,
   `openGraph.images` from populated `meta.image`/`heroImage` url, canonical). Honors the index flag
   (emits `robots: { index: false }` when `SITE_INDEXABLE` is false).
3. **Metadata-file conventions at app root:**
   - `robots.ts` (static; base URL from build-time env so it stays cached):
     - `SITE_INDEXABLE=false` → `{ rules: { userAgent: '*', disallow: '/' } }`, no sitemap.
     - `true` →
       `{ rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] }, sitemap: \`${base}/sitemap.xml\`
       }`.
   - `sitemap.ts` (dynamic): query published posts via Local API →
     `{ url, lastModified: updatedAt, changeFrequency, priority }`, plus `/blog`, category pages,
     and static routes. (No `generateSitemaps` — well under the 50k URL limit.)
   - **Freshness:** `sitemap.js` is cached by default. Payload `afterChange`/`afterDelete` hooks on
     Posts call `revalidatePath('/sitemap.xml')` (primary); ISR revalidate as fallback.

- `admin.meta.robots: 'noindex, nofollow'` keeps `/admin` out of indexes regardless of the flag.

`SITE_INDEXABLE` is read server-side (build + render), so a plain (non-`NEXT_PUBLIC_`) env var works
for `robots.ts`, `sitemap.ts`, and `generateMetadata`.

---

## 8. Environment & data layer

- **Runtime DB:** pooled Neon endpoint (Vercel-provided, e.g. `POSTGRES_URL` / `DATABASE_URL`).
- **Migrations:** `payload migrate` needs a **direct (non-pooled)** connection
  (`POSTGRES_URL_NON_POOLING`) — PgBouncer transaction pooling breaks DDL/prepared statements. Run
  migrations in the Vercel build step against the direct URL; serve traffic via the pooled URL.
  (Exact Vercel/Neon env var names confirmed against the integration at implementation time.)
- `PAYLOAD_SECRET` (required), `NEXT_PUBLIC_SITE_URL` (for live-preview URL + canonical),
  `SITE_INDEXABLE` (default `false`). Add all to `apps/landing/.env.example` and Vercel project
  settings.
- Scripts: `generate:types` (`PAYLOAD_CONFIG_PATH=src/payload.config.ts payload generate:types`),
  `generate:importmap` after adding custom admin components, and a build-time `payload migrate`.

---

## 9. Live preview (v1)

- `admin.livePreview` in `payload.config.ts`:
  `url: ({ data }) => \`${NEXT_PUBLIC_SITE_URL}/blog/${data.slug}\``, `collections: ['posts']`,
  sensible breakpoints.
- **Server-side strategy:** in `blog/[slug]/page.tsx`, when `draftMode()` is enabled, fetch with
  `draft: true` (else published-only). Render a `'use client'` `RefreshRouteOnSave` wrapper (from
  `@payloadcms/live-preview-react`) calling `router.refresh()` on each save.
- Drafts + `autosave` (interval ~375ms) on Posts stream edits into the iframe.
- Same-origin (Payload + frontend both in `apps/landing`) → trivial iframe/postMessage + CORS.
- Public/SEO rendering always uses published (non-draft) queries; only the draftMode path uses
  `draft: true`.

---

## 10. Testing

Vitest (repo convention; add config to `apps/landing`). Cover the pure logic:

- `reading-time` + `lexical-text` extraction (deterministic outputs).
- slug auto-generation + reserved-slug/URL-safety validation.
- `robots`/`sitemap` builders (indexable vs noindex branches).

Payload/UI integration kept light; rely on `typecheck` + `build` for wiring.

---

## 11. Out of scope (v1)

MCP plugin, RSS feed, newsletter signup, reader-facing search, and **any link to `/blog` from the
coming-soon home page** (the home page is moved into `(frontend)` unchanged).

---

## 12. Commit plan (logical commits on `cms`, **not pushed**; sole author, no co-author trailer)

1. `chore(landing): bump next to 16.2.7 + add Payload deps (pinned 3.85.0)`
2. `feat(landing): scaffold Payload config + (frontend)/(payload) route-group split`
3. `feat(landing): blog collections (posts, media, authors, categories) + SEO plugin`
4. `feat(landing): blog frontend — editorial hub, post & category pages, Lexical renderer`
5. `feat(landing): SEO surface — metadata, robots, sitemap (noindex flag) + revalidation`
6. `feat(landing): drafts + live preview (draftMode + RefreshRouteOnSave)`
7. `test(landing): unit tests for blog utilities`

Run `pnpm --filter @orthogonal/landing typecheck`, `oxlint`, `oxfmt`, and `build` before each commit
where applicable. Verify peer resolution succeeds and the lockfile respects `minimumReleaseAge`.

---

## 13. Key risks / gotchas

1. **Cloudflare is not viable for the CMS** — `sharp` (native) + `pg` don't run on workerd. The CMS
   forces Vercel/Node; `packages/web` stays Payload-free. (Not a blocker; just a boundary.)
2. **Next peer floor** — must bump landing to `16.2.7` or pnpm peer resolution fails.
3. **Pooled vs direct Neon** — migrations need the direct endpoint; runtime uses pooled.
4. **Route-group root-layout collision** — `(payload)` ships its own `<html>` root layout; the
   existing `app/layout.tsx` must be removed (content → `(frontend)/layout.tsx`).
5. **Tailwind reset vs admin** — import `globals.css` only in `(frontend)`.
6. **Version coupling** — all `@payloadcms/*` move together; future upgrades bump in lockstep and
   re-clear the publish-age gate. v4 also flips the MCP API and raises floors — a deliberate
   migration.
7. **Modified Next 16** — consult `node_modules/next/dist/docs/` for the metadata-file + multiple
   root layout conventions before writing `robots.ts`/`sitemap.ts`/layouts.
