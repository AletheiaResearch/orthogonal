# Migrating orto's agentic UI onto `@orthogonal/ui/ai`

**Status:** forward-looking guide. The Tier-2 AI primitives in `@orthogonal/ui/ai` are built
**additively** — orto's session/transcript UI still runs on its own coupled components. This
document describes how orto _could_ adopt the generic primitives later, one surface at a time, with
no rush.

## Why these weren't migrated up front

orto's agentic components are bound to the app's data contracts — `SandboxEvent` (from
`@open-inspect/shared`), the `Artifact` type, `MODEL_REASONING_CONFIG`, and orto's URL builders
(`buildSessionMediaUrl`, `buildAuthenticatedUrl`). The Tier-2 primitives are deliberately
**decoupled**: they take plain props / render-props, not orto types. Migration therefore means
_moving the app-specific glue to the call site_ and letting the primitive render. Behavior-affecting
changes to a live surface should be made and verified deliberately, not as a side effect of the
extraction.

## The principle

> **orto keeps the protocol and the data-shaping; the package owns the presentation.**

Every formatter/selector that today lives inside a component (e.g. `formatToolCall`,
`formatToolGroup`, `buildSessionMediaUrl`, the reasoning-effort lookup) stays in orto and is called
_before_ rendering, producing the plain props the primitive expects.

## Component-by-component map

| orto component (today)                                 | `@orthogonal/ui/ai` primitive                                                     | What moves to the call site                                                                                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/tool-call-item.tsx`                        | `Tool` + `ToolHeader` / `ToolInput` / `ToolOutput`                                | Call `formatToolCall(event)` (stays in orto), pass `{ name, state, summary, input, output }` as props instead of the `SandboxEvent`.                                            |
| `components/tool-call-group.tsx`                       | `ToolGroup` (wrapping `Tool` children)                                            | Call `formatToolGroup(events)` in orto; pass `{ label, summary, count }` + map each event to a `<Tool>` child.                                                                  |
| `components/reasoning-effort-pills.tsx`                | `PromptInput`'s `PromptInputEffort`                                               | orto resolves the allowed efforts from `MODEL_REASONING_CONFIG[model]` and passes `{ efforts: string[], value, onSelect }`. The shared-model lookup never enters the package.   |
| `components/terminal-panel.tsx`                        | `WebPreview` (+ `WebPreviewNavigation` / `WebPreviewBody`)                        | orto builds the authenticated iframe URL via `buildAuthenticatedUrl(url, token)` and passes a resolved `src`. Keep orto's terminal-specific toolbar actions via the slot props. |
| `components/safe-markdown.tsx`                         | `Response` (this is the **moved** `safe-markdown`, re-exported under the AI name) | Already decoupled — just import `Response` (or keep importing `SafeMarkdown` from `@orthogonal/ui`). No prop changes.                                                           |
| `components/screenshot-artifact-card.tsx`              | `Image` (the genericized media card)                                              | orto computes `src = buildSessionMediaUrl(sessionId, artifactId)` and passes `{ src, type, caption }`.                                                                          |
| `components/media-lightbox.tsx`                        | `Lightbox` (the genericized lightbox)                                             | orto resolves `src` and passes `{ src, type, title, description, open, onOpenChange }`.                                                                                         |
| session page transcript scroll region                  | `Conversation` (+ `ConversationContent` / `ConversationScrollButton`)             | Wrap the message list; drop the hand-rolled stick-to-bottom logic.                                                                                                              |
| session page message blocks (`user_message` / `token`) | `Message` (+ `MessageContent` / `MessageAvatar`), `Actions`, `CodeBlock`          | Map the event's role to `from="user" \| "assistant" \| "system"`; render text through `Response`; wire copy/retry to `Actions`.                                                 |
| session page footer composer                           | `PromptInput` (+ `Textarea` / `Toolbar` / `Submit` / `ModelSelect` / `Effort`)    | Move submit/keyboard handling into the `onSubmit` prop; keep orto's model list + effort lookup at the call site.                                                                |
| _(no current orto source)_                             | `Task` / `TaskItem`, `Suggestion(s)`, `Loader`, `Sources`                         | New surfaces orto can adopt when it renders TodoWrite plans, quick-start chips, streaming states, or citations.                                                                 |

## Suggested migration order (lowest risk first)

1. **`safe-markdown` → `Response`.** Pure import swap; already decoupled. Do this with the
   extraction.
2. **`screenshot-artifact-card` / `media-lightbox` → `Image` / `Lightbox`.** Genericized during the
   extraction; the only change is computing the media URL at the call site.
3. **`tool-call-item` / `tool-call-group` → `Tool` / `ToolGroup`.** Introduce `formatToolCall` /
   `formatToolGroup` at the call site; verify each tool's input/output rendering against the current
   UI.
4. **`terminal-panel` → `WebPreview`.** Pass a resolved `src`; re-attach terminal-specific toolbar
   bits.
5. **Composer → `PromptInput`; transcript → `Conversation` + `Message`.** The largest surface;
   migrate last and verify keyboard shortcuts, streaming, and scroll behavior carefully.

## Verification per surface

For each migrated surface: snapshot the current behavior (screenshots + interaction notes), swap the
component, then confirm visual parity, keyboard/interaction parity, and that the app-specific glue
(formatters, URL builders, model/effort lookups) still produces identical props. Migrate one surface
per PR so regressions are easy to bisect.
