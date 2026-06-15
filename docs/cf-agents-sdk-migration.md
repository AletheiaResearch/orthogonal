# Proposal: Migrating the custom session/sync/API layer to the Cloudflare Agents SDK

**Status:** Research + proposal for discussion. Not approved. Ends in open decision points (§9).

**Scope:** Core control-plane only — the per-session Durable Object, its WebSocket/sync layer, and
the Modal bridge. The `slack-bot`/`github-bot`/`linear-bot` integrations are **explicitly out of
scope**.

**Hard constraints (respected throughout):** stay on Modal for compute; keep OpenCode running inside
the Modal sandbox; design so multi-tenancy is a later config flip while staying single-tenant now;
CORE only (no bots); incremental, never big-bang.

**Citation convention:** Claims are tagged **FACT** (verified in the repo, with `file:line`) or
**ASSUMPTION** (inference, with confidence). Single-source SDK signatures are flagged inline. Any
code is an **illustrative sketch**, clearly labeled, not a final API. SDK facts were gathered from
`developers.cloudflare.com/agents/` + `llms.txt`; the Ramp precedent from
`builders.ramp.com/post/why-we-built-our-background-agent`.

---

## 0. Read this first — should we do this at all?

This is the honest framing, because the research turned up a real "do nothing" case that the rest of
the document must be read against.

**What the SDK actually absorbs** (from the §5 mapping table): DO addressing, the SQLite
_primitive_, client-WS accept + hibernation + auto ping/pong, client-identity recovery across
eviction, alarm scheduling, and client-facing state broadcast for status/title.

**What stays bespoke regardless** (also from §5): the **sandbox bridge socket** (leg B — the
load-bearing piece, see §4), the event log + replay, the prompt queue, Modal lifecycle, SCM/secret
brokering, child lineage, the `SessionRepository` schema + 31 migrations, and the **D1 global-index
write-through**.

The uncomfortable observation: **our `SessionDO` already implements the plumbing the SDK would
absorb, using the same underlying primitives the SDK uses** — Hibernation API, `setAlarm`,
`ctx.storage.sql`, hibernation tags (`durable-object.ts:926-996`, FACT). So the SDK does not unlock
a capability we lack; it replaces _hand-written code_ with _framework code_ for the easy half, while
every hard/risky part stays ours. And it introduces a genuine new risk (§4.3, the second-peer
problem) plus a maturity risk (pre-1.0, ~weekly breaking minors).

That makes "is the migration worth it?" **Decision 0 (§9)** — a real fork with a credible "no / not
yet" branch, not a foregone conclusion. The rest of this doc is "_if_ we proceed, here is the
least-bad way." It is deliberately written so the plumbing-only wins are isolated in early, cheap,
reversible phases — so we can stop after Phase 1a having learned the decisive facts at low cost.

---

## 1. Executive summary

**What we'd change.** Introduce a `SessionAgent` class extending the Cloudflare Agents SDK `Agent`
base class (which is itself a Durable Object: `DurableObject → Server (partyserver) → Agent`,
**FACT**). It absorbs the framework-shaped plumbing `SessionDO` reimplements today for the
**client** leg: per-session SQLite bootstrap (`this.sql`), client-WS accept/hibernation,
client-identity recovery across eviction (`connection.setState` replacing the bespoke
`ws_client_mapping` table), client state broadcast (`setState`/`onStateChanged`), and alarm
scheduling (`this.schedule` replacing raw `setAlarm`). The web client moves from a hand-rolled
token-handshake WebSocket to the SDK client (`useAgent`/`AgentClient`).

**What we'd keep — including the part the SDK can't help with.** Everything domain-shaped rides _on
top of_ the SDK primitives, and crucially the **Modal bridge leg (leg B) stays a hand-rolled
WebSocket upgrade living inside the Agent** — not the SDK's `onConnect` path (see §4.3, this is the
corrected core of the design). Also bespoke: `SandboxLifecycleManager`, the `SessionMessageQueue`,
the `SessionRepository` schema with its 31-step `MIGRATIONS` ledger, SCM/secret/token brokering,
child-session lineage, and the **D1 global-index write-through** (`session-index.ts`). **Modal and
`sandbox-runtime` are untouched** — CP→Modal is stateless HTTP (`client.ts:246`) and the sandbox→CP
WebSocket contract (`SandboxEvent`/`SandboxCommand`, with the `ackId` protocol) is preserved
byte-for-byte.

**The one big risk (revised, with teeth).** The SDK owns the **single DO-level `webSocketMessage`
handler**. Our sandbox socket (leg B) is a _second, non-client peer_. Even though we hand-roll its
accept + pre-accept auth, once accepted via `this.ctx.acceptWebSocket` its frames flow through the
SDK's `webSocketMessage → onMessage`, and **it may appear in `getConnections()` / be a target of
`setState`'s auto-broadcast.** The SDK models exactly one connection class (UI clients). The
migration's correctness hinges on cleanly excluding the sandbox from all client-facing fan-out — and
**whether the SDK lets us do that is the single most important thing to verify (§4.3, Phase 1a).**
If it can't, leg A gets no clean SDK abstraction either and the SDK's value collapses to "nicer
`this.sql`/`this.schedule`."

**A motivation caveat.** The SDK's headline "cheap idle via hibernation" is **largely neutralized
for active sessions**: the bridge sends an app-level heartbeat every 30s (`bridge.py:391-404`),
which is inside the ~70–140s idle-eviction window, so the Agent stays **resident and billable for
the whole duration of an active session** (up to the 2h sandbox timeout). Hibernation savings apply
only to _detached_ gaps (pre-spawn, post-stop). DO-vs-Agent billing parity is **UNVERIFIED** (we did
not fetch concrete GB-s/request rates). If cost is part of the motivation, price it before
committing (§8, §9-D0).

