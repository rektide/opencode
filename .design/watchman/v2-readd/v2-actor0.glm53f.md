---
type: Journal
title: W3 protocol actor closeout (round 0, cancelled mid-implementation)
description: Handoff record for the cancelled W3 deterministic Watchman protocol-actor task — assignment/cancellation context, verified research retained from session context, completed actor design (mechanically derived from protocol0 §6.1/§1), planned self-test inventory, zero workspace mutations, deferred decisions, and continuation ownership.
resource: /.design/watchman/v2-readd/v2-actor0.glm53f.md
tags: [opencode, watchman, v2, w3, actor, test-fixture, closeout, handoff, research-journal]
status: draft
generated: { by: model:zai/glm-5.3-flash, at: 2026-09-05 }
verified: { by: none, at: never }
stale_after: 2026-10-05
sources:
  - id: protocol-design
    resource: /.design/watchman/v2-readd/v2-protocol0.glm53max.md
    title: Watchman v2 re-add protocol journal (round 0, W3-W5 focus) — authoritative actor design, §6.1 + §1
    author: model:zai/glm-5.3-max
    last_modified: 2026-09-05
  - id: work-plan
    resource: /.design/watchman/v2-readd/v2-readd3.gpt56solxh.md
    title: Watchman v2 carry-first build work plan (v2-readd3), W3 section
    author: model:openai/gpt-5.6-sol-xhigh
    last_modified: 2026-09-05
  - id: prior-journal
    resource: /.design/watchman/v2-readd/v2-execution0.glm53f.md
    title: execution0 — W0 preflight and W1 seam/verification journal (same model, earlier same day)
    author: model:zai/glm-5.3-flash
    last_modified: 2026-09-05
---

# actor0 — W3 protocol actor closeout (cancelled mid-implementation)

