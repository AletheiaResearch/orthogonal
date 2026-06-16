# Terminus (CON-41) — continuation handoff

Paste the prompt below into a fresh session **in a worktree off the `terminus` branch** to continue
the LLM gateway. Full design + the committed **CON-50 and CON-53 plans** live in
[`docs/terminus-llm-gateway.md`](./terminus-llm-gateway.md).

## State (as of the foundation merge)

- The **foundation is merged into `terminus`** (PR #12): CON-48 (proxy), CON-49 (`/v1/models`),
  CON-51 (credential resolution), CON-52 (token auth), CON-54-scoped (cost-priced usage emission;
  durable store deferred), + all CodeRabbit/Codex review fixes. 78 tests, typecheck/build/lint
  green.
- **Remaining: CON-50 then CON-53.** CON-54's durable sink is deferred (a timeseries metrics DB is
  chosen later). `main` is untouched; everything integrates on `terminus` first.

## Continuation prompt

> Continue Linear issue **CON-41** (Terminus LLM gateway). The foundation is already merged into the
> `terminus` branch; read `docs/terminus-llm-gateway.md` first (it has the committed CON-50 + CON-53
> plans and locked decisions). **Remaining work: CON-50 (Codex OAuth) then CON-53 (OpenCode
> wiring).**
>
> **Branch/PR:** create a **new branch off `terminus`** named so it does NOT contain `con-41` (e.g.
> `nejc/con-50-codex-opencode`) — a `con-41` branch would auto-close the CON-41 epic on merge. Open
> a **new PR with base `terminus`** (NOT `main`); reference CON-50 + CON-53 in the body. Push with
> `git push origin HEAD:<your-branch>`. `terminus → main` is a separate, later step.
>
> **Repo rules:** build `@open-inspect/shared` first; conventional commits; **sole author Nejc
> Drobnič — never add a Co-Authored-By trailer or any AI-attribution footer to commits or PRs**;
> pnpm catalog is `strict` with a 7-day `minimumReleaseAge` gate (pin versions published ≥7 days
> ago); **TDD** (test first, watch it fail); **verify before claiming done**
> (`pnpm --filter @orthogonal/terminus typecheck && test && build`, `pnpm fmt:check`, `pnpm lint`,
> `tofu fmt -check` for any `.tf`); call the `advisor` before committing to an approach and before
> declaring done; use **Workflows** for parallel research/impl; keep `docs/terminus-llm-gateway.md`
> updated (shown live via the cmux markdown viewer).
>
> **Linear:** move sub-issues to **In Review** + link the new PR when implemented; keep **CON-41**
> (root) **In Progress** — do NOT let it auto-close until the whole epic lands; **CON-54** stays
> open to track the durable timeseries-DB store. Comment durable decisions on the relevant issue.
>
> **Locked decisions:** CON-53 ships behind a **default-OFF `llmGatewayEnabled`** toggle (raw-key
> injection stays; flip ON only after a live smoke test) with a **short-TTL token + plugin refresh**
> and **plugin** (not inline) delivery. CON-50 reuses **control-plane as the sole token refresher**
> (Terminus pulls access tokens over a `CONTROL_PLANE` service binding — never holds the refresh
> token) and builds Codex via `@ai-sdk/openai` `.responses()` + `ChatGPT-Account-Id` with a
> synthetic `codex/*` provider. CON-54 has **no durable store** (timeseries DB chosen later).
>
> **Live-verify gaps (implement + unit-test here; flag a deploy-time smoke test):** CON-50's
> upstream body contract at `chatgpt.com/backend-api/codex/responses` (needs real Codex creds);
> CON-53's OpenCode config-hook baseURL repoint (needs a live pinned-OpenCode sandbox).
>
> Suggested CON-50 order: (1) spike the Codex request body via `createOpenAI({ fetch })`; (2)
> identification seam (`codex/*` → `ResolvedModelRef.credentialMode`); (3) router Codex-Responses
> branch; (4) control-plane service-auth on the token-refresh route + a Terminus
> `CodexCredentialResolver` over the service binding; (5) wire `chat.ts`; (6) advertise-always in
> `/v1/models`. TDD each; commit + push as you go.