---

## 2. Current architecture of the sync/API layer

The hub is **one Durable Object per session**, `SessionDO` (`durable-object.ts:116`), extending
`DurableObject<Env>`, exported at `index.ts:14`. It is addressed everywhere by
`env.SESSION.idFromName(sessionId)` (FACT: `index.ts:72`, `runtime-client.ts:26`,
`durable-object.ts:1593`, `scheduler/durable-object.ts:615`).

**Two WebSocket legs, both INBOUND to the DO (the DO is the server on both).** There is no third
"CP→Modal WebSocket" leg (**FACT**):

```
   Browser ──dials──▶   ┌─────────────────────────────┐   ◀──dials── Modal sandbox
   (client WS, leg A)   │   SessionDO (the hub)        │             (bridge.py, leg B)
                        │   id = idFromName(sessionId) │
                        └─────────────────────────────┘
   client = caller, DO = server          sandbox = caller, DO = server
```

- **Leg A — Browser → DO.** Initiated by `apps/orto/src/hooks/use-session-socket.ts:577`. After
  upgrade (`index.ts:55`), the DO classifies the socket as a client (`type !== "sandbox"`), mints a
  `wsId`, and accepts via the Hibernation API (`acceptClientSocket`, `durable-object.ts:909-910`).
  Auth is a **post-open `subscribe` message** carrying a hashed bearer token minted by the DO
  (`ws-token.handler.ts:32`, validated in `handleSubscribe`, `durable-object.ts:1100`). A
  pre-subscribe timeout (`WS_AUTH_TIMEOUT_MS = 30s`, `durable-object.ts:104`) closes with `4008` if
  no subscribe arrives.
- **Leg B — Modal sandbox → DO.** Initiated _by the sandbox_: `bridge.py:338`
  `websockets.connect(...)` to `wss://<cp>/sessions/{id}/ws?type=sandbox` (`bridge.py:211-214`).
  **Auth is at the HTTP upgrade, before accept**, validated against **per-session DO SQLite** with
  `410 Gone` (stopped/stale), `403` (sandbox-id mismatch), `401` (token mismatch) —
  `handleWebSocketUpgrade` calls `this.getSandbox()` (which runs `SELECT * FROM sandbox LIMIT 1` on
  `this.sql`, `repository.ts:348`) and `isValidSandboxToken` (`durable-object.ts:818-868, 1786`).
  The bridge treats `401/403/404/410` as **fatal/non-retryable** (`bridge.py:317-323`) — it relies
  on pre-accept rejection.

**The only outbound CP→Modal call is one-shot HTTP** — `await fetch(...)` POST to
spawn/warm/snapshot/restore (`sandbox/client.ts:246`). After the HTTP spawn the sandbox boots and
dials leg B back in.

**Responsibilities of the DO** (delegated to lazily-initialized services): session status machine
(`transitionSessionStatus`, `:1502`); dual-peer WS hub; event log + replay (last 500 on subscribe,
`getReplayData`, `:1216`); prompt queue + execution-timeout (`SessionMessageQueue`); Modal sandbox
lifecycle (`SandboxLifecycleManager`, spawn/warm/snapshot/circuit-breaker, `:555-716`); presence;
SCM/secret/token brokering (`getUserEnvVars` `:1737`, `isValidSandboxToken` `:1786`); child-session
lineage (`notifyParentOfChildUpdate`, `:1585`); and fire-and-forget D1 index sync
(`syncSessionIndexStatus/Metrics/Title`, `:1439-1500`).

**Storage.** Per-session embedded SQLite via `ctx.storage.sql` with tables `session`,
`participants`, `messages`, `events`, `artifacts`, `sandbox`, `ws_client_mapping` and
`_schema_migrations`; schema + 31 migrations in `session/schema.ts`, accessed through
`SessionRepository`. One alarm slot via `ctx.storage.setAlarm/getAlarm` (`:320-323`), single
`alarm()` handler delegating to `alarmHandler.handle()` (`:1006`).

**Critical `id` vs `session_name` duality (FACT).** The `idFromName` argument is the **external
session id (= `session_name`)**, never the DO's opaque `id`. Inside the DO,
`session.id = ctx.id.toString()` (`getDurableObjectId`, `:430`), while `session_name` stores the
routing key. `getPublicSessionId()` returns `session_name ?? id ?? ctx.id.toString()`
(`:1434-1437`). **The only thing any naming change may alter is the `idFromName` _input string_ (the
routing key); `session_name` must keep storing the external `sessionId`, and no code may rely on
`ctx.id.toString()` equalling the routing key.** `getDurableObjectId` (`:430`, consumed by
`upsertSession`) is the place to audit when the routing key changes.

The DO **already** uses the Hibernation API (`webSocketMessage`/`Close`/`Error`, `:926-996`),
hibernation tags for identity recovery, `setWebSocketAutoResponse` for ping/pong, and `setAlarm`.
That is exactly how an SDK Agent works internally — so for leg A this is **API translation, not a
paradigm shift**.

---

## 3. What the Cloudflare Agents SDK gives us

Capability map (all **FACT** unless flagged; single-source signatures flagged). Package is `agents`
(`npm i agents`); class imported `import { Agent } from "agents"`.

