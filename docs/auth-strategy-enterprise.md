# Auth & Identity Strategy — Enterprise/Multi-Tenant Open-Inspect

> Complements [docs/cf-agents-sdk-migration-v2.md](cf-agents-sdk-migration-v2.md) §4 (multi-tenancy:
> data model, RBAC, and how the boundary threads through everything).

**Decision owner:** platform/eng lead. **Status:** decisive recommendation, with **one unresolved
pivot fork (Better Auth runtime placement)** that determines the spike target and gates the primary
path. **Bottom line up front:** Adopt **Better Auth** as the base auth + org/membership/RBAC layer —
it ships the exact v2 tenant model you were about to hand-roll, carries no SSO tax, and can keep
identity data out of any third-party vendor's path. **But "where Better Auth's SSO/SCIM runs" is the
pivot fork, not a settled detail**, and it changes everything downstream:

- **Option orto/Vercel-Node (the common case):** Better Auth's SSO/SCIM run under Node on Vercel.
  SAML XML-signature crypto runs in Node, **so the "edge SAML-crypto risk" is MOOT** and Better Auth
  is _more_ clearly primary. **But then "data in your own D1" does not hold as written** — auth data
  lives in a Vercel-adjacent store, OR Better-Auth-on-Vercel writes to Cloudflare D1 over the D1
  HTTP API (**MUST-VERIFY** adapter compat). The Phase-0 spike retargets to **Vercel Node**.
- **Option in-CP/Workers (only if a buyer hard-requires data-in-your-own-D1 residency):** Better
  Auth runs _in_ the control-plane with the D1 binding → residency-in-D1 holds → **but reintroduces
  the edge SAML-crypto risk**. The Phase-0 spike targets **Workers + `nodejs_compat` + D1**.

