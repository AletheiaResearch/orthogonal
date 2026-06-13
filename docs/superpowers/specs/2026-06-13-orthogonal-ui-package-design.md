# `@orthogonal/ui` — Shared Component Package Design

**Date:** 2026-06-13 **Branch:** `refactor/isolate-components` **Status:** Approved direction;
pending spec review

## Goal

Extract the generic, app-agnostic UI from `apps/orto` into a new importable package `packages/ui`
(`@orthogonal/ui`), with tests and richly documented Storybook stories. Deliver in one effort two
tiers:

- **Tier 1 — generic primitives:** the shadcn/Radix primitives in `apps/orto/src/components/ui/*`
  plus any app-agnostic composites, plus the `cn()` util.
- **Tier 2 — AI primitives** (AI Elements–style, akin to tryelements.dev/ai-elements): generic,
  composable agentic-UI building blocks (Message, Reasoning, Tool, CodeBlock, PromptInput, …),
  decoupled from orto's session/event protocol, exported from the `@orthogonal/ui/ai` subpath.

Storybook stories live in the package but are **invisible to orto** — orto consumes the package
without installing Storybook. A new `apps/storybook` site renders the stories.

## Decisions (locked)

1. **Distribution: source-export.** The package ships raw `.tsx`. Consumers add it to Next.js
   `transpilePackages` and to their Tailwind `content` glob. No build step. This preserves
   `"use client"` RSC directives and lets Tailwind scan real class names — avoiding the
   compiled-`dist` fragility under React 19 / Next 16.
2. **Scope: primitives + generic composites,** decided by transitive import closure (below).
3. **Theme: package owns it.** A Tailwind preset + a `tokens.css` are the single source of truth;
   orto and `apps/storybook` both consume them.
4. **Storybook: scaffold `apps/storybook` now** to verify stories render and orto stays
   Storybook-free.
5. **AI tier: both tiers in one effort,** AI primitives as the `@orthogonal/ui/ai` subpath of the
   same package (shared theme/test/storybook infra).

## Package layout

```text
packages/ui/
  package.json            # @orthogonal/ui, private, type:module, no build
  tsconfig.json
  vitest.config.ts        # jsdom default, testing-library setup
  tailwind-preset.ts      # semantic colors, borderRadius, typography+animate plugins
  src/
    index.ts              # Tier 1 barrel (export * from each primitive)
    lib/utils.ts          # cn()
    styles/tokens.css     # CSS variables: BOTH .dark class + prefers-color-scheme paths
    <primitive>.tsx       # button, input, dialog, ... (moved from orto)
    <primitive>.test.tsx
    <primitive>.stories.tsx
    ai/
      index.ts            # Tier 2 barrel
      <ai-component>.tsx
      <ai-component>.test.tsx
      <ai-component>.stories.tsx
```

### Exports map

| Subpath               | Resolves to             | Consumer usage                                         |
| --------------------- | ----------------------- | ------------------------------------------------------ |
| `.`                   | `src/index.ts`          | `import { Button, Dialog } from "@orthogonal/ui"`      |
| `./ai`                | `src/ai/index.ts`       | `import { Reasoning, Tool } from "@orthogonal/ui/ai"`  |
| `./lib/utils`         | `src/lib/utils.ts`      | `import { cn } from "@orthogonal/ui/lib/utils"`        |
| `./tailwind-preset`   | `tailwind-preset.ts`    | `presets: [require("@orthogonal/ui/tailwind-preset")]` |
| `./styles/tokens.css` | `src/styles/tokens.css` | `@import "@orthogonal/ui/styles/tokens.css";`          |

### Dependencies

- **dependencies:** the Radix packages currently used, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `cmdk`, `sonner`, `lucide-react`, and (for Tier 2 `Response`) `react-markdown`,
  `remark-gfm`, `rehype-sanitize`, `rehype-highlight`, plus `@tailwindcss/typography` and
  `tailwindcss-animate` (consumed by the preset). All via `catalog:` (catalog mode is **strict**).