| Capability               | SDK surface                                                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agent base class**     | `class SessionAgent extends Agent<Env, State>`                                                        | Layering `DurableObject → Server(partyserver) → Agent`. Each instance **is** a DO with isolated SQLite, alarms, connections. Hooks: `onStart()` (every startup incl. wake), `onRequest(request)`, `onConnect`, `onMessage`, `onClose`, `onError`.                                                                                                                                    |
| **State + auto-sync**    | `this.state`, `this.setState(next)`, `onStateChanged(state, source)`, `initialState`                  | `setState` atomically persists to SQLite **and broadcasts to all connected clients** **and** fires `onStateChanged`. `source` is `"server"` or a `Connection` (guard `if (source !== "server")`). **No documented per-connection exclusion on `setState`** (unlike `this.broadcast(msg, exclude?)`) — see §4.3. Client callback is `onStateUpdate`; server hook is `onStateChanged`. |
| **Embedded SQL**         | `this.sql\`SELECT ...\``                                                                              | Tagged template over the same per-instance SQLite the DO uses today. State blob lives in reserved table `cf_agents_state`.                                                                                                                                                                                                                                                           |
| **WS + hibernation**     | `onConnect(conn, ctx)`, `onMessage(conn, msg)`, `onClose`, `onError`, `this.broadcast(msg, exclude?)` | Hibernation **on by default**; client sockets auto-accepted server-side. State/SQLite/connection-state persist across hibernation; **in-memory vars/timers/promises do not.** `connection.setState`/`serializeAttachment` persist per-connection metadata across eviction (survival of the _read path_ after eviction is **MUST-VERIFY**, §4.3).                                     |
| **Scheduling**           | `await this.schedule(when, "methodName", payload?)`                                                   | Modes: delay in **seconds**, `Date`, or cron. Backed by DO alarms in reserved `cf_agents_schedules`. `getScheduleById`/`listSchedules`/`cancelSchedule` (single-source). At-least-once, retry on throw, survive hibernation, wake an evicted DO.                                                                                                                                     |
| **Naming / namespacing** | `getAgentByName(env.NS, name)` → `DurableObjectStub`; `routeAgentRequest(req, env)`                   | Both wrap `idFromName(name)` — **same mechanism we use today**. URL convention `/agents/{kebab-class}/{instance}`. `routeAgentRequest` returns `undefined` on no match, so custom routes fall through.                                                                                                                                                                               |
| **Client SDK**           | `useAgent` (`agents/react`), `AgentClient` (`agents/client`), `agentFetch`                            | Bidirectional state sync, RPC, **auto-reconnection with exponential backoff**, async `query: () => ({ token })` auth that refreshes on disconnect.                                                                                                                                                                                                                                   |
| **Server-side RPC**      | `getAgentByName(env.NS, name).method(...)`                                                            | Direct DO RPC, no decorator needed (docs note it skips WS serialization). `@callable` (+`agents/vite`) only for typed client→agent RPC.                                                                                                                                                                                                                                              |

**What it explicitly does NOT give us (FACT):**

1. No first-class **second, non-client peer**. `onConnect`/`onMessage`/`broadcast`/`setState` all
   assume the counterpart is a UI client, and there is one DO-level `webSocketMessage` handler that
   the SDK owns.
2. No **agent-initiated outbound persistent WebSocket** ("Outgoing WebSockets do not hibernate", DO
   docs). The documented pattern for long external work is webhook-callback or polling — **not** a
   persistent outbound socket.

(2) is **moot** for us (§4.1 — we never hold an outbound socket). (1) is the **load-bearing
residual** (§4.3).

---

## 4. THE LOAD-BEARING QUESTION: the Modal ↔ Agents bridge

### 4.1 How our CP↔Modal leg works today (FACT, repo-verified)

Two independent channels in opposite directions:

- **CP → Modal: stateless HTTP.** Every op is a single `await fetch(...)` POST to a FastAPI endpoint
  on `*.modal.run` (`ModalClient`, `client.ts:198-270`; spawn `:246`), HMAC-bearer authed. **The
  control plane never holds a connection to Modal.**
- **Modal → CP: persistent inbound WebSocket, dialed by the sandbox.** `bridge.py:338` →
  `wss://<cp>/ sessions/{id}/ws?type=sandbox`. **The DO is the WS server; the sandbox is the
  client.** Commands flow CP→sandbox _down this same socket_
  (`prompt`/`stop`/`snapshot`/`shutdown`/`push`/`ack`); events flow sandbox→CP up it. Critical
  events (`execution_complete`, `error`, `snapshot_ready`, `push_complete`, `push_error`) carry a
  deterministic `ackId`, are buffered (`MAX_EVENT_BUFFER_SIZE = 1000`) and re-flushed on reconnect
  until the DO replies `{type:"ack", ackId}` (`bridge.py:412-505`, `sandbox-events.ts:339-347`).

**The "can an Agent hold an outbound WS to Modal, defeating hibernation?" question is MOOT for us.**
We never hold an outbound socket. The sandbox dials _in_; our side is purely a WS server.

### 4.2 How Ramp solved the same leg (ASSUMPTION — low/medium confidence)

Ramp ("Inspect") runs the **identical data/control split**: OpenCode inside Modal Sandboxes (data
plane), Cloudflare Durable Objects with per-session SQLite + the Agents SDK Hibernation API for
streaming (control plane) — this role assignment is **STATED/high-confidence**. But Ramp **does not
publish the bridge wiring**: connection direction, the sandbox↔Agent callback transport, and
Modal-side reconnection ownership are all **unstated**. (Inside the sandbox OpenCode natively serves
agent events over HTTP+SSE on `localhost:4096` — an OpenCode capability, not a Ramp-stated
transport.)

**Conclusion:** Ramp is **corroboration that Modal + Agents SDK compose in production** and
validates the split we already have. It is **not** a bridge diagram to copy. Our own repo answers
the load-bearing question definitively and more favorably (we already use the inbound-WS-server
shape). Treat any specific Ramp wiring claim as ASSUMPTION; anchor on §4.1.

### 4.3 The actual residual problem: the second-peer / non-client socket

The real difficulty is **not** hibernation or connection direction. It is that leg B is a **second,
non-client peer** that the SDK's one-connection-class model does not represent, and it surfaces in
two places:

