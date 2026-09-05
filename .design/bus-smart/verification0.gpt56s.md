---
type: Report
title: Controlled event feed verification
description: Verification state, observability coverage, and remaining release gates for the controlled SSE implementation.
resource: /design/bus-smart/verification0
tags: [server, events, tui, client, verification, observability]
status: draft
generated: { by: "agent:gpt-5.6-sol", at: 2026-09-01 }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: directional-design
    resource: /design/bus-smart/draft0
    title: Controlled event feed directional draft
  - id: closeout-plan
    resource: /design/bus-smart/implementation-plan0
    title: Controlled event feed implementation closeout
---

# Controlled event feed verification

## Closeout changes

The implementation now includes the acceptance work that followed the initial vertical slice:

1. The controlled TUI fixture proves persisted tab roots are installed in the first pre-connected PUT.
2. A real prompt fixture proves first execution waits for the optimistic Session interest PUT to succeed.
3. Core interruption tests cover runner, cancellation-bearing immediate, and no-cancellation immediate move publication.
4. Client diagnostics count received domain events and stream reconnections for the controller lifetime without a reactive write per event.
5. Controlled and legacy Server feeds emit exact structured overflow warnings. Controlled warnings identify affected subscription IDs; both modes report per-operation and cumulative counts.
6. The developer Server panel samples event rate and shows cumulative arrivals, cumulative reconnects, and the current retry attempt.
7. Debug snapshots now preserve event rate, received count, reconnect count, retry attempt, CPU, memory, and event-loop p99.

Exact overflow attribution remains server-side because a full SSE queue cannot carry an overflow frame. Making it TUI-visible would require a new cross-process diagnostic contract; reconnect count is not treated as an overflow proxy.

## Automated verification

| Area | Result |
| --- | --- |
| Core Bus routing | 65 tests passed across `bus.test.ts` and `bus-session-routing.test.ts` |
| Core move paths | 5 `session-move` tests and 180 `session-runner` tests passed |
| Core typecheck | Passed |
| Protocol contract | 5 event tests, generated OpenAPI check, and typecheck passed |
| Server feeds | 13 controlled-feed tests, 6 legacy-feed tests, and the controlled HTTP negotiation test passed |
| Server typecheck | Passed |
| Client | 133 tests passed with 3 expected non-browser skips; the 3 browser-condition connection tests also passed |
| Client generated surfaces | Promise and Effect generated checks passed |
| Client typecheck | Passed |
| TUI focused coverage | Tab activation, optimistic prompt ordering, reconnect diagnostics, rate calculation, and both complete affected renderer files passed |
| TUI typecheck | Passed |
| TUI full suite | 996 passed and 4 skipped; one timing-sensitive title fixture failed in the full run and passed immediately in isolation |
| Effect-pattern lint | All touched production files passed; the repository-wide scan still reports 26 unrelated baseline violations |

The transient full-suite TUI failure was `session title generated while an untitled session is loading remains visible`. Its isolated rerun passed with the expected generated title. Earlier parallel acceptance runs also exposed package-fixture timing failures, all of which passed in isolation; the final non-parallel Client run was fully green.

## Live acceptance

A fresh dedicated `termctrl` session started the worktree standalone command, but startup remained in the machine-wide reference/skill refresh path and never reached the OpenTUI framebuffer. The session was stopped cleanly. This reproduces the existing environment blocker rather than a controlled-feed connection failure.

When the startup environment is stable, record one matching-server and one older-server run:

- matching server: controlled mode, desired and installed interests converged, event rate, cumulative received events, CPU, event-loop p99, reconnect count, and no feed error;
- older server: explicit legacy mode with a functional event stream and retained desired interest;
- Server logs: no `event feed subscriber overflow` warning during the reproduction, or exact structured count and mode if one occurs.

## Release gates

Two gates remain:

1. **Notification scope.** Choose Location/project, tracked Session families, or a separate server-wide attention channel. No accidental selection has been implemented.
2. **Live before/after record.** Capture the two-project reproduction once the machine-wide watcher/reference startup path permits framebuffer testing.

The transport, routing, move guarantees, client negotiation, TUI interest ownership, bounds, and automated observability oracles are otherwise implemented.

## Cross-references

- [Directional design](/.design/bus-smart/draft0.gpt56s.md) defines the normative ordering and acceptance requirements this report evaluates.
- [Closeout plan](/.design/bus-smart/implementation-plan0.gpt56s.md) records the implementation sequence completed after the initial audit.
- [TUI interest research](/.design/bus-smart/research-tui-interest0.glm53.md) explains why launch, route, tab, and Session-family interests are owned declaratively.
- [Client compatibility research](/.design/bus-smart/research-client-compat0.glm53.md) grounds controlled probing and older-server fallback behavior.
- [EventFeed Effect research](/.design/bus-smart/research-eventfeed-effect0.glm53.md) grounds the serialized admission cut and bounded queue behavior.

# Port to v2@origin (2026-09-05)

The full 38-commit stack was rebased from its original base (`lmpvpwvxrwvv`, #46171) onto the `v2@origin` tip `lwoszptrpqvn` (#47464), spanning 376 upstream commits. All sixteen code commits were hand-merged; the design-doc commits rebased cleanly.

## Upstream drift that required semantic adaptation

1. **`Session.move` extraction.** Upstream moved the inline `Session.move` implementation into `packages/core/src/session/move.ts` and refined its idle-recovery condition (#46955). The immediate-move notification fix (`bus.publishAll([moved])` when no cancellations exist) now lives in the extracted file instead of `session.ts`.
2. **Promise client `SharedEvents` wrapper.** Upstream added `packages/client/src/promise/client.ts`, which wraps the generated client and replaced `event` with a shared-events instance, dropping the generated `event.controlled` surface. The wrapper now spreads `raw.event` and overrides only `subscribe`, so controlled negotiation survives alongside shared legacy subscriptions. The Effect wrapper already spread `raw.event` and needed no change.
3. **`app.tsx` provider tree.** `EventInterestProvider` still wraps `SessionTerminalsProvider`; upstream's new `UpdateNotificationProvider` + `PanelProvider` layers nest inside `AttentionProvider` below it.
4. **Shared TUI app fixture.** Upstream extracted `createAppFixture` into `packages/tui/test/fixture/app.ts`. The `controlled` interest-callback option and its `createFetch` passthrough moved into the shared fixture; `app-lifecycle.test.tsx` keeps upstream's expanded suite.
5. **Session-runner scenario absorption.** Upstream folded the old "preserves a tool continuation across a steered move" scenario into the parameterized chained-moves loop. The routed-observation interruption scenario re-anchored after that loop; its assertions are unchanged.
6. **Generated client surfaces.** Conflicts in generated files were resolved by re-running `bun run generate` from `packages/client` mid-stack; a final regeneration at the tip produced no drift.

## Re-verification on the new base

| Area | Result |
| --- | --- |
| Typecheck | protocol, core, server, client, tui, sdk, plugin all pass |
| Core Bus routing | 65 tests passed (`bus.test.ts`, `bus-session-routing.test.ts`) |
| Core move paths | 19 `session-move` and 203 `session-runner` tests passed |
| Protocol contract | 5 event tests passed; regeneration produced no diff |
| Server feeds | 20 tests passed (controlled, controlled HTTP negotiation, legacy) |
| Client | 54 passed with 3 expected non-browser skips; 28 contract/boundary/service/shared-events tests passed |
| TUI focused | 50 tests across interest/devtools/use-event/session-tabs and 32 `app-lifecycle` tests passed |

The two release gates above (notification scope decision, live before/after record) are unchanged by the port and remain open.