Model: glm-5.3-flash (zai-coding-plan/glm-5.3-flash#high). This file is a
durable handoff journal: append dated addenda on continuation; never overwrite
prior findings.

## Assignment and cancellation context

- **Assignment** (from parent session): implement a deterministic raw Watchman
  client actor under `packages/core/test/filesystem/fixture/watchman/` in the
  active rebuild workspace `/home/rektide/src/opencode-watchman-v2-readd`,
  plus focused actor self-tests if useful. Named synchronization for
  construction/listeners/ordered commands, full payload assertions,
  held/late responses, callback failure, unilateral subscription PDU, socket
  error/end, termination; `capabilityCheck` traversing the real command queue.
  No fixed sleeps — Effect Deferred/queues or promises compatible with
  `@superbfowle/fb-watchman-esm`'s client shape. Do not touch W2 owner files
  or production Watchman backend files (none exist yet). Run only focused new
  tests + `packages/core` typecheck. Journal here (`actor0.glm53f.md`);
  never write journals into the rebuild. Do not commit.
- **Role clarification** (mid-task): I am F; GX owns design. The authoritative
  actor/protocol contract is
  [`protocol0.glm53max.md`](/.design/watchman/v2-readd/v2-protocol0.glm53max.md)
  (§6.1 actor shape + §1 transport facts). Mechanical implementation/testing
  only; ambiguities get journaled, not decided.
- **Cancellation** (mid-task, before any file writes): close out with
  documentation only; no inspect/edit/test/format/revert/commit in the active
  rebuild workspace; SX replacement owns continuation.

## Workspace state observed (before cancellation; nothing mutated by me)

- jj log in the rebuild: `@` = `tlpyywtx` (empty, no description), parent
  `ornkqwlk` = W1 `refactor(core): make watcher readiness generation-aware`,
  then `pxuvrknr` (docs plan copy), base `qtrmrown` `4306c07b` (v2@origin).
  `jj status`: clean. W2/W3/W4+ unstarted.
- `packages/core/test/filesystem/fixture/watchman/` does **not** exist —
  W3 targets are genuinely new files.
- Production `src/filesystem/watcher/watchman/**` does **not** exist (W4 is
  later in the commit stack), so the actor **cannot type-import production
  `RawClient`/`RawClientFactory`** — it must define them locally (structural).

## Files/changes made before cancellation

**None.** Cancellation arrived during design, before the first `write` to
`packages/core/test/filesystem/fixture/watchman/client.ts`. No edits, no test
runs, no typecheck runs, no commits. The active rebuild workspace is exactly
as observed above. The only file this task produced is this journal.

## Research retained (verified this session; safe for SX to rely on)

All read-only, from the rebuild workspace + effect-smol reference checkout:

- **Rebuild conventions**: effect `4.0.0-rc.112` (catalog). Test helper
  `testEffect`/`it` at `packages/core/test/lib/effect.ts` — its `it.effect`
  provides TestClock + TestConsole env; actor self-tests need no layers, so
  `import { it } from "../lib/effect"` from `test/filesystem/` is the right
  shape (donor used the same relative path). Local TestClock idioms:
  `TestClock.adjust("1 millis")` (duration strings), `TestClock.setTime`.
  `Effect.timeoutOrElse` exists in rc.112. `Deferred` API verified in rc.112:
  `makeUnsafe<A,E>()`, `succeed`, `fail`, `done`, `await`, `isDoneUnsafe`
  (dual data-first/data-last).
- **tsconfig.tests.json** includes `test/`; `noUncheckedIndexedAccess: false`
  (plain array indexing yields `T`, no `!` needed). Test tree uses
  extensionless relative imports (`"../lib/effect"`). Tests run from
  `packages/core` only (`do-not-run-tests-from-root` guard):
  `bun test test/filesystem/watchman-actor.test.ts`; typecheck
  `bun typecheck` (tsgo).
- **Donor shape reference**:
  `opencode-watchman-old/packages/core/src/filesystem/watcher/watchman/client.ts`
  lines 11-21 define the duck type (`end`, `command(args, cb)`,
  `capabilityCheck({required}, cb)`, `on(event, listener)`, factory `() => RawClient`);
  donor `test/filesystem/watchman-root.test.ts` lines 11-64 show the TestClient
  idiom the actor replaces with Deferred barriers.
- **Transport facts pinned by protocol0 §1** (source-verified by GX; I relied
  on them as contract): lazy connect on first `command()`; strictly serialized
  FIFO, one in-flight command, next dispatched only after previous response
  processed; `subscription`/`log` tagged PDUs are unilateral and bypass the
  queue; socket `end` → `cancelCommands("The watchman connection was closed")`
  then `end` event; `end()` cancels queued+current with
  `Error("The watchman client was ended")` and does NOT emit `end`;
  `capabilityCheck` issues `["version", {optional, required}]` through the
  normal queue and post-processes (missing required cap → callback error with
  `.watchmanResponse`).

## Actor design completed (mechanical derivation from protocol0 §6.1; unwritten)

The exported surface is exactly protocol0 §6.1's sketch — `ScriptedCommand`
(`index`, `args`, `respond`, `fail`, `hold`), `ScriptedClient` (raw surface +
`awaitCommand`, `listeners`, `emitSubscription`, `emitError`, `emitEnd`,
`emitConnect`, `ended`, `transcript`, `expectTranscript`), `ScriptedHarness`
(`factory`, `clients`, `constructions`), `makeHarness({script?,
failConstructions?})`. Implementation decisions SX needs (all derived from
§6.1 rules + §1; flagged items are my approximations → deferred list below):

1. **Queue mechanics (§1.2 fidelity)**: `command()`/`capabilityCheck()` push
   `{args, callback}` onto a FIFO queue; `pump()` dispatches the head only
   when no command is in flight. Recording (transcript push + arrival
   Deferred completion + script check) happens **at dispatch**, so transcript
   order = wire order = index order, and a held command 0 blocks arrival of
   command 1 — the determinism primitive for "stop before and after each
   command". `settle` invokes the callback then pumps, mirroring the
   transport's send-next-after-value-event ordering.
2. **Settle/late-response fencing**: each dispatched command carries a
   `settled` flag; `respond`/`fail` after settle (or after `end()` cancel) is
   a silent no-op — mirrors the transport nulling `currentCommand` and §5.1
   late-callback semantics. `end()` increments `ended()`, cancels queued +
   in-flight callbacks with `Error("The watchman client was ended")`, marks
   them settled, and does NOT emit `"end"` (§1.1).
3. **Arrival barriers**: `Deferred.makeUnsafe<ScriptedCommand>()` grown per
   index on demand, completed via `Effect.runSync(Deferred.succeed(d, record))`
   (pure in-memory, safe in sync dispatch context). Implicit
   `awaitCommand()` waits an internal cursor and advances it; explicit
   `awaitCommand(i)` waits `arrivals[i]` without touching the cursor (mixing
   caveat → deferred list).
4. **capabilityCheck through the queue (§6.1 rule 2)**: dispatches
   `["version", { optional: caps.optional ?? [], required: caps.required }]`
   as a normal queued command; the capability callback is a post-processor:
   command error → cb(error); response with `error` key → Error with
   `.watchmanResponse` attached; missing required capability → Error with
   `.watchmanResponse`; else cb(null, response). Old-server
   version→capabilities synthesis deliberately omitted.
5. **Script checking (§6.1 rule 3)**: at dispatch, `script[i]` deep-equal via
   `expect(args, "Watchman command #i").toEqual(expected)` (bun diff); index
   beyond script length throws with a diagnostic naming the command and the
   script length. The throw propagates synchronously into the caller
   (production code inside `Effect.callback` construction) and surfaces as an
   Effect defect — fail fast. Without `script`, `expectTranscript` at test end
   is the drift catch; the §6.1 "awaitCommand that never arrives" escape is
   `Effect.timeoutOrElse` + `TestClock.adjust` on the barrier.
6. **hold()**: sets an internal `held` marker on the in-flight record; the
   hold itself is realized by *not* calling respond/fail. `held` is not part
   of the exported type (contract-fixed surface).
7. **Local types**: fixture defines `RawClient`/`RawClientFactory`
   structurally (donor client.ts 11-21 as shape source). W4's production types
   must stay structurally identical so the actor passes duck-type checks.
8. **Planned file layout**: fixture `client.ts` (per plan W3 file list);
   self-tests at `packages/core/test/filesystem/watchman-actor.test.ts`
   ("beside the W4 suite" per §6.1).

## Planned self-test inventory (unwritten)

Barrier serialization (hold 0 blocks 1, proven via transcript length — no
sleeps; respond unblocks); capabilityCheck transcript shows the `version` PDU
and full payloads; `expectTranscript` pass/fail-diff; script mismatch throw;
beyond-script-length throw; `fail(error)` callback delivery; `emitSubscription`
fan-out incl. multiple listeners and no name filtering (actor does not filter);
`emitError`/`emitEnd`/`emitConnect` dispatch + `listeners()` counts before/
after registration; `end()` cancels held + queued commands with the
ended-error and emits no `"end"` event; late `respond` after `end()` is a
no-op with `ended()` stable; `awaitCommand` on a never-arriving index escaped
via `Effect.timeoutOrElse` + `TestClock.adjust` (documents the §6.1 rule 3
pattern). Not testable at W3: the held-response + `commandTimeoutMs` timeout
dance — that needs production `admitted()` (W5) and uses this actor.

## Commands/tests run and exact results

**None.** Cancellation preceded all writes; no focused test run and no
`bun typecheck` ever executed for this task. Planned (for SX, from
`packages/core`):

```sh
bun test test/filesystem/watchman-actor.test.ts
bun typecheck
```

## Incomplete or suspect work

- Everything is unwritten; the design above is unvalidated by compiler or
  tests. Highest-risk details for SX: (a) the script-check throw escaping
  through `pump()` into the caller (verify it surfaces as a usable defect and
  does not leave queue state confusingly half-dispatched — recommend the
  throw happen before `current` is set or before the arrival Deferred
  completes, so a script failure doesn't strand a "waiting" barrier);
  (b) `Effect.runSync(Deferred.succeed(...))` inside dispatch (verify no
  re-entrancy surprise if the resumed waiter submits commands synchronously);
  (c) post-end submission semantics (below).
- Design was worked out only to the point of writing; nothing was committed
  to disk or memory beyond this journal.

## Decisions deferred to GX (SX: journal, do not decide)

1. Post-`end()` submission semantics: my approximation fails such commands
   immediately with `Error("The watchman client was ended")`; the real
   transport's post-end path is murky (half-closed socket, nulled bunser).
   Well-formed W4/W5 tests never submit after close (generation fenced), so
   this only matters for hostile tests.
2. capabilityCheck failure message text and whether attaching a
   `.watchmanResponse` property to plain `Error`s is the desired fidelity
   level (exact transport prose was not reproduced).
3. `awaitCommand()` implicit-cursor vs explicit-index mixing semantics (my
   rule: implicit advances the cursor, explicit doesn't; mixed usage can
   desync — tests should pick one style).
4. `hold()` marker surfacing (currently internal-only; could appear in
   transcript diagnostics if GX wants it).
5. Script over/under-length strictness wording and whether `expectTranscript`
   should also compare length-only fast-path diagnostics.
6. Self-test location: `test/filesystem/watchman-actor.test.ts` (my choice,
   "beside the W4 suite") vs inside the fixture dir — §6.1 allows either.

## Continuation ownership

**The SX replacement owns continuation of W3** from this journal + GX's
[`protocol0.glm53max.md`](/.design/watchman/v2-readd/v2-protocol0.glm53max.md)
§6.1. I (F, this session) retain no further work and will not touch the
rebuild workspace or this topic again. SX should re-verify the workspace
state (it may have moved since my observation) and treat section "Actor
design completed" as an implementation sketch to validate against the
protocol contract, not as settled design.
