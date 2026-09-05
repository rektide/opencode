---
type: Report
title: Controlled event feed v2@origin port
description: Rebase of the 38-commit bus-smart stack onto v2@origin (lwoszptrpqvn, #47464), the semantic adaptations required, and the re-verification matrix.
resource: /design/bus-smart/port0
tags: [rebase, port, server, events, tui, client, verification]
status: stable
generated: { by: "agent:glm-5.3-high", at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-12-31
sources:
  - id: verification-report
    resource: /design/bus-smart/verification0
    title: Controlled event feed verification
  - id: upstream-tip
    resource: https://github.com/anomalyco/opencode
    title: v2@origin at lwoszptrpqvn "fix(tui): preserve parent scroll position across subagents (#47464)"
---

# Port to v2@origin

## Situation

The bus-smart stack (38 commits, 16 code) was built on `lmpvpwvxrwvv` (#46171). By port time `v2@origin` had advanced 376 commits to `lwoszptrpqvn` (#47464). The stack was rebased in place with `jj rebase -s ykvlyyxlvllo -d v2@origin`; conflicts were resolved per-commit bottom-up with jj's `new` → resolve → `squash` flow, preserving the original commit boundaries and messages.

## Semantic adaptations

Textual markers were only half the work; these are the merges where upstream refactors changed the seam our commits touched:

| Upstream change | Our commit affected | Resolution |
| --- | --- | --- |
| `Session.move` extracted into `packages/core/src/session/move.ts`, with a refined idle-recovery condition (#46955) | `fix(core): close immediate move notification gap` | Took `move: moves.move` delegation; ported the `bus.publish(...moved)` → `bus.publishAll([moved])` one-liner into `move.ts`. Our `session-move` interruption test still exercises the new condition path (idle session, removed source). |
| Promise client gained a hand-written wrapper (`promise/client.ts`) whose `event: events` (SharedEvents) replaced the generated event namespace | `feat(client): add controlled event feed source` | Wrapper now returns `event: { ...raw.event, subscribe: events.subscribe }` so the generated `event.controlled` (negotiation contract) survives alongside shared legacy subscriptions. The Effect wrapper already spread `raw.event`, needing no change. |
| `createAppFixture` extracted to `packages/tui/test/fixture/app.ts` | `test(tui): pin initial controlled interests` | Kept upstream's in-file tests; ported the `controlled` fixture option and the `createFetch(..., { controlled })` passthrough into the shared fixture. `tui-client.ts` merge had already carried the controlled fetch routes. |
| `app.tsx` provider tree gained `UpdateNotificationProvider` + `PanelProvider` inside `AttentionProvider` | `feat(tui): declare controlled event interests` | `EventInterestProvider` stays outermost (wraps `SessionTerminalsProvider`, under `SessionTabsProvider`); upstream's new layers nested inside `AttentionProvider`. |
| `session-runner`'s `preserves a tool continuation across a steered move` scenario absorbed into the chained-moves loop | `test(core): cover routed move completion` | Our routed-observation interruption scenario re-anchored after the chained-moves loop, before `keeps queued input parked across a mid-turn move`. |
| Generated client surfaces regenerated (RpcError/RpcInternalError additions; `OpenCodeEvent` became a value export) | `chore(client): regenerate controlled feed client` | Union-merged, then canonicalized via `bun run generate`; a tip-level regenerate run produces no diff. |

`packages/server/src/event-feed.ts`, `handlers/event.ts`, `packages/core/src/bus.ts`, and the TUI client-context files were untouched upstream in the window and merged cleanly.

## Re-verification matrix

All commands run from package directories on the rebased tip.

| Area | Result |
| --- | --- |
| Typecheck | protocol, core, server, client, tui, sdk all pass |
| Core Bus routing | 65 pass (`bus.test.ts`, `bus-session-routing.test.ts`) |
| Core move paths | 84 pass across `session-move` + adjacent; 203 pass `session-runner.test.ts` |
| Protocol contract | 5 pass (`event.test.ts`); generated OpenAPI drift check clean |
| Server feeds | 20 pass (controlled, controlled-http, legacy feed) |
| Client | 54 pass / 3 expected browser skips (effect, promise, solid-connection, solid-controlled-event-feed) |
| Client contract surfaces | 28 pass (contract-identity, import-boundaries, promise-service, shared-events) |
| TUI focused | 50 pass (event-interest, devtools-bar, use-event, session-tabs); 32 pass `app-lifecycle.test.tsx` |
| TUI full suite | See log entry below |

## Notes and follow-ups

- `bun install` at the root was needed once: the 376 upstream commits added workspace packages, and stale links produced a phantom `@opencode-ai/util/runtime-import` resolution failure in `packages/plugin`.
- The rebase consumed jj's documented resolution flow (`jj new` → fix → `jj squash` into the conflicted commit), which the rekon-wide AGENTS.md otherwise restricts; each squash contained only the marker resolution authored in this port.
- The two release gates from the verification report are unchanged and remain open: notification scope selection, and the live before/after reproduction once the machine-wide watcher startup path permits framebuffer testing.

## Cross-references

- [Verification report](/.design/bus-smart/verification0.gpt56s.md) — prior automated matrix and release gates this port re-establishes.
- [Client compatibility research](/.design/bus-smart/research-client-compat0.glm53.md) — grounds the controlled/legacy negotiation the wrapper change preserves.
- [TUI interest research](/.design/bus-smart/research-tui-interest0.glm53.md) — grounds the `EventInterestProvider` placement kept in the merged provider tree.
