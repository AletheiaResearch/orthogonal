# AGENTS.md

Open-Inspect is a background coding agent system that spawns sandboxed dev environments to work on
GitHub repositories. Single-tenant design. Stack: Cloudflare Workers (TypeScript), Modal (Python),
Next.js (React), OpenTofu.

## Architecture

Three tiers connected by WebSockets:

1. **Web Client** (`apps/orto`, Next.js on Vercel) — UI with GitHub OAuth, session dashboard,
   real-time streaming
2. **Control Plane** (Cloudflare Workers + Durable Objects) — session lifecycle, WebSocket hub,
   GitHub/auth integration. Each session is a Durable Object with SQLite storage. Uses D1 for
   session index, repo metadata, and encrypted repo secrets.
3. **Data Plane** (Modal, Python) — sandboxed environments running coding agents. Manages sandbox
   creation, warm pools, snapshots.

**Bot integrations** (`services/integrations/`) — all Cloudflare Workers using Hono:

- `slack-bot` — Slack messages → coding sessions
- `github-bot` — PR review assignments and @mention commands
- `linear-bot` — Linear agent webhooks → coding sessions

**Data flow**: User prompt → web client → control plane DO (WebSocket) → Modal sandbox → streaming
events back through the same WebSocket chain.

### Package Dependency Graph

```
@open-inspect/shared  ←  control-plane, orto, slack-bot, github-bot, linear-bot
```

**Build `@open-inspect/shared` first** whenever you change shared types. Other packages import from
it at build time.

## Package Overview

| Package            | Lang / Framework                   | Purpose                                                                            |
| ------------------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| `shared`           | TypeScript                         | Shared types, auth utilities, model definitions                                    |
| `control-plane`    | TypeScript / CF Workers + DO       | Session management, WebSocket streaming, GitHub integration                        |
| `orto` (apps)      | TypeScript / Next.js 16 + React 19 | User-facing dashboard, OAuth, real-time UI; Vercel-deployed with PostHog analytics |
| `landing` (apps)   | TypeScript / Next.js + PayloadCMS  | Marketing/blog site (`@orthogonal/landing`), backed by Postgres/Neon; Vercel       |
| `storybook` (apps) | TypeScript / Storybook             | Component workshop (`@orthogonal/storybook`) for the shared UI library             |
| `slack-bot`        | TypeScript / CF Workers + Hono     | Slack event handler, session creation                                              |
| `github-bot`       | TypeScript / CF Workers + Hono     | PR review and @mention webhook handler                                             |
| `linear-bot`       | TypeScript / CF Workers + Hono     | Linear agent webhook handler                                                       |
| `ui`               | TypeScript / React                 | Shared React component library (`@orthogonal/ui`), consumed by orto and storybook  |
| `tooling-configs`  | TypeScript                         | Shared oxlint and vite presets (`@orthogonal/tooling-configs`)                     |
| `modal-infra`      | Python 3.12 / Modal + FastAPI      | Sandbox lifecycle, WebSocket bridge to control plane                               |
| `sandbox-runtime`  | Python 3.12                        | Provider-agnostic sandbox runtime, consumed by `modal-infra` (distinct package)    |

## Common Commands

```bash
# Install & build
corepack enable
pnpm install
pnpm run build                                   # all packages
pnpm --filter @open-inspect/shared build         # shared only (build first!)

# Lint & format
pnpm run lint:fix                                # oxlint --fix
pnpm run fmt                                     # oxfmt
pnpm run fmt:check                               # oxfmt --check
pnpm run typecheck                               # tsc across all TS packages

# Tests — TypeScript (Vitest)
pnpm --filter @open-inspect/control-plane test   # unit tests (node env)
pnpm --filter @open-inspect/control-plane run test:integration  # integration (workerd/Miniflare + real D1)
pnpm --filter @orthogonal/orto test
pnpm --filter @orthogonal/github-bot test
pnpm --filter @orthogonal/slack-bot test
pnpm --filter @orthogonal/linear-bot test

# Tests — Python (pytest)
cd packages/modal-infra && pytest tests/ -v

# Python linting
cd packages/modal-infra && ruff check --fix && ruff format
```

## Testing

All TypeScript packages use **Vitest**; Python uses **pytest** + pytest-asyncio.

### Test file locations

- **control-plane unit**: co-located as `src/**/*.test.ts` — run in Node environment
- **control-plane integration**: separate `test/integration/*.test.ts` — run in workerd via
  `@cloudflare/vitest-pool-workers` with real D1 bindings
- **orto, slack-bot, linear-bot**: co-located `src/**/*.test.ts`
- **github-bot**: separate `test/*.test.ts`
- **modal-infra**: `tests/test_*.py`