If the (placement-conditional) spike fails or the first enterprise-SSO customer lands before the
plugin path hardens, the fallback **depends on the buyer's residency posture**: for
residency-relaxed buyers, the **named hybrid — Better Auth base + WorkOS for the enterprise SSO/SCIM
leg** (Factory's exact precedent); for **residency-strict** buyers, run **Better Auth's SSO/SCIM in
orto on Vercel Node** (Node sidesteps the Workers edge-crypto issue) and accept owning SAML ops —
**not WorkOS**, which transits identity metadata and fails the bar the primary was chosen to clear.

The control-plane only ever _verifies a signed principal_ — pure WebCrypto, edge-safe for every
provider. That seam is settled. **Where the auth server runs is not.**

**Tags:** `[DOC]` = read from vendor docs. `[UNCERTAIN]` = inferred / not confirmed / must verify.
`[OURS]` = grounded in this repo.

---

## 0. The reconciliation that everything hinges on — read this first

There is a trap in the prompt's framing ("self-host/data-residency requirement"). **Resolve it
explicitly or the whole briefing contradicts itself:**

- **Our data plane is SaaS-on-Cloudflare (Workers + DO + D1) and cannot offer true single-tenant /
  VPC / on-prem / air-gapped without re-architecting off the managed platform** `[OURS]`. Factory's
  four-deployment-model menu (SaaS / Hybrid / On-Prem / Air-Gapped) is _not_ a bar this stack can
  meet. Varick's "deploy on your cloud" posture is the opposite trade — available to them because
  they install into the customer's environment; not us.
- Therefore, **for THIS product the realistic enterprise wedge is: SaaS-on-CF + strong
  SSO/SCIM/RBAC/audit + data residency (region-pinned)** — not deploy-in-your-VPC.
- **This collapses what "self-host/residency" means for the AUTH layer** down to two concrete
  properties: **(a) data residency** (identity data lives in a region you choose) and **(b)
  no-third-party-vendor-in-the-identity-data-path** (PII never transits an external SaaS). It does
  _not_ mean "deploy auth in the customer's VPC."

**Carry the (a)/(b) split everywhere below — the two properties do not move together.** This is the
tool that keeps the recommendation internally consistent: each reconciled claim must say _which_
property it clears.

**The residency claim and the orto seam may be mutually exclusive — flag it, don't assert both
`[UNCERTAIN — MUST-VERIFY]`:**

- **(a) data-in-your-own-D1 is a Cloudflare Workers/D1-binding feature.** Better Auth's native D1
  support (and `better-auth-cloudflare`'s `withCloudflare()`) pass the **D1 binding directly** — a
  Workers primitive. **`orto` has no D1 binding and no wrangler config (confirmed `[OURS]`) — it is
  plain Vercel Next.js.** So "identity PII stays in your D1, region-pinned with your app data" is
  **only demonstrated for the in-CP/Workers placement**, not for the recommended orto/Vercel
  placement.
- **Better-Auth-on-Vercel writing to Cloudflare D1 via the D1 HTTP API is a MUST-VERIFY** — the
  dossier never establishes that path for the Better Auth adapter. On the orto path, identity likely
  lands in a **Vercel-adjacent store (Postgres/Neon)**, which clears **(b) no-vendor-in-path** but
  **changes what "data residency" means** (region-of-store, not data-in-your-D1).
- **Reconcile, do not double-assert:** the data-in-your-D1 story requires the Workers/in-CP
  placement (which reintroduces the edge-SSO crypto risk); the low-friction orto placement clears
  (b) but does **not** by itself clear (a)-as-D1. This is the same pivot the BLUF names; see §7
  decision-point 1.

**Why this matters for provider choice:**

- If the bar is **residency + no-vendor-in-the-data-path** (the realistic case for almost every
  buyer): Better Auth's headline advantage is _consistency with your own residency story_ — your
  auth data lives where you choose, under no third party. Putting WorkOS in the _identity_ path then
  becomes a compromise on **(b)** (auth metadata transits WorkOS), defensible only for buyers who
  relax (b).
- If even **one** near-term buyer hard-requires _nothing third-party touches identity_ (strict (b)):
  WorkOS/Auth0/Clerk/Kinde are disqualified _for that deal_, and self-hosted Better Auth is forced.
  If that buyer _also_ hard-requires data-in-your-own-D1 (strict (a)-as-D1), the placement fork
  resolves to **in-CP/Workers** and the edge-crypto spike must pass — or you accept a residency
  compromise. (Keycloak is reserved only for a buyer who additionally demands the IdP run inside
  _their_ infra — which our SaaS data plane can't satisfy anyway.)

I do **not** claim "Better Auth wins self-host" in the VPC sense. I claim Better Auth wins on **(a)
residency + (b) no-vendor-in-the-data-path** — the bar that actually applies to a SaaS-on-CF product
— with the **(a)-as-D1 sub-claim being placement-conditional**. That is the consistent through-line
of this briefing.

---

## 1. The enterprise-readiness bar

### Table stakes — absence _stalls the deal_ in security review

| Requirement                                                                                             | Auth-layer concern?                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| SSO — SAML 2.0 + OIDC, **per-org** enterprise connections (customer brings their own Okta/Entra/Google) | **Yes — auth layer** `[DOC]` (Factory does this via WorkOS)                                                               |
| Domain verification as the SSO/tenancy anchor ("SSO cannot be enabled without verified domains")        | **Yes — auth layer** `[DOC]`                                                                                              |
| **SOC 2 Type II** report                                                                                | No — org/process cert (not a code feature)                                                                                |
| DPA + GDPR/CCPA + subprocessor list                                                                     | No — legal/commercial                                                                                                     |
| Org-scoped RBAC (admin / member minimum), **enforced server-side**                                      | Split — IdP _carries_ groups; **your control-plane enforces**                                                             |
| Audit logs — auth events **and** agent-action trail                                                     | Split — auth events from IdP; **agent-action trail is yours**                                                             |
| Encryption at rest + in transit (AES-256 / TLS 1.2+)                                                    | No — infra                                                                                                                |
| **"We do not train on your code"** (deal-breaker for a _code_ product specifically)                     | No — data policy `[DOC]`                                                                                                  |
| **SCIM 2.0** provisioning + **deprovisioning**                                                          | **Yes — auth layer.** Table stakes for _large_ orgs (3k+ employees / dedicated IT); differentiator for mid-market `[DOC]` |

### Differentiators — win competitive deals / unlock the largest accounts

| Differentiator                                                                     | Auth-layer concern?                                                     |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Self-host / VPC / on-prem / air-gapped                                             | **No for this stack** — can't be met on Workers+DO+D1 (see §0) `[OURS]` |
| **Data residency** (region pinning, EU-only option) + CMEK/BYOK                    | Partly — _where identity data lives_ is an auth concern                 |
| FedRAMP (public sector); ISO 27001 + **ISO 42001** (AI-management)                 | No — cert track                                                         |
| Zero Data Retention                                                                | No — data policy                                                        |
| SIEM export + configurable retention                                               | Split — auth-event export from IdP; **agent-action export is yours**    |
| Agent-specific governance (repo risk tiers, command allow/deny, autonomy controls) | No — product                                                            |
| IP allowlisting / granular network policy                                          | No — infra                                                              |

**One genuine strength to lean into** `[OURS]`: the per-session **Durable Object + event-store**
architecture (D1 session index + DO SQLite + event history) positions you _well_ for the
**agent-action audit trail + SIEM export** — a table-stakes-to-differentiator item that's hard for
others and natural for you. Build it as a first-class append-only, exportable artifact.

**The one-line rule:** the auth layer satisfies **authentication + user lifecycle** (SSO / SCIM /
JIT / domain verification). It does **not** satisfy **authorization enforcement, the agent-action
audit trail, compliance certs, or deployment sovereignty** — those live in your control-plane, your
org processes, and your infra.

---

## 2. Comparison matrix

`[DOC]` unless tagged. Read the SSO-tax and self-host/residency columns against §0.

| Axis                                      | **Better Auth** (OSS lib)                                                                                                                                                                                                                        | **Keycloak** (self-host server)                                                                                         | **Auth0** (SaaS)                                                                                         | **Clerk** (SaaS)                                                                                                                              | **Kinde** (SaaS)                                                                                                                         | **WorkOS** (SSO add-on)                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Enterprise SSO (SAML+OIDC, per-org)**   | SAML 2.0 + OIDC, per-org via `organizationId`, IdP-initiated, multi-IdP; v1.5 hardened SAML (signed AuthnRequests, SLO, replay prevention). **Edge-runtime stability `[UNCERTAIN]`**                                                             | SAML 2.0 + OIDC + brokering; per-org IdP via Organizations (GA v26); per-org UX **newer/less turnkey**                  | Best-in-class breadth; per-org enterprise connections; IdP-initiated (Auth0 discourages it)              | SAML + OIDC + EASIE; per-org via B2B add-on; IdP-initiated (SAML only)                                                                        | SAML + OIDC, per-org or global; IdP-initiated; home-realm discovery                                                                      | **Best-in-class.** Per-org SAML+OIDC; **Admin Portal lets each customer self-configure their IdP** (sales accelerant)         |
| **SCIM (provision + deprovision)**        | First-party `@better-auth/scim` server; Entra ID support; standards-based (Okta/Google by-name `[UNCERTAIN]`)                                                                                                                                    | **WEAK — biggest gap.** No native SCIM; OSS plugin EOL (kc≤20); maintained path is commercial license or build-your-own | Inbound SCIM **included on all tiers** (unusual, good)                                                   | Full SCIM; deprovision **revokes sessions immediately**; Okta near-real-time, Entra ~40min; Google Workspace SCIM-out limited (industry-wide) | **Pre-GA — "Coming soon," no GA date.** Listed only on Scale tier. Deal-breaker if buyer mandates SCIM at signing `[UNCERTAIN coverage]` | Full SCIM Directory Sync; Okta/Entra/Google/Workday + dozens; webhooks **or** Events API (good for a Worker handler→D1)       |
| **B2B orgs ↔ our tenants+memberships**    | **Strongest fit.** `organization` plugin = tenants + memberships(owner/admin/member) + invitations + `activeOrganizationId`; near-1:1 with v2 model                                                                                              | Organizations (GA v26) = B2B; realm = hard-isolation tenant; younger, more glue UI                                      | Mature Organizations; unlimited orgs on B2B tiers; ~1:1 fit                                              | Excellent; default admin/member roles = near-exact 1:1; store `installation_id` as org metadata                                               | Very good; orgs + `external_id` for your key; multi-org membership                                                                       | First-class Organizations + Memberships + per-org SSO/Directory; ~1:1; can keep D1 as source of truth                         |
| **CF Workers / edge fit (control-plane)** | **Only one that can run IN the CP** via `better-auth-cloudflare` (native D1 Kysely/Drizzle + KV); needs `nodejs_compat`; **SSO plugin history of breaking on Workers `[UNCERTAIN]`**                                                             | Cannot run in CP (JVM + TCP DB). CP verifies tokens via `jose`/JWKS (edge-safe)                                         | No SDK in CP; verify RS256 via JWKS/`jose` (you write it). Next SDK Node/Vercel-shaped                   | `@clerk/backend` does networkless JWKS verify on Workers; smoke-test workerd crypto `[UNCERTAIN]`                                             | Full SDK Node-only; **JWKS verify only** in CP (supported pattern)                                                                       | Core `@workos-inc/node` is edge-safe (Fetch+WebCrypto); or plain REST from a Worker. AuthKit-Next is Node-only                |
| **Next.js fit (orto on Vercel)**          | First-class App Router; "fully compatible with Next.js 16"; `toNextJsHandler`/`nextCookies`                                                                                                                                                      | Community-only (Auth.js Keycloak provider); no first-party SDK                                                          | `@auth0/nextjs-auth0` happy path on Vercel/Node                                                          | Best-in-class first-party `@clerk/nextjs`                                                                                                     | First-class Kinde Next.js SDK (Node 20+)                                                                                                 | `authkit-nextjs` first-class on Vercel/Node                                                                                   |
| **Own-DB vs our D1**                      | **Uses YOUR D1** (native since 1.5) — **via the D1 binding, a Workers primitive**; on Vercel/orto (no D1 binding) this needs the **D1 HTTP API `[UNCERTAIN — MUST-VERIFY]`** or a Vercel-adjacent store. No separate datastore in the in-CP case | Mandatory Postgres/MySQL; **cannot use D1**                                                                             | Auth0-hosted store; cannot use D1; D1 becomes mirror                                                     | Clerk-hosted store; cannot use D1; webhook-fed mirror                                                                                         | Kinde-hosted store; cannot use D1; webhook-fed mirror                                                                                    | WorkOS-hosted store; **but** you can keep D1 as source of truth, WorkOS = connection layer only                               |
| **Self-host / data-residency**            | **Best on (a) residency + (b) no-vendor-in-data-path** (MIT, runs in your infra, PII never transits a SaaS). **(a)-as-data-in-your-D1 is placement-conditional** (holds in-CP; MUST-VERIFY on orto/Vercel). VPC/on-prem = your infra             | **Reference answer for true self-host/VPC/air-gap** — but our data plane can't match that anyway (§0)                   | No self-host; Private Cloud (Auth0-managed, single-tenant, PrivateLink); broad regional residency        | **No self-host, no single-tenant, NO regional residency (US-only).** GDPR via DPF transfer, not in-region                                     | No self-host; 5 managed regions (AU/US/CA/EU/UK), **region permanent**                                                                   | Not OSS/self-hostable; US-centralized; **managed on-prem** (isolated env, sales motion); **EU GA region a gap `[UNCERTAIN]`** |
| **Pricing & SSO-tax**                     | **No SSO tax** (SAML/OIDC/SCIM in OSS at $0). Self-host ≈ $0 license. Managed: Pro $20/mo + $50/connection → ~$470/mo @ 10 orgs                                                                                                                  | No SSO tax (free OSS). Real cost = ops or managed host (~$30k/yr @ 10 orgs on Phase Two Enterprise)                     | No SSO tax; per-MAU + per-connection. **~$1,300/mo floor @ 10 SAML orgs** `[UNCERTAIN]`, climbs with MAU | No SSO tax; ~$1,150/mo @ 10 SAML orgs (Business + B2B add-on + ~10×$75) `[UNCERTAIN]`                                                         | **No SSO tax** (unlimited SSO on $75 Plus). SCIM+full SOC2 needs Scale $250. MAU figures `[UNCERTAIN — scrape artifact]`                 | No SSO tax; per-connection. **~$2.5k–3.5k/mo @ 10 SSO+SCIM orgs** `[UNCERTAIN — verify]`                                      |
| **SOC2 / audit**                          | **No vendor SOC2 to point at — you own the boundary.** Managed cloud's own posture `[UNCERTAIN]`. Audit logs in managed tier                                                                                                                     | OSS = no cert (attaches to operator); managed hosts carry SOC2/ISO. Built-in login/admin events → SIEM                  | SOC1/2/3, ISO 27001/17/18, HIPAA, PCI, FedRAMP; log streaming                                            | SOC2 Type II, HIPAA (BAA Enterprise-only), GDPR/DPF; Application Logs                                                                         | SOC2 Type II + ISO 27001; **full SOC2 report gated to Scale/Enterprise**; newer/smaller vendor                                           | SOC2 Type II, GDPR/CCPA, HIPAA-BAA; ISO 27001 **not confirmed on primary `[UNCERTAIN]`**; Audit Logs first-class (add-on)     |
| **Lock-in**                               | **Lowest.** MIT lib writing to YOUR tables; exit = stop importing                                                                                                                                                                                | **Lowest-tier** too; open standards + portable realm export; lock-in is operational                                     | Moderate-high; identity in Auth0; re-home users + re-do connections                                      | Medium-high; proprietary session/UI; re-home identity                                                                                         | Moderate; OIDC portable but config in Kinde                                                                                              | Medium; bounded — keep D1 as source of truth → low; standard SAML/OIDC/SCIM portable                                          |

---

## 3. The architectural fork that actually matters — and why it does NOT eliminate providers

The prompt frames the edge constraint as "this constrains which providers are even viable on
Workers." **The _verifier_ premise is dissolved; the _auth-server placement_ premise is not** — and
for Better Auth specifically, where the auth server runs is the pivot fork (§7.1).

- **The edge constraint bites the auth _server_, never the _verifier_.** `orto` runs on Vercel with
  a full Node runtime and already hosts the user-facing auth flow (NextAuth today). The
  control-plane's _only_ auth job is to **verify a signed token** — pure WebCrypto, edge-safe
  regardless of provider. The CP already does exactly this in `requireInternalAuth`
  (`router.ts:257`, verifying the internal HMAC token). **This seam is genuinely settled.**
- **Therefore the recommended verifier seam — a verified principal verified in the CP — works for
  all six providers.** Swapping providers is a change confined to the auth server plus the
  claim-minting step; the CP's verifier and the D1 tenant model are unchanged. This is the design
  the migration docs already converge on (§4.3).
- **But "where Better Auth's auth _server_ runs" is unsettled and load-bearing.** For Better Auth
  specifically, orto/Vercel-Node vs in-CP/Workers drives (a) the Phase-0 spike target, (b) whether
  the documented edge-SSO crypto risk (issues #6635/#6665/#6613, Worker `createRequire`) applies _at
  all_, and (c) whether the data-in-your-D1 residency claim is even achievable (orto has no D1
  binding). **This is the pivot, not bonus optionality** — see §7.1.

**How identity reaches the gateway claim and the tenant boundary** (the load-bearing flow, §4.3):

1. The auth server (orto on Vercel, or in-CP for Better Auth) authenticates the user via the chosen
   IdP (any of the six).
2. It resolves `user → (tenant_id, role)` from `tenant_memberships` and **signs it into the
   CP-facing token** by extending the existing `generateInternalToken`/`verifyInternalToken`
   (`shared/auth.ts`, HMAC-SHA256) to carry `sub=userId`, `tenant_id`, `role` — reusing the
   service-token machinery, not a new surface. This turns today's principal-blind shared secret into
   a **verified per-user principal**.
3. The CP **verifies and enforces** server-side: reject unscoped list/delete; force
   `WHERE user_id=<sub> AND tenant_id=<tenant>` for members; scope to `tenant_id` for admins; assert
   ownership on `DELETE`. This closes the absent-authorization gap (`GET/DELETE /sessions` currently
   apply no ownership check). **The boundary must live in the CP, not only in `orto`** — the v2
   design explicitly _rejects_ "resolver stays only in orto" because any direct CP call would bypass
   it (§4.3).
4. The **gateway/sandbox JWT** (`mintJwt`, `jwt.ts:16`) is the _proposed_ place to add the
   `tenant_id`/`user_id` claim (pending the gateway decision, §4.4); the gateway resolves the
   upstream LLM credential **per-tenant server-side** keyed on that claim, never trusting the
   sandbox.

**The ONE place the edge constraint still bites:** running auth _inside the control-plane_ with **no
orto dependency** is possible only for Better Auth (via `better-auth-cloudflare` on D1 — documented,
native D1 Kysely/Drizzle + KV). Every other provider's auth server is Node/TCP-DB/hosted and must
live in `orto`. **For Better Auth this is not free optionality — it is the placement fork**:
choosing in-CP _buys_ data-in-your-D1 residency but _costs_ the edge-SSO crypto risk; choosing orto
_moots_ the edge risk but _loses_ the data-in-your-D1 claim (§7.1).

---

## 4. Honest category trade-offs

**Own-it OSS — Better Auth.** _For:_ fits Workers+D1 (native D1; can even run in the CP), ships the
org/membership/RBAC model = your v2 tenant layer for free, no SSO tax, clears **(b)
no-vendor-in-path** in every placement and **(a) data-in-your-D1 in the in-CP placement**, lowest
lock-in (MIT, your tables). _Against:_ **you operate it** (SAML cert handling, key rotation,
patching); **no vendor SOC2 to point at** — you own the audited boundary; **the SSO/SCIM plugin
maturity on the _edge_ is unproven** — documented history of breaking on Workers via Node
`createRequire` (issues #6635/#6665/#6613); SAML XML-signature crypto is the riskiest part.
**Crucially, this edge risk is a Worker-only failure mode — it applies to the in-CP/Workers
placement and is MOOT under the orto/Vercel-Node placement (Node runtime).** Enterprise SAML/SCIM
hardening is recent (v1.5, Feb 2026).

**Self-host server — Keycloak.** _For:_ max control + true VPC/on-prem/air-gap + per-customer
isolation; lowest lock-in tier (portable realm export); ~13yr mature, Red Hat/CNCF, no abandonment
risk. _Against:_ **not edge** — JVM + mandatory Postgres, a whole new stateful ops tier (HA +
Infinispan + patching + on-call) or ~$30k/yr to a managed host; **SCIM is a real gap** (OSS plugin
EOL, commercial-or-build-it); B2B/Orgs younger/glue-heavy; Next.js community-only. **And the kicker:
our data plane is SaaS-on-CF, so we can't deliver the in-your-VPC story Keycloak exists to enable**
— making its signature advantage mostly moot for _this_ product.

**Full SaaS — Auth0 / Clerk / Kinde.** _For:_ best DX, fully managed, vendor SOC2/compliance you
hand the buyer, mature Organizations models. _Against:_ **lock-in** (they own the identity store; D1
becomes a webhook-fed mirror); **vendor-in-the-identity-data-path** (fails **(b)** for the strictest
buyers); SSO-tax is mostly absent but **per-connection + per-MAU cost creep** is real ($1.1k–1.3k/mo
floors @ 10 orgs). Provider-specific blockers: **Clerk = US-only, no residency `[DOC]` →
disqualified for any residency-strict buyer**; **Kinde = SCIM pre-GA `[UNCERTAIN]` → disqualified if
SCIM is contractual now**; Auth0 = no true customer-self-host (Private Cloud only).

**SSO-addon — WorkOS.** _For:_ the canonical, lowest-effort way to bolt enterprise SSO/SCIM/audit
onto your _own_ base auth; **Admin Portal** (customer self-serves their IdP) is a genuine sales
accelerant; Organizations map ~1:1 to tenants; **you keep D1 as source of truth → lock-in stays
low**; core SDK is edge-safe (or hit the REST API from a Worker). **This is exactly Factory's
choice.** _Against:_ not OSS/self-hostable (managed on-prem is a sales motion, not a self-deploy
artifact); **EU/regional GA residency is a current gap `[UNCERTAIN]`**; per-connection cost adds up
(~$2.5k+/mo @ 10 SSO+SCIM orgs); **auth metadata still transits WorkOS → fails (b) the
no-third-party bar.** This is the bar the primary was chosen to clear, so **WorkOS is a fallback
only for residency-relaxed buyers** (§5, §7.4).

---

## 5. Recommendation

### Primary: **Better Auth** as base auth + org/membership/RBAC — with **placement as the pivot fork** and a placement-conditional spike

Adopt Better Auth as the **base auth + organization/membership/RBAC layer**. It uniquely satisfies
the constraints that actually bind this product — but **resolve the runtime-placement fork (§7.1)
first**, because it determines the spike target and which residency property you can sell:

- **(a) Edge/Workers constraint:** it's the _only_ option that can run in the CP (via
  `better-auth-cloudflare`), and it equally supports the `orto`-hosts-auth seam. Either way the CP
  just verifies a signed claim (settled seam, §3).
- **(b) Self-host/residency — split the two properties:**
  - **No-vendor-in-path (b)** is cleared in **both** placements — identity never transits a third
    party. This is the durable advantage.
  - **Data-in-your-own-D1 (a)** holds **only in the in-CP/Workers placement** (D1 binding). On the
    orto/Vercel placement, this needs the **D1 HTTP API `[UNCERTAIN — MUST-VERIFY]`** or it degrades
    to "data in a Vercel-adjacent store, region-pinned" — still a residency story, but not the
    data-in-your-D1 one. **Do not assert both; pick the model that delivers the residency property
    you are actually selling and state it (§0).**
- **(c) SSO tax:** none — SAML, OIDC, organizations, RBAC, and the SCIM server are all in the OSS
  package at $0. ~$0 self-hosted vs $2.5k+/mo (WorkOS) or $1.1–1.3k/mo (SaaS) at 10 orgs.
- **(d) Migration from GitHub OAuth:** the **base-auth cutover is moderate (1.5–3 wks) — and that
  figure is BASE-AUTH ONLY** (see the relabel below). Better Auth has its own GitHub social
  provider, so it replaces NextAuth like-for-like _and still yields the `repo` SCM token_ — keeping
  today's fused identity+SCM model intact _during cutover only_. **It does NOT "map cleanly" onto
  `users`/`user_identities` — that is a reconciliation fork (§7.5), not a freebie.** `mintJwt`
  (sandbox/terminal) and the internal HMAC token are untouched.
- **(e) v2 tenant/RBAC + gateway:** the `organization` plugin = `tenants` +
  `tenant_memberships(admin|member)` you were about to hand-roll; store `installation_id` as org
  metadata. It issues a JWT/JWKS the CP verifies via WebCrypto, threading the §4.3 claim seam
  directly.

**The gate (placement-conditional):** the primary path is contingent on a spike whose **target
depends on §7.1**:

- **orto/Vercel-Node placement → spike on Vercel Node:** stand up `@better-auth/sso` +
  `@better-auth/scim` under Node on Vercel; prove SAML XML-signature crypto and SCIM run cleanly
  **in the Node runtime you will actually ship on**. The Worker `createRequire` bugs do **not**
  apply here. (And separately verify the D1-write path if you want data-in-your-D1, per §0.)
- **in-CP/Workers placement → spike on Workers:** stand up the same on a Worker with
  `nodejs_compat` + your D1 binding; this is where the documented edge-crypto risk is real and must
  be cleared. **Own that risk explicitly.**

If the (placement-appropriate) spike fails, do **not** force it — fall back per the buyer's
residency posture below.

### Migration-estimate relabel (so no one anchors on 1.5–3 wks as "enterprise-ready")

- **Base-auth cutover ONLY: ~1.5–3 wks** — replacing the NextAuth GitHub provider like-for-like.
  **Excludes** everything below.
- **Full enterprise-ready arc (rough envelope, `[UNCERTAIN]`):** add the Phase-0 spike (~3–5 days) +
  SCM-credential decoupling (§7.2) + `users`/`user_identities` reconciliation (§7.5) + SSO/SCIM
  hardening + the **server-side RBAC enforcement move in the CP** + the **agent-action audit trail +
  SIEM export**. Realistically **multiples of the base figure** — budget on the order of **8–14+
  weeks** of focused work to first enterprise-ready deal, not 1.5–3.

### Credible alternative / fallback (do not present as equal) — **scoped by residency posture**

The spike fails, **or** the first enterprise-SSO customer lands before the Better Auth plugin path
hardens. The right fallback **depends on the buyer's residency requirement**:

- **Residency-RELAXED buyers (b can be compromised): Better Auth base + WorkOS for the enterprise
  SSO/SCIM leg.** The named hybrid. Keep Better Auth (or even today's GitHub OAuth initially) as
  base auth; **bolt WorkOS on only for enterprise tenants** that need SAML/SCIM, with D1 as source
  of truth and Directory Sync webhooks → `tenant_memberships`. This is **Factory's exact precedent**
  and de-risks the one unproven thing (edge SAML crypto) by moving it to a vendor whose core SDK is
  already edge-safe. **Valid only because the buyer relaxes (b)** — WorkOS transits identity
  metadata.
- **Residency-STRICT buyers (b is hard) + spike fails: run Better Auth's SSO/SCIM in `orto` on
  Vercel Node — NOT WorkOS.** This is the answer for the otherwise-unassigned quadrant. The Worker
  edge-crypto bugs that _defined_ the spike are a Worker-only failure mode; **Node sidesteps them**.
  You clear **(b) no-vendor-in-path** (the very bar WorkOS fails), accept **owning SAML
  cert/key-rotation/patching ops**, and carry the **data-in-your-D1 caveat (a)** (Vercel-adjacent
  store or D1 HTTP API MUST-VERIFY). WorkOS is disqualified here by the briefing's own logic; Clerk
  (US-only) and Auth0/Kinde (vendor-in-path) too; Keycloak is moot on SaaS-on-CF. **This quadrant
  has an answer — it is not empty.**

### The WorkOS-primary counter-case — named, then why it loses

A reasonable person argues WorkOS should be _primary_: it's proven now, it's Factory's precedent,
and it de-risks the unproven edge-SSO path entirely. **It loses on three of our binding
constraints:** (1) **residency / no-vendor-in-path (b)** — WorkOS keeps identity metadata in its
(US-centralized, EU-GA-gap `[UNCERTAIN]`) cloud, failing the bar some target buyers will set; (2)
**recurring cost** — ~$2.5k+/mo @ 10 orgs vs ~$0 self-hosted, structurally, forever; (3) **it
doesn't give you the tenant/membership/RBAC model** — you still build or buy that separately,
whereas Better Auth ships it. WorkOS is the _right hedge for residency-relaxed deals_, not the
_right default_ — hence scoped fallback, not primary.

**One discriminator that can override this near-term — your own SOC 2 timing:** self-hosted Better
Auth puts the **entire identity system in YOUR SOC 2 scope with no vendor attestation to lean on**;
WorkOS/SaaS **hand the buyer a vendor SOC 2 report on day one**. **If your own SOC 2 Type II is NOT
in hand before the first enterprise deal**, the WorkOS hybrid's vendor attestation is a concrete
near-term advantage **independent of the spike outcome** — a real go-to-market reason to bias toward
the hybrid on the _first_ deal even when the spike would have passed (§7.6).

**Net:** primary = Better Auth (placement-fork-resolved, spike-gated); fallback = **scoped** —
WorkOS hybrid for residency-relaxed, Better-Auth-SSO-in-orto for residency-strict. The spike and the
placement fork are the tie-breakers, not a vibe.

---

## 6. Phased adoption plan (mapped to the v2 irreversibility seams, §4.5)

**Phase 0 — RESOLVE PLACEMENT, THEN THE SPIKE (before committing anything).** First resolve §7.1
(orto/Vercel-Node vs in-CP/Workers). Then run the **placement-appropriate** spike:
`@better-auth/sso` + `@better-auth/scim`, exercising a real SAML round-trip (signed AuthnRequest +
XML-sig verify) and a SCIM provision/deprovision — **on Vercel Node** (orto placement; Worker
`createRequire` bugs N/A) **or on a Worker with `nodejs_compat` + your D1** (in-CP placement;
edge-crypto risk real). **Outcome decides primary vs fallback.** Do not bury this. (~3–5 days.)

**Phase 1 — MT-enablement (everything here is reversible per §4.5).**

- Add `tenants` + `tenant_memberships(role)` tables, identity-anchored; `sessions.tenant_id`
  **nullable, unwritten** (no-op add). Do **not** commit `installation_id` into a DO-name prefix
  (the one-way door, deferred per D3); `installation_id` stays the _recommended future key_ as
  nullable D1.
- Stand up **Better Auth base auth** (in `orto`, or in-CP per the resolved placement); wire its
  tables alongside `users`/`user_identities` **per the reconciliation model chosen in §7.5**
  (recommended: UserStore stays canonical, Better Auth is a session/credential layer). Retire the
  boolean allowlist → org membership + role.
- **Extend `generateInternalToken`/`verifyInternalToken`** to carry `sub`/`tenant_id`/`role` (the
  §4.3 claim). Move the authorization check **server-side in the CP** (reject unscoped list/delete;
  scope members to own + tenant; admins to tenant; assert ownership on DELETE). This is the single
  highest-value security fix and is independent of the SSO/SCIM outcome.
- **SCM-decoupling decision (§7.2):** decide **now** whether to decouple the git-push credential off
  the per-user `repo` token onto the **GitHub App installation token** in Phase 1 (early) or defer
  to Phase 2 (at-first-deal). Early-decoupling de-risks the first enterprise deal but touches the
  session-create contract (`SessionInitInput`, the `scm*`/`scmToken`/`scmRefreshToken` body fields
  forwarded from `sessions/route.ts`) before you strictly must.
- Keep `mintJwt` (sandbox/terminal) and the internal HMAC machinery **as-is**.

**Phase 2 — First enterprise SSO/SCIM customer lands.**

- **If spike passed:** enable `@better-auth/sso` per-org connection (SAML/OIDC linked to the org) +
  `@better-auth/scim` → write directory events into `tenant_memberships`. Domain verification as the
  tenancy anchor.
- **If spike failed — branch on residency posture (§5):**
  - _Residency-relaxed:_ integrate **WorkOS** for the enterprise SSO/SCIM leg only; map
    `organization_id` ↔ D1 tenant row; Directory Sync webhooks (Worker handler) →
    `tenant_memberships`; expose the Admin Portal. D1 stays source of truth.
  - _Residency-strict:_ run **Better Auth SSO/SCIM in `orto` on Vercel Node** (Node sidesteps the
    Worker edge bugs); accept owning SAML ops; carry the data-in-your-D1 caveat (§0).
- **Either way — decouple SCM auth if not already done in Phase 1:** migrate `git push` credentials
  onto the **GitHub App installation token** (`github-app.ts`, per-install = per-tenant; §4.4).
  **REQUIRED for any enterprise-SSO path** — enterprise IdP users log in via their own Okta/Entra
  (no GitHub OAuth → no personal `repo` token), so without decoupling, `git push` breaks for exactly
  the buyers the strategy targets. **This is independent of provider choice** (every
  non-GitHub-OAuth identity path needs it) and changes the `SessionInitInput`/`scm*` contract — fold
  its effort into the migration estimate (§5), do not treat it as free.
- Land org-scoped RBAC enforcement on every tenant operation; ship the **agent-action audit trail +
  SIEM export** on the DO event store.

**Phase 3 — Hardening (the deferred one-way doors, §4.5).** Only when secret count is known-small
and MT is proven: `global_secrets` PK rebuild (`PRIMARY KEY (tenant_id, key)`), per-tenant
encryption (data-key/salted scope), and — if/when committed — `installation_id` into the DO-name
prefix. All downstream of the credential-ownership decision (D11).

---

## 7. Decision points for the human

Each is a real fork — recommended default + the discriminator + what to verify.

1. **Better Auth runtime placement — orto/Vercel-Node vs in-CP/Workers (THE PIVOT — resolve
   first).** This is _not_ settled; it determines the spike target, whether the edge-SSO crypto risk
   applies at all, and whether the data-in-your-D1 residency claim is achievable. **Default:
   orto/Vercel-Node** (lower friction, edge-crypto risk MOOT, base auth already lives in orto).
   **Choose in-CP/Workers only if a buyer hard-requires data-in-your-own-D1 residency (strict
   (a)-as-D1)** — that placement buys the D1 binding but reintroduces the edge-SSO crypto risk you
   must then clear. _Discriminator:_ does any near-term buyer contractually require identity data
   **in your own D1** (not merely region-pinned, not merely no-vendor-in-path)? Yes →
   in-CP/Workers + own the edge risk; No → orto/Vercel-Node + spike is moot for edge-crypto.
   _Verify:_ on orto/Vercel, **Better-Auth-on-Vercel writing to Cloudflare D1 via the D1 HTTP API
   `[UNCERTAIN — MUST-VERIFY]`**; otherwise identity lands in a Vercel-adjacent store and the
   residency story is region-of-store, not data-in-your-D1.

2. **Provider choice.** **Default: Better Auth (placement per #1), spike-gated; fallback scoped by
   residency (WorkOS hybrid for residency-relaxed, Better-Auth-SSO-in-orto for residency-strict).**
   _Discriminator:_ does the placement-appropriate Phase-0 spike pass, AND does any near-term buyer
   hard-require no-third-party-touches-identity (strict (b))? Spike-pass → Better Auth. Spike-fail +
   relaxed (b) → WorkOS hybrid. Spike-fail + strict (b) → Better Auth SSO/SCIM in orto/Vercel-Node.
   _Verify:_ the spike (below).

3. **Build-vs-buy enterprise SSO.** **Default: build on Better Auth's OSS SSO/SCIM IF the spike
   passes; otherwise buy from WorkOS only for residency-relaxed buyers, else self-host SSO in
   orto/Vercel-Node.** _Discriminator:_ edge SAML-crypto reliability (placement-dependent) + your
   appetite to own SAML cert/key-rotation/patching ops. _Verify:_ the spike; and whether you can
   staff the ongoing SAML/SCIM ops burden.

4. **Self-host story / residency definition under the deployment model.** **Default: tell the
   residency story (region-pinned, no-vendor-in-path), and be precise about whether it is "data in
   your own D1" (requires in-CP/Workers placement, #1) or "data in a region-pinned Vercel-adjacent
   store" (orto placement).** Do NOT tell a deploy-in-your-VPC story. _Discriminator:_ does a target
   buyer hard-require the IdP/app to run inside _their_ infra (whole-product problem, escalate
   beyond auth; Keycloak only enters if you also re-architect the data plane) — and separately, does
   the buyer require **data-in-your-own-D1** vs merely **region residency**? These are different
   bars with different placements. _Verify:_ whether any named near-term buyer
   (Factory/Varick-class) contractually demands in-their-VPC vs data-in-your-D1 vs region-residency
   — only the latter two are achievable here, and they fork the placement.

5. **SCM-credential decoupling timing.** Today's per-user GitHub OAuth token carries scope
   `read:user user:email repo` (`apps/orto/src/lib/auth.ts:56`) — it is BOTH identity AND the
   git-push credential. Enterprise IdP users carry no personal `repo` token, so decoupling the SCM
   credential onto the **GitHub App installation token** (per-install = per-tenant) is **REQUIRED
   for any enterprise-SSO path** and is **independent of provider choice**. **Default: decide
   consciously; recommend EARLY (Phase 1)** if any enterprise deal is on the horizon, since it
   de-risks the first deal and is the more invasive change. **Fork: decouple EARLY (Phase 1) vs
   AT-FIRST-ENTERPRISE-DEAL (Phase 2).** _Discriminator:_ is an enterprise deal imminent, and can
   you afford the contract churn now vs later? _Verify:_ the contract change to `SessionInitInput` +
   the `scm*`/`scmToken`/`scmRefreshToken` body fields (`sessions/route.ts`); fold the effort into
   the migration envelope.

6. **`users`/`user_identities` (migration 0019) reconciliation model.** Better Auth does **not**
   "map cleanly" — this is a genuine schema-reconciliation fork. **(a) Keep `UserStore` canonical +
   Better Auth as a session/credential layer (RECOMMENDED — lower risk):** preserves today's
   email-based cross-provider linking (`UserStore.resolveOrCreateUser`, the `resolveOrCreateUser`
   endpoint under provider-identities) and treats Better Auth's user+account tables as the
   session/credential plane; least disruption to existing identity resolution. **(b) Migrate
   `UserStore` onto Better Auth's account model:** unifies on Better Auth's account-linking
   semantics but forces a full re-home of cross-provider linking. _Discriminator:_ tolerance for
   re-homing identity resolution vs running two user tables in coordination. _Verify:_ reconcile
   email-based linking against Better Auth's account-linking semantics; fold the reconciliation work
   into the migration estimate (it is part of why 1.5–3 wks is base-auth-only).

7. **Own-SOC2-timing vs first-enterprise-deal.** **Default: if your own SOC 2 Type II is in hand
   before the first enterprise deal, the self-host primary stands; if NOT, bias toward the WorkOS
   hybrid for the first deal (residency-relaxed buyers) regardless of spike outcome.** Self-hosted
   Better Auth puts the whole identity system in YOUR SOC 2 scope with **no vendor attestation to
   lean on**; WorkOS/SaaS hand the buyer a vendor SOC 2 report on day one. _Discriminator:_ **is our
   own SOC 2 Type II in hand before the first enterprise deal?** No → the vendor attestation is a
   concrete near-term GTM advantage for the WorkOS hybrid on the FIRST deal, independent of the
   spike. _Verify:_ your SOC 2 Type II timeline against the expected first-enterprise-deal date.

---

## Must-verify-before-committing (pricing, placement & Workers-compat claims)

- **PLACEMENT FORK (resolve first, §7.1):** orto/Vercel-Node vs in-CP/Workers for Better Auth's
  SSO/SCIM. Determines the spike target and the residency property you can sell.
  `[UNCERTAIN — decision]`
- **Better-Auth-on-Vercel writing to Cloudflare D1 via the D1 HTTP API** — required if you want the
  data-in-your-own-D1 residency story on the orto placement; the dossier never establishes this
  adapter path. **`[UNCERTAIN — MUST-VERIFY]`** Without it, orto-placed identity lands in a
  Vercel-adjacent store (region residency, not data-in-your-D1).
- **THE SPIKE — go/no-go for the primary path (placement-conditional):** `@better-auth/sso` +
  `@better-auth/scim`, including SAML XML-signature crypto and SCIM provision/deprovision — **on
  Vercel Node** (orto placement; Worker `createRequire` bugs N/A) **or on a Worker with
  `nodejs_compat` + your D1** (in-CP placement; edge-crypto risk real, issues #6635/#6665/#6613).
  v1.5 claims fixes but historical Worker breakage is real. `[UNCERTAIN — empirical]`
- **WorkOS current EU/regional GA residency status** and the **~$2.5k/mo @ 10-org** SSO+SCIM figure
  (per-connection $125 down to $50 with volume; audit logs are separate add-ons).
  `[UNCERTAIN — confirm with WorkOS]`
- **Better Auth managed-cloud's own SOC2/ISO posture** — not stated on pages reviewed. **Moot if you
  self-host and own the audited boundary** (the recommended path), but see §7.7 for the SOC 2
  _timing_ discriminator. `[UNCERTAIN]`
- **Kinde:** the "10,500 MAU on every tier" pricing table is almost certainly a **scrape artifact**
  — confirm real per-tier MAU before any cost model; and **SCIM is pre-GA** (no GA date) →
  disqualifying if a buyer mandates SCIM at signing. `[UNCERTAIN]`
- **Auth0 / Clerk per-connection pricing floors** (~$1,300/mo and ~$1,150/mo @ 10 SAML orgs
  respectively) — both climb with MAU; re-confirm against current pricing pages before modeling.
  `[UNCERTAIN]`
- **Clerk has NO regional data residency (US-only) — this is `[DOC]`, i.e. settled.** Treat as
  disqualifying for any residency-strict buyer; don't re-litigate.
- **WorkOS ISO 27001** not confirmed on the primary security page (SOC2 Type II / GDPR / CCPA /
  HIPAA-BAA confirmed). `[UNCERTAIN — check Trust Center]`