**(a) Pre-accept auth is per-DO state, so it must run _inside_ the Agent — corrected.** A previous
draft proposed validating the sandbox in "a Worker route in front of `routeAgentRequest`." **That
cannot work:** the validation reads the session's own SQLite (`this.getSandbox()` →
`SELECT * FROM sandbox`, `repository.ts:348`; `isValidSandboxToken` compares against
`sandbox.auth_token_hash` in that DO's SQLite, `durable-object.ts:858, 1786`). A Worker route has no
access to a specific session's DO SQLite without first _routing into the DO_ — which is exactly what
`index.ts:72-76` does today (`stub.fetch(request)`, DO authenticates internally). So leg-B auth
**lives in the Agent**. The corrected design: the top-level Worker detects `?type=sandbox` and
forwards to the Agent stub's `fetch()`/`onRequest(request)`, where the Agent runs the same
`getSandbox()` + `isValidSandboxToken` pre-accept checks, returns `410/403/401`, or **hand-builds
the `WebSocketPair` and accepts via `this.ctx.acceptWebSocket(server, tags)`** — identical to today
(`durable-object.ts:874-911`). **The SDK absorbs nothing for leg B's accept path; it stays a
hand-rolled upgrade inside the Agent.** This keeps the `/sessions/{id}/ws` URL, headers, and status
codes byte-for-byte — so `bridge.py` / `sandbox-runtime` change **zero** (constraint satisfied).

**(b) The SDK still owns message dispatch and the connection set — this is the MUST-VERIFY.**
Because the SDK's `Server.webSocketMessage` is the single DO-level handler, a socket accepted via
`this.ctx.acceptWebSocket` will still deliver frames into the SDK's `webSocketMessage → onMessage`,
and may appear in `getConnections()` / be a target of `setState`'s auto-broadcast. So we **cannot
fully "bypass" the SDK** for leg B's _runtime_. The decisive questions for Phase 1a (no real
traffic):

