# Orto — Orthogonal Web Client

The canonical Orthogonal web application for interacting with coding sessions. Built with Next.js,
deployed on Vercel, with PostHog analytics.

## Features

- GitHub OAuth authentication
- Session dashboard with list view
- Real-time streaming via WebSocket
- Message timeline with tool calls
- Multi-participant presence indicators
- Responsive design for desktop and mobile

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js App                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                       App Router                          │   │
│  │  /                  - Dashboard (session list)           │   │
│  │  /session/new       - Create new session                 │   │
│  │  /session/[id]      - Session view with streaming        │   │
│  │  /settings          - Settings (secrets management)      │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      API Routes                           │   │
│  │  /api/auth/[...nextauth] - GitHub OAuth                  │   │
│  │  /api/sessions           - Session CRUD                  │   │
│  │  /api/repos              - Repository list               │   │
│  │  /api/repos/:owner/:name/secrets - Secrets CRUD          │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                        Hooks                              │   │
│  │  useSessionSocket - WebSocket connection + state         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
              │                              │
              ▼                              ▼
      Control Plane API              Control Plane WebSocket
```

## Setup

### Prerequisites

- Node.js 22+
- GitHub App configured for OAuth (see below)

### GitHub App Setup

The web client uses a **GitHub App** (not OAuth App) for user authentication. When creating the
GitHub App:

1. Go to GitHub → Settings → Developer settings → GitHub Apps → New GitHub App
2. Set the **Callback URL** to: `https://your-domain.com/api/auth/callback/github`
3. Under **"Where can this GitHub App be installed?"**, select **"Any account"**

> **Important**: If you select "Only on this account", only users from that account will be able to
> authenticate. Other users will experience a redirect loop when trying to sign in.

> **Note for Organizations**: If your GitHub App is owned by an organization, the "Any account"
> setting should allow users outside the organization to authenticate, but this has not been
> extensively tested. Please verify this works for your use case.

Required permissions for the GitHub App:

- **Account permissions**: Email addresses (read-only)
- **Repository permissions**: Contents (read & write) - for repo operations

### Environment Variables

Create `.env.local` from [.env.example](.env.example) — it lists the full set (GitHub OAuth,
NextAuth, control plane, access control, branding, PostHog).

> **Access Control**: If both `ALLOWED_USERS` and `ALLOWED_EMAIL_DOMAINS` are empty, sign-in is
> denied unless `UNSAFE_ALLOW_ALL_USERS=true`.

### Development

```bash
# Install dependencies (from repo root)
corepack enable && pnpm install

# Run development server
pnpm --filter @orthogonal/orto dev

# Type check
pnpm --filter @orthogonal/orto typecheck

# Build for production
pnpm --filter @orthogonal/orto build
```

## Pages

### Dashboard (`/`)

- Lists all user's sessions
- Shows session status, repository, and creation date
- Link to create new session

### New Session (`/session/new`)

- Repository selector (populated from GitHub)
- Optional title field
- Creates session and redirects to session view

### Settings (`/settings`)

- Repository-scoped secrets management
- Select a repository, then add/edit/delete environment variable secrets
- Secrets are encrypted and stored in D1, injected into sandboxes at runtime

### Session View (`/session/[id]`)

- Real-time WebSocket connection
- Message input with typing indicator
- Event timeline (tool calls, results, tokens)
- Streaming content display
- Participant presence list
- Stop button during execution
- Artifacts sidebar (PRs, screenshots)

## WebSocket Protocol

The `useSessionSocket` hook manages:

1. **Connection**: Auto-connect with exponential backoff on disconnect
2. **Subscription**: Authenticates and subscribes to session
3. **Events**: Handles sandbox events (tokens, tool calls, etc.)
4. **Presence**: Tracks active participants
5. **Health**: Ping/pong every 30 seconds

## Styling

Uses Tailwind CSS with:

- Dark mode support via `prefers-color-scheme`
- Custom color variables
- Responsive design utilities

## State Management

Uses React state + hooks for simplicity. For larger apps, consider:

- Zustand for global state
- React Query for server state
- Jotai for atoms

## Analytics (PostHog)

Set `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` to enable PostHog (US cloud). When unset, all PostHog code
paths are no-ops.

- `src/instrumentation-client.ts` initializes posthog-js with automatic pageview capture; events are
  proxied through `/ingest` (rewrites in `next.config.ts`) so ad blockers don't drop them.
- `PostHogIdentity` (mounted in `src/app/providers.tsx`) calls `posthog.identify(<github user id>)`
  after GitHub login with person properties `email`, `name`, `github_login`, and `avatar_url`.
  PostHog shows person avatars via Gravatar on `email`; `avatar_url` carries the GitHub picture as a
  custom property.
- Sign-out calls `posthog.reset()` so shared devices don't mix identities.

## Deployment (Vercel)

This app is deployed via a dashboard-managed Vercel project — it is **not** managed by OpenTofu.

1. Create a Vercel project from this repository.
2. **Root Directory**: `apps/orto`
3. **Install Command**:
   `cd ../.. && corepack enable && pnpm install --frozen-lockfile && pnpm --filter @open-inspect/shared build`
4. **Build Command**: `next build` (default)
5. Set the environment variables from [.env.example](.env.example).

`next`/`react`/`react-dom` are pinned in `package.json` (not `catalog:`) because Vercel's framework
detection can't resolve pnpm catalog references.
