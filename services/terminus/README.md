# @orthogonal/terminus — LLM gateway

Terminus is a stateless Cloudflare Worker that fronts all LLM traffic for sandboxes. It:

- **verifies** a short-lived signed token on every request (stateless: signature + `exp`) — CON-52;
- **serves** a dynamic model catalog from the [models.dev](https://models.dev) registry via
  `GET /v1/models`, narrowed to the providers that have a configured credential — CON-49;
- **resolves** the upstream provider credential server-side per request (shared platform key now;
  dashboard / per-tenant / BYOK later) — CON-51;
- **proxies** chat completions (streaming + non-streaming) through the **Vercel AI SDK**, exposing
  an OpenAI-compatible `POST /v1/chat/completions` surface — CON-48.

Sandboxes hold only the scoped token; raw provider keys live only in this Worker. LiteLLM is the
conceptual reference; the build is on the Vercel AI SDK.

## Dynamic providers

Provider support is **dynamic, OpenRouter-style**: a provider is enabled when a credential for it
exists, and the AI SDK handles the call generically (`@ai-sdk/openai-compatible` with the registry
`baseURL`). Code-level **overrides** exist only for providers that need special handling (Anthropic,
OpenAI, and later Codex OAuth). Adding a typical provider is just dropping in a key.

## Development

```bash
pnpm --filter @open-inspect/shared build   # build shared first
pnpm --filter @orthogonal/terminus build
pnpm --filter @orthogonal/terminus test
pnpm --filter @orthogonal/terminus typecheck
```

Local dev config is in `wrangler.toml`; production deployment is via Terraform. See
[docs/terminus-llm-gateway.md](../../docs/terminus-llm-gateway.md) for the design + tracking doc.