- Can a hand-accepted, tagged sandbox socket be **excluded from `getConnections()` and `setState`
  auto-broadcast**, while client sockets still get auto-sync? (If `setState` has no exclusion and
  always hits every connection, we must **not** use `setState` auto-broadcast for client view-state
  and instead use explicit `this.broadcast(msg, [sandboxConnIds])` everywhere — treating `setState`
  purely as persistence, which discards the SDK's headline auto-sync.)
- Does the SDK's `onMessage`/`onConnect` cleanly tolerate a socket it did not accept through its own
  `onConnect` flow, or does it error / synthesize an ad-hoc `Connection`?
- Does `connection.state` survive eviction on the _read_ path, or must we re-derive peer type from
  tags via `getConnections("sandbox")` (today's `getSandboxSocket()` rescans `ctx.getWebSockets()`
  by `sid:` tag, `websocket-manager.ts:147-189`)?

**If 1a shows the SDK can't host a clean second peer, that is the signal to stop** — leg A would
also lose its clean abstraction and the SDK's value collapses (feeds Decision 0).

### 4.4 Proposed design (illustrative sketch — corrected)

**The Agent owns the SESSION/CONVERSATION lifecycle and is the WS server for both legs; Modal
independently owns the SANDBOX lifecycle** (spawn/snapshot/teardown via its own `timeout` + our HTTP
calls). Connection ownership & hibernation, stated honestly:

- **Inbound sandbox socket is hibernatable**, but the 30s app-level heartbeat (`bridge.py:391-404`)
  keeps the Agent **resident and billable** for the whole active session (heartbeat < ~70–140s
  eviction window). Hibernation savings accrue only on client-idle gaps with no sandbox attached. We
  do **not** need `keepAlive()`/`keepAliveWhile()` for leg B. (Same behavior as today — but see the
  billing caveat, §1/§8: this is identical to today _operationally_; whether DO-vs-Agent _billing_
  is identical is UNVERIFIED.)
- **In-memory pointers are lost on eviction.** Re-derive the sandbox socket from
  `getConnections(tag)` on wake; persist the linkage (`modal_sandbox_id`, status, pending
  acks/cursor) in SQLite, never in memory — already the case today.
- **Reconnection ownership is split, unchanged:** inbound _client_ reconnection → SDK runtime.
  Inbound _sandbox_ reconnection → owned by the **bridge** (dials back with backoff, re-sends
  `ready`, re-flushes buffer + pending acks, `bridge.py:347-356`). The Agent only has to find the
  sandbox connection again and reply to re-flushed acks.

```ts
// ILLUSTRATIVE ONLY — names/signatures not final; assumes the §4.3(b) MUST-VERIFY answers are favorable.
class SessionAgent extends Agent<Env, SessionViewState> {
  // Leg B accept + pre-accept auth: hand-rolled, NOT via the SDK onConnect path.
  // The top-level Worker forwards `?type=sandbox` upgrades to this Agent's fetch()/onRequest.
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.searchParams.get("type") === "sandbox") {
      const sandbox = this.getSandbox(); // per-DO this.sql — cannot move to a Worker
      if (sandbox?.status === "stopped" || sandbox?.status === "stale")
        return new Response("Sandbox is stopped", { status: 410 });
      // ... 403 sandbox-id mismatch, 401 token mismatch (isValidSandboxToken) ...
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server, ["sandbox", `sid:${sandbox.modal_sandbox_id}`]); // hibernatable
      return new Response(null, { status: 101, webSocket: client });
    }
    return super.onRequest(request); // HTTP REST proxy paths
  }

  // Message dispatch DOES flow through the SDK's single webSocketMessage -> onMessage.
  async onMessage(conn: Connection, msg: WSMessage) {
    if (this.isSandbox(conn)) return this.handleSandboxMessage(conn, msg); // ack/buffer/events
    return this.handleClientMessage(conn, msg); // subscribe/prompt/stop/...
  }

  // Client view-state. MUST verify the sandbox is NOT a setState target (§4.3b);
  // else use explicit this.broadcast(view, [sandboxConnIds]) and treat setState as persistence only.
  private pushView(v: Partial<SessionViewState>) {
    this.setState({ ...this.state, ...v });
  }
}
```

The JSON `SandboxEvent`/`SandboxCommand` schema and the `ackId`/critical-event protocol are
**application logic ported into `onMessage`/`handleSandboxMessage`**, not framework behavior, and
stay byte-for-byte identical (FACT: wire types in `shared/src/types/index.ts:201-376`).

---

## 5. Target architecture + component mapping

**Target:** a `SessionAgent extends Agent` per session, addressed by
`getAgentByName(env.SESSION, sessionAgentName(sessionId))`, coexisting with `SessionDO` during
migration. The Agent absorbs framework plumbing **for the client leg**; all domain services remain
on top of `this.sql`/`this.schedule`/`onMessage`; **leg B stays a hand-rolled upgrade inside the
Agent** (§4.3); D1, R2, and the sandbox socket stay bespoke.

| Current piece (file:line)                                                                                                                                             | Disposition                                                                                       | Notes                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`SessionDO` addressing** — `env.SESSION.idFromName(sessionId)` (`index.ts:72`, `runtime-client.ts:26`, `durable-object.ts:1593`, `scheduler/durable-object.ts:615`) | **SDK absorbs** (`getAgentByName`/`idFromName`), routed through a new `sessionAgentName()` helper | Same underlying `idFromName`. Helper centralizes the routing key + preserves the `id`/`session_name` duality (§2). **Helper returns bare `sessionId` — no tenant prefix yet** (§6).                                                 |
| **Client WS leg** (`acceptClientSocket`, `forEachClientSocket`, `setWebSocketAutoResponse`, `wsid:` tags)                                                             | **SDK absorbs**                                                                                   | `onConnect`/`onMessage`/`onClose`/`onError` + hibernation + auto ping/pong.                                                                                                                                                         |
| **Sandbox WS leg** (`handleWebSocketUpgrade` auth, `acceptAndSetSandboxSocket`, `classify`, `getSandboxSocket` re-adopt by `sid:` tag)                                | **Bespoke, remains — hand-rolled accept inside the Agent**                                        | No SDK primitive for a second non-client peer. Accept + pre-accept auth hand-rolled in `onRequest`; message dispatch still flows through the SDK's `onMessage` (§4.3).                                                              |
| **realtime/events — client fan-out** (`broadcast`, `createSandboxEventMessage`, `realtime/events.ts:40-45`)                                                           | **SDK absorbs (partly) — pending §4.3b**                                                          | Status/title pushes → `setState`/`onStateChanged` _iff_ the sandbox is provably not a setState target; else explicit `this.broadcast(..., [sandboxConnIds])`. `{type:"sandbox_event"}` relays stay explicit `broadcast`.            |
| **realtime/events — `TokenAggregator`** (`realtime/events.ts:72-132`, 50ms/100-token flush)                                                                           | **Bespoke, remains**                                                                              | Perf optimization on the token stream; no SDK equivalent.                                                                                                                                                                           |
| **Event log + replay** (`getReplayData` last 500, `queryEventPage` keyset cursor, `repository.ts:804-858`)                                                            | **Bespoke, remains**                                                                              | No SDK equivalent for event replay/history pagination. Lives on `this.sql`.                                                                                                                                                         |
| **`session-runtime-proxy` / `session-route` / `session-prompt`** (HTTP REST → DO internal paths)                                                                      | **Stays as-is**                                                                                   | Plain HTTP proxying. Target the Agent via `getAgentByName(...).fetch()` or `onRequest`.                                                                                                                                             |
| **`ws-token` flow** (`ws-token.handler.ts:32` mint+hash, forwarder, `handleSubscribe` `:1100`)                                                                        | **Bespoke, remains (re-shaped for clients)**                                                      | Today: post-open `subscribe`. SDK-idiomatic for _clients_: auth at `onConnect` via `ctx.request` + client `query: () => ({ token })`. Token mint/hash brokering stays our code. (Does **not** apply to leg B, which is pre-accept.) |
| **`ws_client_mapping` table** (hibernation client-identity recovery, `schema.ts:116`)                                                                                 | **SDK absorbs**                                                                                   | Replaced by `connection.setState({...})` / `serializeAttachment` (read-path survival is MUST-VERIFY, §4.3b).                                                                                                                        |
| **Per-session SQLite** (`ctx.storage.sql`, `SessionRepository`, 6 tables + `ws_client_mapping`, 31 `MIGRATIONS`)                                                      | **Primitive: SDK absorbs (`this.sql`). Schema/repo/migrations: Bespoke, remains.**                | **Avoid `cf_agents_*` names** (reserved). Our tables are unprefixed — collision check is a **Phase 1a acceptance criterion** (§7), not a vague "verify".                                                                            |
| **Alarms** (`setAlarm`/`getAlarm` single slot, watchdogs)                                                                                                             | **SDK absorbs (`this.schedule`), with care**                                                      | **Do not mix raw `setAlarm` with Agent schedules in one class** (single alarm slot). Port watchdogs onto `this.schedule`.                                                                                                           |
| **`SandboxLifecycleManager`** (`sandbox/lifecycle/manager.ts`; spawn/warm/snapshot, circuit-breaker)                                                                  | **Bespoke, remains**                                                                              | `ModalClient` is plain `fetch` — zero changes.                                                                                                                                                                                      |
| **`SessionMessageQueue`** (`message-queue.ts`; prompt enqueue, single-flight)                                                                                         | **Bespoke, remains**                                                                              | SDK state-sync ≠ a durable work queue.                                                                                                                                                                                              |
| **SCM/secret/token brokering** (`getUserEnvVars` `:1737`, `isValidSandboxToken` `:1786`)                                                                              | **Bespoke, remains**                                                                              | Domain logic; per-DO state.                                                                                                                                                                                                         |
| **Child-session lineage** (`notifyParentOfChildUpdate` `:1585`)                                                                                                       | **Bespoke, remains**                                                                              | Cross-Agent RPC via `getAgentByName`.                                                                                                                                                                                               |
| **D1 session index** (`SessionIndexStore`, `db/session-index.ts`; `:1439-1500`)                                                                                       | **Bespoke, remains — write-through**                                                              | Per-Agent SQL **cannot** serve "list my sessions"/analytics/identity. The Agent **must keep write-through projecting** its row into D1. **The single biggest "setState won't save you here" item.**                                 |
| **R2 media** (`MEDIA_BUCKET`, `storage/object-storage.ts`)                                                                                                            | **Stays as-is (external)**                                                                        | Only keys live in SQL.                                                                                                                                                                                                              |
| **`SchedulerDO`** (`scheduler/durable-object.ts`, `idFromName("global-scheduler")` singleton)                                                                         | **Stays as-is / out of scope**                                                                    | Global singleton, not per-session. Its per-session resolution (`:615`) routes through `sessionAgentName()`. Omission is deliberate.                                                                                                 |

---

## 6. Multi-tenancy: keep it a later config flip (without baking in a _wrong_ boundary)

**Where single-tenancy is baked in today (FACT).** Single-tenant by **omission**, not an explicit
`tenantId`. **No `tenant_id`/`org_id` column anywhere in D1** (grep across all migrations → none).
Load- bearing artifacts:

- **Bare global DO naming:** `idFromName(sessionId)` with no prefix (4 sites, §2). Tenant is
  **unrecoverable from the DO name**.
- **Authorization is a boolean allowlist, not a tenant resolver:** `checkAccessAllowed()`
  (`apps/orto/src/lib/access-control.ts:37-63`) over flat global lists. `GET /sessions` scoping
  (`apps/orto/src/app/api/sessions/route.ts:15-65`) is an **opt-in client filter** (`createdBy`),
  not server-side isolation.
- **One encryption key for all data** (`TOKEN_ENCRYPTION_KEY`, `REPO_SECRETS_ENCRYPTION_KEY`,
  `types.ts:58-59`); `global_secrets` keyed on `key` alone (`global-secrets.ts:69`).
- **Ownership is actually `user_id`, not `repo_owner`.** D1 session rows are owned by
  `created_by`/user; `repo_owner` is a _proto-tenant_ but is **not** the identity boundary.
  `GITHUB_APP_INSTALLATION_MAP` (owner→installationId, `github-app.ts:700`,
  `installation_map.py:20`) is a third candidate key.

**The trap, stated plainly:** **any tenant value baked into a DO name is permanent for that DO's
lifetime** — a DO's SQLite is tied to its `id`, and renaming strands storage. So choosing the tenant
key is itself **load-bearing and hard to reverse**, and `repo_owner` may be the _wrong_ key (the
dossier shows ownership is `user_id`). Prefixing names with `repo_owner` now does **not** make MT "a
config flip" — if the real boundary later turns out to be `user_id`/`installation_id`, we are
stranded exactly as if we had done nothing. **The lock-in trap is moved, not removed, by premature
prefixing.**

**Reconciled recommendation (cheap centralization now, no premature commitment):**

1. **Introduce `sessionAgentName(sessionId)` now, returning the bare `sessionId` — zero lock-in.**
   We are already touching all four `idFromName` sites to adopt `getAgentByName`; centralizing the
   routing-key construction in one helper is free and makes a future prefix a one-line change. **But
   do not prefix with any tenant value until the real boundary is decided** (Decision 3).
2. **Carry tenant only in D1 for now:** add a **nullable** `tenant_id` column to `sessions` (+
   `global_secrets`) — one nullable migration each, zero risk — and thread an `ownerId`/`tenantId`
   param through `SessionInitInput` (`session-create.ts:141-164`), the secret stores, and
   `ListSessionsOptions`, **ignored today**. This makes the call sites tenant-shaped without
   committing the physical name.
3. **At MT-enablement** (a later, deliberate change), decide the real key, start prefixing
   `sessionAgentName`, and pay the documented one-time rename cost **once**, when the session count
   is known-small — rather than locking in `repo_owner` today and discovering it is wrong.

This keeps the seams tenant-aware (the whole ask) while refusing to bake in a boundary the data says
is probably wrong. The genuinely hard part — choosing the key — is surfaced as **Decision 3**, not
defaulted.

---

## 7. Incremental migration plan

The current DO works; this is strictly additive until cutover. Coexistence is concretely supported
(FACT): a Worker exports many DO classes; the Agent is one more; add an entry to the
`durable_objects` list and a **new migration tag** listing **only** the new class.

### Phase 0 — Naming + tenant seams (no SDK, lowest risk, independently mergeable)

Introduce `sessionAgentName(sessionId)` (returns bare `sessionId`) and route the four `idFromName`
sites through it. Add nullable `tenant_id` to `sessions`/`global_secrets`; add ignored `tenantId`
params to the secret stores and `ListSessionsOptions`. De-risks §6 with zero SDK dependency.

### Phase 1a — "Hello `SessionAgent`": NO real traffic, prove the decisive facts

Stand up an empty `SessionAgent` class wired into Terraform and exercised only by an internal
test/RPC — **zero real sessions.** This is the cheap slice that answers the questions that decide
everything:

- The **two-phase DO-binding deploy** works for an Agent class (CLAUDE.md gotcha, below).
- **Coexistence**: `SessionAgent` and `SessionDO` live in the same Worker without migration-tag
  conflict.
- **Naming**: `getAgentByName(env.SESSION, sessionAgentName(id))` round-trips server-side RPC.
- **§4.3(b) second-peer MUST-VERIFY**: hand-accept a tagged dummy "sandbox" socket via
  `this.ctx.acceptWebSocket`; assert it is **excluded** from `getConnections()`/`setState`
  auto-broadcast while a client socket is included — or, if not, that explicit
  `broadcast(..., [exclude])` works and `setState` can be used as persistence-only. **This is the
  gate: if it fails, stop and reconsider Decision 0.**
- **`cf_agents_*` collision (acceptance criterion):** run `initSchema` in `onStart()`, then
  `SELECT name FROM sqlite_master WHERE type='table'` and assert app tables + `cf_agents_*` do not
  clash and that `_schema_migrations` ordering is deterministic regardless of whether `setState` or
  `initSchema` runs first.

**No production session touches this phase**, so there is no rollback surface. We can stop here
cheaply.

### Phase 1b — One designated `repo_owner` cohort, full stack, WITH a kill-switch

Only after 1a passes: gate session creation so `repoOwner === DESIGNATED_OWNER` routes to
`SessionAgent` (full stack: client leg A + hand-rolled sandbox leg B + `this.sql` tables +
`this.schedule` watchdogs + D1 write-through); everyone else stays on `SessionDO`.

- **Kill-switch (required):** a runtime flag (env/D1) that routes new sessions for that owner **back
  to `SessionDO`** without a deploy. **Honest limitation:** the creation-time gate only protects
  _new_ sessions; an **in-flight Agent session that wedges has no live escape** — name this
  explicitly as the accepted blast radius (one owner, new sessions only) and document the manual
  recovery (terminate + recreate on `SessionDO`).
- **Shadow validation:** assert replay/history parity and D1 write-through parity against a
  `SessionDO` baseline before widening.
- **Naming:** this cohort uses the **bare** `sessionAgentName(id)` (no tenant prefix) — we are
  testing the Agent runtime, **not** committing a tenant key (§6, Decision 3).

**Terraform / wrangler steps (config is Terraform-generated; no checked-in `wrangler.toml`)** — map
onto existing variables (FACT, repo-verified):

- Add the class to the DO list
  (`terraform/environments/production/workers-control-plane.tf:98-101`):
  `{ binding_name = "SESSION_AGENT", class_name = "SessionAgent" }`.
- Bump the migration tag (`variables.tf:312-322`): `control_plane_migration_old_tag = "v1"`,
  `control_plane_migration_tag = "v2"`, `control_plane_new_sqlite_classes = ["SessionAgent"]` (list
  **only** the new class; never re-list `SessionDO`/`SchedulerDO`, never edit an existing tag). Must
  be in `new_sqlite_classes`, not `new_classes`.
- `compatibility_flags` already includes `nodejs_compat` (`:106`) — satisfied. `compatibility_date`
  is `2024-09-23` (`:105`); the SDK wants a recent date — **bump it but verify it doesn't change
  `SessionDO` behavior first** (ASSUMPTION — needs a compat-date diff check).
- **Two-phase DO-binding deploy** (CLAUDE.md gotcha, repo-verified): the module emits the
  `migrations` block only when `enable_durable_object_bindings = false` and bindings only when
  `true` (`modules/cloudflare-worker/main.tf:44-48,104-108`). Apply once with bindings **disabled**
  (creates the SQLite class), then with bindings **enabled**.
- **Version pin (re-pin at implementation time).** As of 2026-06-15, `agents@0.16.0` (2026-06-12) is
  **blocked** by the repo's 7-day `minimumReleaseAge` gate
  (`pnpm-workspace.yaml minimumReleaseAge: 10080`); newest installable is **`0.15.0`** (2026-06-08);
  `0.16.0` unblocks 2026-06-19. **By implementation time the installable version will have moved** —
  pin the exact version _then_, and treat the §8 single-source signature list as a **verification
  checklist against that version's source**, not a spec (pre-1.0, ~weekly breaking minors).

### Phase 2 — Harden + widen

Confirm §4.3(b) and replay/history parity at scale; run the integration suite (`test/integration`,
real D1, two-phase migrations applied automatically). Widen the creation gate from one owner to a
percentage/allowlist.

### Phase 3 — Cutover + decommission

Route all new sessions to `SessionAgent`. In-flight `SessionDO` sessions drain naturally (terminal
status); **no DO-to-Agent data copy** — DO SQLite is private per class with no automatic carryover
(FACT). Once `SessionDO` has no live sessions, remove its binding in a later migration tag.

---

## 8. Risks, open questions, non-goals

### Risks

- **Second-peer membership (the big one).** Whether a hand-accepted sandbox socket can be excluded
  from `getConnections()`/`setState` auto-broadcast is **unverified** and decides whether the SDK's
  client abstraction is usable at all. Gated in Phase 1a.
- **Billing parity (UNVERIFIED).** The 30s heartbeat keeps the Agent resident during active
  sessions, so hibernation "cheap idle" applies only to detached gaps; DO-vs-Agent GB-s/request
  rates were not fetched. Price before committing if cost is a motivation.
- **Pre-accept auth must live in the Agent.** Confirmed it cannot move to a Worker route; leg B's
  auth/ accept never becomes "idiomatic SDK."
- **SQLite table coexistence / alarm-slot contention.** Reserved `cf_agents_*`; one alarm slot.
  Phase 1a acceptance criteria; port watchdogs fully onto `this.schedule`.
- **Tenant-key permanence.** Any tenant value baked into a DO name is irreversible without stranding
  SQLite; `repo_owner` is likely the wrong key (ownership is `user_id`). Hence "no prefix until the
  key is decided" (§6, Decision 3).
- **SDK maturity.** Pre-1.0, ~weekly minors, breaking changes between minors; re-pin + re-verify at
  implementation time.
- **`compatibility_date` bump.** Likely required; verify it doesn't alter `SessionDO`/`SchedulerDO`
  behavior.

### Open questions (ASSUMPTION / uncertain — do not treat as settled)

- §4.3(b) SDK connection-set semantics with a hand-accepted non-client socket — **verify against the
  installed version**.
- `setState` broadcast target-set + per-connection-`state` read-path survival after eviction.
- Single-source SDK signatures: `schedule<T>(...)`, `keepAlive`/`keepAliveWhile`, `~70-140s`
  eviction window, `routeAgentRequest`/`getAgentByName` option lists.
- Ramp's actual bridge wiring — unstated; we rely on our own topology.
- DO-vs-Agent billing rates; per-Agent SQLite size cap vs DO storage limits.

### Non-goals

- Switching compute off Modal / to Cloudflare Sandboxes; moving OpenCode out of the sandbox;
  migrating the `*-bot` integrations; converting `SchedulerDO`; turning on multi-tenancy now;
  copying DO SQLite into Agent SQLite for in-flight sessions; a big-bang rewrite.
- **Replacing leg B's inbound WebSocket with the SDK's webhook-callback pattern** — this would force
  changes to `bridge.py` (violating "Modal unchanged") and lose the single bidirectional
  command/event stream + ack/buffer/replay. **Decided non-goal**, not an open option. (The real fork
  is _how leg B authenticates within the SDK_ — Decision 2, not _whether to keep the socket_.)

---

## 9. Decision points for the human

Five forks, each naming the constraint that drives the recommendation. **Decision 0 is the gate.**

### Decision 0 — Do we migrate at all, and how far?

- **Option A: Proceed incrementally**, stopping after **Phase 1a** to re-decide on hard evidence
  (does the SDK host a clean second peer? is billing acceptable?).
- **Option B (recommended): Do Phase 0 + Phase 1a only as a spike**, then explicitly re-evaluate —
  treat full adoption as un-approved until 1a's MUST-VERIFY (§4.3b) passes and billing parity is
  priced.
- **Option C: Don't adopt the SDK; cherry-pick its _patterns_** (named `this.schedule`-style
  scheduling, `connection.setState` identity recovery) directly onto the existing `SessionDO`
  without the dependency.
