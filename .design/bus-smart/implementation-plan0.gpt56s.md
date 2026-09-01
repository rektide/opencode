---
type: Plan
title: Controlled event feed implementation closeout
description: Durable continuation plan for finishing verification and release decisions after the controlled feed vertical slice landed.
resource: /design/bus-smart/implementation-plan0
tags: [server, events, tui, client, verification, observability]
status: draft
generated: { by: "agent:gpt-5.6-sol", at: 2026-09-01 }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: directional-design
    resource: /design/bus-smart/draft0
    title: Controlled event feed directional draft
  - id: implementation-audit
    resource: session:ses_fa47203d6ffeiyIjGyUqNS0j10
    title: Independent controlled-feed implementation audit
---

# Controlled event feed implementation closeout

## Current state

The production vertical slice is implemented and committed:

1. Client connection source injection with unchanged legacy default.
2. Bus publication-time routed observation and the immediate-move notification correction.
3. Additive controlled-feed Protocol, OpenAPI, Promise client, and Effect client surfaces.
4. Controlled Server registration, activation, matching, move-derived coverage, bounds, and SSE handlers.
5. Solid controlled-feed controller with full replacement, coalescing, removal grace, generation fencing, and legacy fallback.
6. TUI adoption through one declarative `EventInterestProvider` plus the new-Session `flush()` gate.
7. Feed diagnostics showing controlled/legacy mode and desired versus installed interests.
8. Streaming raw-body enforcement for the 256 KiB interest request limit.
9. Concurrent Server admission-race tests and genuinely late Client-generation tests.

The current committed tip is `test(client): pin controlled generation fencing` (`22d5476f`). The working copy intentionally contains the next TUI verification slice in:

- `/packages/tui/test/fixture/tui-client.ts`
- `/packages/tui/test/context/session-tabs.test.tsx`

That work adds opt-in controlled-feed behavior to the shared test transport while preserving default older-server `404` fallback. The persisted-tab test now verifies that the first activation PUT contains the launch Location and all persisted tab roots before connected.

## Next implementation steps

### 1. Finish the optimistic Session flush oracle

Extend `createFetch`'s opt-in controlled callback from synchronous `void` to `void | Promise<void>`. Await it before returning the PUT `204`; only the first activation should enqueue connected.

Thread the callback through `createAppFixture` in `/packages/tui/test/app-lifecycle.test.tsx`.

Add an integration test based on the existing “uses the resolved launch directory for new prompts” fixture:

1. Let the initial launch-only controlled PUT complete so the TUI connects.
2. Create a new Session through the real prompt interaction.
3. When the replacement body first contains the client-minted Session ID, hold its PUT response on a promise gate.
4. Assert the Session was created and the interest PUT began, but `/prompt` has not been requested.
5. Release the PUT, assert `/prompt` is then sent exactly once, and assert the replacement contains the optimistic Session Location and ID.

Run:

```sh
mise exec -- bun test test/context/session-tabs.test.tsx -t "declares launch and persisted tab family interests"
mise exec -- bun test test/app-lifecycle.test.tsx -t "waits for optimistic session interest before first prompt"
mise exec -- bun typecheck
```

Commit as `test(tui): pin initial controlled interests`.

### 2. Complete move-path observation tests

`/packages/core/test/session-move.test.ts` currently blocks a routed observer only for the missing-source/no-cancellation path. Add coverage for:

- missing-source immediate move with one or more queued move cancellations, which publishes one cancellation-plus-move `publishAll` batch;
- runner-applied move in `/packages/core/src/session/runner/llm.ts`, whose move-plus-delivery batch is already uninterruptible by construction.

Use the existing observer gate pattern: signal when `session.moved` enters observation, interrupt the caller while observation is blocked, release the observer, and prove both durable projection and observation complete. Prefer extending existing move/runner fixtures over new mocks.

Commit as `test(core): cover routed move completion`.

### 3. Re-run the complete verification matrix

Run package-local checks only:

```text
Core:     bus.test, bus-session-routing.test, session-move/runner tests, typecheck
Protocol: event.test, check:generated, typecheck
Server:   controlled-event-feed, controlled HTTP, legacy event-feed, typecheck
Client:   full test, browser-condition connection test, check:generated, typecheck
TUI:      full test, typecheck
Static:   AST Effect-pattern scan over touched production files
```

Known non-failing TUI output includes renderer listener warnings and fixture cleanup diagnostics. Do not conflate those with controlled-feed failures.

### 4. Live acceptance when the machine watcher is stable

`termctrl` is available through `mise exec -- bunx termctrl`. Two standalone attempts were stopped cleanly because machine-wide `.agents`/`.claude` skill Watchman cookies continuously retriggered rescans, preventing handoff to the TUI framebuffer. Temporary XDG and HOME roots did not suppress those OS-home skill sources.

When stable, run a dedicated session and inspect the Debug dialog or developer Server panel for:

- `Event feed: controlled` against the worktree standalone server;
- desired and installed counts converging;
- no feed error;
- correct behavior after one resize and Ctrl-C cleanup.

Also test an older elected server through `bun run dev:live`; it should show `legacy`, preserve desired interest, and remain functional.

## Resolved audit findings

- Raw request bytes are now bounded before JSON parsing in `/packages/server/src/handlers/event.ts`.
- Controlled/legacy mode plus desired/installed state are exposed in logs, Debug dialog, developer Server panel, and debug snapshots.
- Server activation, replacement, and cleanup races are exercised concurrently.
- Client late PUT responses, stale frames, and determinate replacement `404` are pinned.

## Remaining product decision

Notification scope is intentionally not a transport invariant. Before a default release, choose one:

| Choice | Behavior | Implementation consequence |
| --- | --- | --- |
| Location/project scope | Notify for any relevant Session event admitted through a retained Location | No further code; document the behavior |
| Tracked Session/family scope | Notify only for visible/open Session families | Add a notification predicate independent of transport and valid in legacy mode |
| Server-wide scope | Preserve machine-wide attention | Design a separate low-rate attention aggregate; do not broaden the main feed |

The current experimental implementation naturally has Location/project scope. Do not silently present that as an approved product policy.

## Cross-references

- [Directional design](/.design/bus-smart/draft0.gpt56s.md) is the normative architecture and verification matrix.
- [TUI interest research](/.design/bus-smart/research-tui-interest0.glm53.md) supplies the route, tab, family, and first-execution ordering facts.
- [Client compatibility research](/.design/bus-smart/research-client-compat0.glm53.md) explains why per-generation controlled probing preserves older-server operation.
- [EventFeed Effect research](/.design/bus-smart/research-eventfeed-effect0.glm53.md) grounds the single-semaphore admission cut exercised by the new race tests.

## Status addendum

Implementation steps 1 through 3 are complete. [The verification report](/.design/bus-smart/verification0.gpt56s.md) records the final automated matrix, added event-rate/reconnect/overflow observability, the live startup blocker, and the remaining notification-scope release decision.