### Control-plane integration tests

These run inside a real `workerd` runtime with Miniflare, using the `cloudflareTest()` plugin from
`@cloudflare/vitest-pool-workers`. Important:

- Integration tests share one D1 instance — use `cleanD1Tables()` or equivalent cleanup in
  `beforeEach`/`afterEach` to avoid cross-test pollution
- D1 migrations from `terraform/d1/migrations/` are applied automatically via
  `test/integration/apply-migrations.ts`
- Helpers in `test/integration/helpers.ts`: `initSession()`, `queryDO()`, `seedEvents()`

## Coding Conventions

### Durations and timeouts

- **Use seconds for Python, milliseconds for TypeScript.** These match each ecosystem's conventions
  (Modal `timeout=` takes seconds; control-plane uses `_MS` suffixes throughout).
- **Encode the unit in the name.** Python: `timeout_seconds`. TypeScript: `timeoutMs`,
  `INACTIVITY_TIMEOUT_MS`. Never use a bare `timeout`.
- **Define each default value exactly once.** Extract to a named constant and import everywhere.
- **Don't restate literal values in comments.** Write `Defaults to DEFAULT_SANDBOX_TIMEOUT_SECONDS`,
  not `Default: 7200`.

### Extending existing patterns

- When threading an existing field through new code paths, evaluate whether the existing design
  (naming, types, units) is correct — don't blindly propagate it. Fix bad names or units in the same
  change rather than spreading the problem.

### Commit messages

Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`. Keep the subject
under 72 characters. Use the PR body for details, not the commit message.

## Key Gotchas

- **Build order**: always build `@open-inspect/shared` before packages that depend on it.
- **PKCS#8 keys**: Cloudflare Workers require PKCS#8 format for GitHub App private keys — convert
  with `openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt`.
- **Durable Object bindings**: new DO bindings require a two-phase OpenTofu deploy — first with
  `enable_durable_object_bindings = false`, then `true`.
- **control-plane `wrangler.jsonc`**: the checked-in `packages/control-plane/wrangler.jsonc` is a
  **test-only** config — it powers local `wrangler dev` (Miniflare) and the integration test runner.
  The production Worker config is generated by OpenTofu at deploy time, not from this file.
- **Modal deployment**: never deploy `src/app.py` directly — use `modal deploy deploy.py` or
  `modal deploy -m src`. The `app.py` file doesn't import function modules.
- **Modal image rebuild**: update `CACHE_BUSTER` in `src/images/base.py` to force a rebuild.
- **Web deployment**: the web app (`apps/orto`) deploys via its own Vercel dashboard project, not
  OpenTofu — see [apps/orto/README.md](apps/orto/README.md).

## CI/CD

GitHub Actions runs **CI only** — there is no infrastructure-deploy workflow. On every push to
`main` and every PR:

- **`ci.yml`** — path-filtered change detection gates language-specific jobs (TypeScript, Python,
  landing), then runs lint, typecheck, tests, and build. A single required **"CI Success"** check
  aggregates the matrix so branch protection needs only that one gate.
- **`chromatic.yml`** — visual regression for the UI components / Storybook.
- **`coverage.yml`** — coverage reporting.

**Infrastructure is deployed manually**, not by CI:

- **Control plane + bots + Modal data plane** → `tofu apply` from
  `terraform/environments/production` (the Modal app is deployed through the `modal-app` OpenTofu
  module; you can also `modal deploy -m src` directly).
- **D1 migrations** → `scripts/d1-migrate.sh` (and `wrangler` for ad-hoc Worker operations).
- **Web app** (`apps/orto`) → auto-deploys via its own dashboard-managed Vercel Git integration on
  push (not OpenTofu).

## Local development

See [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) for the full local loop. In short:

- `pnpm dev` (root, Turbo) starts the dev servers for packages that define a `dev` task and builds
  `@open-inspect/shared` first (`dependsOn: ["^build"]`).
- Copy `packages/control-plane/.dev.vars.example` to `.dev.vars` for local secrets, and
  `apps/orto/.env.example` to `.env.local`.
- `control-plane` runs locally via `wrangler dev` (Miniflare provides local D1/DO/KV/R2).

## Further Reading

- [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) — deploy your own instance
- [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) — detailed architecture and session lifecycle
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution guidelines
- [packages/control-plane/README.md](packages/control-plane/README.md) — API reference, WebSocket
  protocol, D1 schema, security model
- [packages/modal-infra/README.md](packages/modal-infra/README.md) — sandbox internals, Modal
  deployment, endpoint URLs
