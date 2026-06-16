# Local Development

This is the canonical runbook for running Open-Inspect on your machine — booting the web app on its
own, or standing up the full control-plane stack locally. Every command and path below is grounded
in the current repo; copy-paste them as written.

> Looking for the goal-oriented quick paths (Path A/B/C) or contributor test commands? See
> [SETUP_GUIDE.md](./SETUP_GUIDE.md). For full production deployment, see
> [GETTING_STARTED.md](./GETTING_STARTED.md).

---

## Overview

There are three ways to develop locally, in increasing order of how much backend you run:

| Mode             | What runs locally                          | Backend                               | Use it for                                        |
| ---------------- | ------------------------------------------ | ------------------------------------- | ------------------------------------------------- |
| **Storybook**    | `apps/storybook` only                      | None                                  | Pure UI / component work, no auth, no network     |
| **Web (Mode A)** | `apps/orto` (Next.js)                      | An **already-deployed** control plane | Frontend work against real data, no local backend |
| **Full stack**   | `apps/orto` + `control-plane` via wrangler | Local Miniflare (D1/DO/KV/R2)         | End-to-end control-plane work                     |

**One hard limitation:** the Modal data plane (sandboxes) runs in **Modal's cloud** — it cannot run
fully on `localhost`. See [Sandboxes / Modal data plane](#sandboxes--modal-data-plane) for how to
develop against it.

---

## Prerequisites

- **Node.js 24.x** — the repo pins `"node": "24.x"` in the root `package.json` `engines` field.
- **pnpm** — enable via Corepack so you get the pinned version (`pnpm@11.5.2`):

  ```bash
  corepack enable
  ```

- **A GitHub OAuth App** (or a GitHub App with OAuth enabled) for sign-in. Its callback URL must
  include `http://localhost:3000/api/auth/callback/github` (see
  [GitHub OAuth callback](#github-oauth-callback)).
- **OpenTofu** (`tofu`) — only if you touch infrastructure. Install with `brew install opentofu` or
  follow <https://opentofu.org/docs/intro/install/>. See
  [Infrastructure (OpenTofu)](#infrastructure-opentofu).
- **Modal CLI** (`modal`) — only if you develop the data plane.

---

## Quick start: the web app (`apps/orto`)

This is the fastest way to see the UI with real auth and data. These four steps are verified to boot
the frontend (`GET /` returns HTTP 200, `/api/auth/providers` returns the GitHub provider).

### 1. Install dependencies

```bash
corepack enable && pnpm install
```

### 2. Build `@open-inspect/shared` first (required)

```bash
pnpm --filter @open-inspect/shared build
```

**Do not skip this.** `apps/orto` imports `@open-inspect/shared` as its **compiled `dist`**
(`packages/shared/package.json` sets `"main": "dist/index.js"`), and `shared` is **not** listed in
orto's `transpilePackages` — `apps/orto/next.config.ts` only transpiles `@orthogonal/ui`. If you
skip the build, module resolution fails with `Cannot find module @open-inspect/shared`.

### 3. Create `.env.local`

```bash
cp apps/orto/.env.example apps/orto/.env.local
```

Minimal values for local FE work:

```bash
# NextAuth
NEXTAUTH_URL=http://localhost:3000
# Generate with: openssl rand -base64 32  (paste the output below)
NEXTAUTH_SECRET=

# GitHub App OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Control plane endpoints (Mode A: a deployed control plane)
CONTROL_PLANE_URL=https://your-control-plane.workers.dev
NEXT_PUBLIC_WS_URL=wss://your-control-plane.workers.dev
# Must equal the deployed control plane's INTERNAL_CALLBACK_SECRET — required, or
# session list/create throw (apps/orto/src/lib/control-plane.ts).
INTERNAL_CALLBACK_SECRET=

# Access control — for solo dev, allow yourself in (see Troubleshooting)
UNSAFE_ALLOW_ALL_USERS=true
```

Notes:

- `CONTROL_PLANE_URL` has **no default** and the server throws `CONTROL_PLANE_URL not configured` if
  it is unset.
- `INTERNAL_CALLBACK_SECRET` is **also required** — `apps/orto/src/lib/control-plane.ts` throws
  without it, so sign-in succeeds but every session list/create fails. Set it to the control plane's
  value.
- `NEXT_PUBLIC_WS_URL` defaults to `ws://localhost:8787` when unset.
- Access control: sign-in is **denied** when both `ALLOWED_USERS` and `ALLOWED_EMAIL_DOMAINS` are
  empty, unless `UNSAFE_ALLOW_ALL_USERS=true`. For solo dev, set `UNSAFE_ALLOW_ALL_USERS=true`;
  otherwise list yourself in `ALLOWED_USERS` (comma-separated GitHub logins) or set
  `ALLOWED_EMAIL_DOMAINS`.
- `NEXT_PUBLIC_*` vars are inlined at build time — restart the dev server after changing them.

### 4. Run the dev server

```bash
pnpm --filter @orthogonal/orto dev
```

Next.js 16 (Turbopack) starts on <http://localhost:3000>.

### Mode A vs Mode B

- **Mode A — remote control plane (quickest):** point `CONTROL_PLANE_URL` + `NEXT_PUBLIC_WS_URL` at
  an already-deployed control plane (use `https://` / `wss://`). No local backend needed. This is
  the setup shown above.
- **Mode B — local control plane:** run the control plane locally (see
  [Full stack locally](#full-stack-locally)) and point orto at the local Worker instead:

  ```bash
  CONTROL_PLANE_URL=http://localhost:8787
  NEXT_PUBLIC_WS_URL=ws://localhost:8787
  ```

### Component-only work

If you only need to build or tweak UI components with **no backend and no auth**, use Storybook
instead of the full app:

```bash
pnpm --filter @orthogonal/storybook dev
```

Storybook serves on <http://localhost:6006>.

### GitHub OAuth callback

Your GitHub OAuth App (or GitHub App with OAuth) must list this callback URL exactly:

```
http://localhost:3000/api/auth/callback/github
```

If it does not match exactly, sign-in fails with a `redirect_uri` error.

---

## Full stack locally

Run the control plane on your machine, then point orto at it (Mode B above).

### Control plane

The control plane runs under **Wrangler + Miniflare**, which provides local **D1, Durable Objects,
KV, and R2** — no Cloudflare account needed for local dev.

```bash
# 1. Build @open-inspect/shared first — wrangler bundles it from dist/ (gitignored),
#    and running this dev script directly skips turbo's ^build.
pnpm --filter @open-inspect/shared build

# 2. Local secrets
cp packages/control-plane/.dev.vars.example packages/control-plane/.dev.vars
# edit packages/control-plane/.dev.vars and fill in the values you need

# 3. Apply the D1 schema to the LOCAL database — Miniflare's D1 starts empty, and
#    session routes write to `sessions`, `users`, etc. One-time setup:
(cd packages/control-plane && for f in ../../terraform/d1/migrations/*.sql; do
  pnpm exec wrangler d1 execute open-inspect-test --local --file "$f" --yes
done)

# 4. Start the worker
pnpm --filter @open-inspect/control-plane dev
```

The `dev` script is `wrangler dev`. It uses the checked-in `packages/control-plane/wrangler.jsonc`
(a **test-only** config) for its bindings. Default local URL: <http://localhost:8787>. The local D1
state persists in `packages/control-plane/.wrangler/`, so step 3 is one-time — re-run it when new
migrations land under `terraform/d1/migrations/`.

When running the full loop, the orto and control-plane secrets must agree:

- `INTERNAL_CALLBACK_SECRET` in `apps/orto/.env.local` must **match** the control plane's
  `INTERNAL_CALLBACK_SECRET`. (Generate a value with `openssl rand -base64 32` and use the same
  value in both.)

### Run everything at once

From the repo root:

```bash
pnpm dev
```

This runs `turbo run dev --filter=!@orthogonal/landing`. The `dev` task in `turbo.json` is
`{ cache: false, persistent: true, dependsOn: ["^build"] }`, so workspace dependencies (notably
`@open-inspect/shared`) build before the dev servers start. It launches:

| Service       | Package                       | Command (filter)                                | Local URL               |
| ------------- | ----------------------------- | ----------------------------------------------- | ----------------------- |
| Web app       | `@orthogonal/orto`            | `pnpm --filter @orthogonal/orto dev`            | <http://localhost:3000> |
| Storybook     | `@orthogonal/storybook`       | `pnpm --filter @orthogonal/storybook dev`       | <http://localhost:6006> |
| Control plane | `@open-inspect/control-plane` | `pnpm --filter @open-inspect/control-plane dev` | <http://localhost:8787> |

`apps/landing` also defines a `dev` task but is **excluded** from `pnpm dev` — it is a separate
Next.js app that would otherwise collide with `orto` on port `3000`. Run it on its own when needed:
`pnpm --filter @orthogonal/landing dev` (add `next dev --port <port>` if orto is already running).

---

## Sandboxes / Modal data plane

**Be honest about this:** Modal sandboxes execute in **Modal's cloud**. They cannot run fully on
`localhost`. There is no local Modal runtime.

For data-plane development you have two options:

1. **Hot-reload against Modal cloud** — run an ephemeral, auto-reloading deploy that still executes
   in Modal's cloud:

   ```bash
   cd packages/modal-infra
   modal serve -m src
   ```

   (For a non-ephemeral deploy use `modal deploy -m src` or `modal deploy deploy.py`. **Never deploy
   `src/app.py` directly** — it doesn't import the function modules.)

2. **Point the control plane at an already-deployed Modal app** — simplest if you only need
   sandboxes to work, not to change them.

### Connecting a cloud sandbox to your local control plane

A sandbox running in Modal's cloud cannot reach `http://localhost:8787`. To close the loop with a
**local** control plane you need a public tunnel:

1. Expose `:8787` with a tunnel (`cloudflared` or `ngrok`).
2. Add the tunnel's host to `ALLOWED_CONTROL_PLANE_HOSTS` in `modal-infra`.
3. Set the control plane's `WORKER_URL` (in `packages/control-plane/.dev.vars`) to the public tunnel
   URL. The sandbox calls back to `WORKER_URL`, so leaving it `http://localhost:8787` makes the
   cloud sandbox connect to its own localhost instead of yours.

Without a tunnel, point the control plane at an already-deployed Modal app instead.

---

## Environment files reference

Each app/package ships an example file. Copy it to the real filename and fill in the values.

| App / package            | Example file                               | Copy to                            | Loaded by      |
| ------------------------ | ------------------------------------------ | ---------------------------------- | -------------- |
| Repo root                | `.env.example`                             | `.env`                             | tooling        |
| `apps/orto`              | `apps/orto/.env.example`                   | `apps/orto/.env.local`             | Next.js        |
| `apps/landing`           | `apps/landing/.env.example`                | `apps/landing/.env.local`          | Next.js        |
| `packages/control-plane` | `packages/control-plane/.dev.vars.example` | `packages/control-plane/.dev.vars` | `wrangler dev` |
| `packages/modal-infra`   | `packages/modal-infra/.env.example`        | `packages/modal-infra/.env`        | Modal          |

- **Next.js apps** use `.env.local` (not committed).
- **Cloudflare Workers** use `.dev.vars` (not committed); bindings come from the wrangler config,
  not from `.dev.vars`.

---

## Infrastructure (OpenTofu)

The project uses **OpenTofu** — the CLI is `tofu` (v1.12 in use). The `terraform/` directory name,
`terraform {}` HCL blocks, and `terraform.tfvars` / `backend.tfvars` / `.terraform.lock.hcl`
filenames are intentionally kept (OpenTofu reads them for backward compatibility).

Common local commands:

```bash
tofu init -backend-config=backend.tfvars
tofu plan
tofu apply
tofu output
tofu import <addr> <id>
```

For the full deployment workflow, see [terraform/README.md](../terraform/README.md). Don't run
`apply` against shared infrastructure for routine local development — local dev does not require it.

---

## Troubleshooting

### `Cannot find module @open-inspect/shared`

You skipped the shared build. `apps/orto` imports the **compiled** `dist`, and `shared` is not in
orto's `transpilePackages`. Build it:

```bash
pnpm --filter @open-inspect/shared build
```

### `CONTROL_PLANE_URL not configured`

`CONTROL_PLANE_URL` has no default and the server throws when it is unset. Set it in
`apps/orto/.env.local`:

- Mode A (remote): `CONTROL_PLANE_URL=https://your-control-plane.workers.dev`
- Mode B (local): `CONTROL_PLANE_URL=http://localhost:8787`

### Port already in use

- **Web vs landing (`:3000`):** both default to Next.js port 3000. Run one, or start the other on a
  different port:

  ```bash
  pnpm --filter @orthogonal/orto dev -- --port 3001
  ```

### Sign-in denied after authenticating with GitHub

Access control is rejecting you. Sign-in is denied when both `ALLOWED_USERS` and
`ALLOWED_EMAIL_DOMAINS` are empty. In `apps/orto/.env.local`, either:

- set `UNSAFE_ALLOW_ALL_USERS=true` (solo dev), or
- add your GitHub login to `ALLOWED_USERS` (comma-separated), or
- set `ALLOWED_EMAIL_DOMAINS` to your email domain.

### `redirect_uri` error during sign-in

The GitHub OAuth App callback URL must exactly match
`http://localhost:3000/api/auth/callback/github`.

### Session APIs return 401 against a local control plane

`INTERNAL_CALLBACK_SECRET` in `apps/orto/.env.local` must match the control plane's
`INTERNAL_CALLBACK_SECRET` in `packages/control-plane/.dev.vars`.

---

## Related docs

- Goal-oriented setup paths (A/B/C) and contributor test commands:
  [SETUP_GUIDE.md](./SETUP_GUIDE.md)
- Full production deployment: [GETTING_STARTED.md](./GETTING_STARTED.md)
- Architecture and internals: [HOW_IT_WORKS.md](./HOW_IT_WORKS.md)
- Infrastructure (OpenTofu): [terraform/README.md](../terraform/README.md)
- Debugging and observability: [DEBUGGING_PLAYBOOK.md](./DEBUGGING_PLAYBOOK.md)
