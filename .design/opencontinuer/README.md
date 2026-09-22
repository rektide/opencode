# opencontinuer — plugin session compact exposure

Feature line for the `opencode-opencontinuer` patch. The plugin project itself
lives out-of-tree at `~/src/opencontinuer` (see
[`plugins.md`](file:///home/rektide/ado/plugins.md)); this patch is only the
contract-widening seam that gives plugins a sanctioned in-process route to
compaction.

## Motivation

Agents cannot run their own compaction today. The backend has been sufficient
since the V2 session-core rework — `POST /api/session/:sessionID/compact`
(protocol) → `Session.compact` (core): commits any staged revert boundary,
admits a compaction item into the session inbox (`delivery: "steer"` by
default), wakes execution. Inbox integration makes it steering-safe by design:
it runs at the next safe step boundary, cannot deadlock an active tool turn,
and preserves session identity, parent relationship, and location.

The gap is exposure: the plugin `SessionDomain` deliberately `Pick`s
`SessionApi` without `compact`, so a plugin-registered agent tool has no
sanctioned way to trigger it. The `opencontinuer` plugin registers the
`continuer_session_compact` agent tool; on an unpatched host it falls back to
service-registration loopback HTTP (the `opencode-backgrounder` precedent,
reading `~/.local/state/opencode/service{,-local}.json`). This patch removes
the need for that fallback.

Guidance posture carried by the plugin (not the patch): availability must not
silently enable automatic compaction; agents should self-compact only when
requested or when explicitly continuing long-lived work with growing history.
See the agent-callable self-compaction addendum in
[`patches.md`](file:///home/rektide/ado/patches.md).

## Patch shape

One change, four files, no behavior change for existing consumers — it only
widens the plugin contract:

- `packages/plugin/src/effect/session.ts` — add `"compact"` to the
  `SessionDomain` Pick (effect flavor).
- `packages/plugin/src/promise/session.ts` — same Pick addition (promise
  flavor).
- `packages/core/src/plugin/host.ts` — wire `compact: sessions.compact` into
  the effect plugin session domain.
- `packages/plugin/src/promise/adapter.ts` — adapt `session.compact` into the
  promise domain (`adaptApiMethod`, same as every other session operation).
- `packages/core/test/plugin/host.ts` — test host gains the `compact` member
  (`Effect.die("unused session.compact")` default, override-shaped like its
  siblings).

`SessionApi["compact"]` already exists in the generated client
(`SessionCompactOperation`: `{ sessionID, id?, delivery? } →
SessionInbox.Compaction`), so no protocol or client regeneration is involved.

## Verification

- `packages/core`: `bun typecheck` clean; `bun test test/plugin` — 329 pass.
- `packages/plugin`: `bun typecheck` clean; `bun test` — 9 pass.
- No runtime compaction behavior is touched; the admission path is the
  existing `Session.Service` operation the HTTP handler already calls.

## Deployment notes

- On-deck against `v2@origin` (parent `dcfe1ec7`). Not composed into `working`
  — promotion is an operator decision.
- The plugin degrades gracefully: it prefers `ctx.session.compact` when the
  host provides it and falls back to loopback discovery otherwise, so this
  patch and the plugin can be promoted independently.

## Open questions

- Should upstream eventually ship a built-in `opencode_session_compact` tool
  (mirroring `session_move` in `core/src/tool/plugin/opencode.ts`)? That would
  supersede the plugin's tool registration while this patch remains the
  underlying seam.