- **peerDependencies:** `react`, `react-dom`, `tailwindcss`.
- **devDependencies:** `@storybook/*`, `vitest`, `@testing-library/*`, `jsdom`,
  `@vitest/coverage-v8`, `@types/react`, `@types/react-dom`, `typescript`,
  `@orthogonal/tooling-configs`.

> **Catalog + release-age gotcha:** new deps (`@storybook/*`, the Storybook `vite` builder) must be
> added to `pnpm-workspace.yaml`'s catalog and pinned to versions **published > 7 days ago**
> (`minimumReleaseAge: 10080`). The setup phase verifies `@storybook/react-vite` supports React 19
> and the repo's Vite (catalog `vite 8.0.16`); if a stable Storybook line needs a different Vite,
> add a named catalog entry (mirroring the existing `tailwind3`/`tailwind4` pattern) for the
> storybook app only.

## "Generic" classification (the load-bearing rule)

A component is movable **only if its full transitive import closure touches nothing app-specific.**
Disqualifying imports: `@/lib/*` app utilities (the sole exception is `cn`, which **moves into the
package**), `@/hooks/*`, `@/types/*`, `@open-inspect/shared`, control-plane clients, and
`posthog`/analytics.

- All ~26 `src/components/ui/*` primitives are expected to qualify.
- Composites (e.g. `media-lightbox`, `safe-markdown`, `collapsible-section`) move **only if** their
  closure is clean.
- A component that is _almost_ generic (a single shallow coupling) is **reported as
  "genericize-or-leave," never silently dropped** — we either lift the coupling out via props/render
  props or leave the component in orto.
- App-coupled items that look generic by name (a logo `app-icon`, a curated `icons` barrel) stay in
  orto unless trivially genericizable.

The Understand phase produces a **classification manifest** (per candidate: `move` / `genericize` /
`keep`, with the offending imports listed) that is reviewed **before** any file is mutated.

## Tier 2 — AI primitives (initial set)

Generic, composable, theme-driven; props/render-props instead of orto types. Modeled on AI Elements:

`Conversation` (scroll container) · `Message` / `MessageContent` / `MessageAvatar` · `Response`
(streaming-friendly markdown via `react-markdown` + sanitize + highlight) · `Reasoning`
(collapsible) · `Tool` / `ToolHeader` / `ToolInput` / `ToolOutput` · `Task` / `TaskItem` (plan list)
· `CodeBlock` (with copy) · `PromptInput` / `PromptInputTextarea` / `PromptInputToolbar` /
`PromptInputSubmit` · `Suggestion(s)` · `Actions` / `Action` · `Loader` · `Sources` / `Source`.

orto's `tool-call-item`, `tool-call-group`, `reasoning-effort-pills`, `safe-markdown`,
`terminal-panel` are **reference material**, not direct moves — the Tier 2 versions are decoupled.
The final set is confirmed in the Understand phase.

## Theme extraction

- `tokens.css` carries the `:root`, `.dark`, **and** `@media (prefers-color-scheme: dark)` blocks
  from orto's `globals.css` (both dark paths preserved — `darkMode: "class"` plus the no-JS media
  fallback).
- `tailwind-preset.ts` carries `darkMode: "class"`, `theme.extend.colors` (the semantic `var(--…)`
  mappings), `borderRadius`, and the `typography` + `animate` plugins.
- orto's `globals.css` keeps only app-specific rules (prose/hljs tweaks) and adds
  `@import "@orthogonal/ui/styles/tokens.css";`.
- orto's `tailwind.config.ts` becomes `presets: [orthogonalUiPreset]` + `content` (with the package
  source glob added).

## orto wiring

- `next.config.ts`: add `transpilePackages: ["@orthogonal/ui"]`.
- `tailwind.config.ts`: use the preset; add `../../packages/ui/src/**/*.{ts,tsx}` to `content`.
- `globals.css`: import `tokens.css`; drop the now-duplicated token blocks.
- Import sites: repoint `@/components/ui/<x>` → `@orthogonal/ui` (and AI ones →
  `@orthogonal/ui/ai`). Moved files are deleted from orto; app-coupled files stay.