- **Recommendation: B.** Constraint: _the SDK absorbs only plumbing we already implement on the same
  primitives, all hard parts stay bespoke, and it adds a new second-peer risk + maturity risk._ The
  value is real but modest and front-loaded; 1a buys the decisive facts cheaply. Don't pre-commit to
  full adoption.

### Decision 1 — If we proceed: incremental adapter vs ground-up rewrite

- **Option A (recommended): Incremental** — `SessionAgent` alongside `SessionDO`, domain services
  ported as-is onto SDK primitives.
- **Option B: Ground-up rewrite** on SDK idioms (state-first, `@callable` throughout).
- **Recommendation: A.** Constraint: _incremental, not big-bang; the current DO works._ The domain
  logic (circuit breakers, ack protocol, child lineage, execution-timeout reconcile) is the hard-won
  part and is **not** what the SDK replaces.

### Decision 2 — How leg B authenticates within the SDK (the real bridge fork)

- **Option A (recommended): Hand-rolled upgrade inside the Agent** — `onRequest` runs
  `getSandbox()` + `isValidSandboxToken`, returns `410/403/401`, accepts via
  `this.ctx.acceptWebSocket` (§4.3a). SDK absorbs nothing here.
- **Option B: Accept-then-WS-close** — let the SDK accept, then close with a code on auth failure;
  requires changing `bridge.py` fatal-vs-retryable handling. **Violates "Modal unchanged."**
- **Option C: `onBeforeConnect`/`onBeforeRequest`** returning a pre-accept `Response` **if** the
  installed SDK exposes one with DO context. **Unverified** — may not exist / may lack `this.sql`
  access.
- **Recommendation: A.** Constraint: _Modal/`bridge.py` byte-for-byte unchanged + per-DO auth
  state._ B is out by constraint; C is unverified. A is the only option that satisfies both today —
  at the cost that leg B never becomes idiomatic SDK. (This replaces the strawman "WS vs webhook"
  framing; keeping the inbound WS is a non-goal-level given, §8.)

### Decision 3 — The tenant key, and whether to prefix DO names now

- **Option A (recommended): Centralize `sessionAgentName` now but keep names bare; carry tenant in a
  nullable D1 column; choose the key at MT-enablement** and pay the one-time rename then.
- **Option B: Prefix now with `repo_owner`.** Cheap "flip" later — **but permanent**, and likely the
  wrong key (ownership is `user_id`).
- **Option C: Prefix now with `installation_id`** (already a seam via `GITHUB_APP_INSTALLATION_MAP`,
  coarser/more stable than `repo_owner`).
- **Recommendation: A.** Constraint: _flexible-for-MT-later without locking in a wrong, irreversible
  boundary._ A DO name is permanent; the data says ownership is `user_id`, not `repo_owner`.
  Centralizing the helper is free; committing the _value_ is not — defer it until the real boundary
  is known.

### Decision 4 — Per-session state: `this.sql` system-of-record vs `setState` blob

- **Option A (recommended): System of record on `this.sql`/`SessionRepository`/`MIGRATIONS`; use
  `setState` only for the small client-synced view subset** (`status`, `title`, sandbox readiness) —
  and only if §4.3(b) confirms the sandbox is not a `setState` target; otherwise explicit
  `broadcast`.
- **Option B: Move session state into the `setState` JSON blob** and lean on auto-sync.
- **Recommendation: A.** Constraint: _correctness + D1 write-through + event replay._ The `events`
  log, prompt queue, encrypted tokens, circuit-breaker counters, and 31-migration schema are
  relational and keyset-paginated — they do not fit one JSON blob, and `setState` cannot serve the
  D1 cross-session index.