- `src/lib/utils.ts`: re-export `cn` from the package
  (`export { cn } from "@orthogonal/ui/lib/utils";`) so orto's many `@/lib/utils` import sites need
  no change while the package remains the source of truth.
- `components.json`: leave as-is (orto may still scaffold app-specific components locally).

## Storybook isolation (the actual requirement — verified, not asserted)

**Invariant:** nothing reachable from the `@orthogonal/ui` export graph (`.` → `index.ts` →
components; `./ai` → `ai/index.ts`) imports `@storybook/*` or any `*.stories.tsx`; and
`@storybook/*` appears **only** in `packages/ui` devDependencies and `apps/storybook` dependencies.

- Stories are co-located `*.stories.tsx` using CSF3 (`Meta`/`StoryObj`) with `autodocs` and detailed
  per-variant / per-prop documentation.
- The barrels (`index.ts`, `ai/index.ts`) export components only — never stories.
- Story files may import `@storybook/react` types freely; this is safe **because nothing orto
  imports pulls them in**.

`apps/storybook`: minimal `@storybook/react-vite` site; `.storybook/main.ts` globs
`../../../packages/ui/src/**/*.stories.@(ts|tsx)`; `.storybook/preview.ts` imports the preset-built
CSS + `tokens.css` and provides a light/dark toggle (via a global decorator toggling the `.dark`
class).

## Execution plan (workflow-orchestrated)

This work is **not embarrassingly parallel.** Fan out only read-only and additive-per-file work;
keep central-file mutations serial.

1. **Understand (fan out, read-only).** One agent per Tier-1 candidate traces its import closure →
   classification manifest. In parallel, an agent inventories orto's AI-UI components and proposes
   the final Tier-2 set + each component's API. **Gate: human review of the manifest before any
   mutation.**
2. **Scaffold + theme + wiring (serial, single coherent pass).** Create the package skeleton
   (package.json, tsconfig, vitest config, preset, tokens.css, empty barrels); move Tier-1 files +
   tests and rewrite their internal imports; extract the theme; wire orto (transpilePackages,
   tailwind preset + content, globals import, `lib/utils` re-export); generate both barrels from the
   manifest. Update the catalog with Storybook deps.
3. **Author Tier-2 AI components (fan out, additive).** Each agent writes one AI component + its
   test
   - its story (its own new files only); barrel updates are batched in a short serial step.
4. **Stories + test verification (fan out, additive).** One agent per Tier-1 component writes its
   `*.stories.tsx` and confirms its moved test passes (fixing jsdom/import issues), touching only
   its own files.
5. **Scaffold `apps/storybook`** (serial) and confirm a build + at least one rendered story.
6. **Verify (gate).** All must pass: orto `typecheck` + `build` + `test`; `@orthogonal/ui` tests;
   `apps/storybook` build renders a story; and the **Storybook-isolation check** — grep the export
   graph for `@storybook` / `.stories` imports and confirm orto's build never resolves
   `@storybook/*`.

## Risks

| Risk                                                     | Mitigation                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Storybook ↔ Vite 8 / React 19 incompatibility            | Verify via context7 in setup; add a named Vite catalog entry for the storybook app if needed. |
| `minimumReleaseAge` blocks newest Storybook              | Pin a Storybook version published > 7 days ago.                                               |
| Parallel agents clobber central files (barrels, configs) | Central-file work is serial; fan-out agents write only their own component's files.           |
| A composite looks generic but has hidden coupling        | Closure-based classification + human manifest review before moving.                           |
| Tailwind doesn't scan package classes                    | Add package source glob to orto + storybook `content`; verify rendered output.                |
| `"use client"` lost in transit                           | Source-export (no build) preserves directives; verified by orto build.                        |

## Done when

orto typechecks, builds, and tests green importing from `@orthogonal/ui`; the package's own tests
pass; `apps/storybook` builds and renders Tier-1 + Tier-2 stories; and the Storybook-isolation check
passes (orto installs/bundles no `@storybook/*`).
