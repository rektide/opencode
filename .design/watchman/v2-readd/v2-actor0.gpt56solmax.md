---
type: Journal
title: W3 deterministic Watchman protocol actor implementation
description: Implementation and review record for the fixture-only raw Watchman client actor, its deterministic synchronization controls, and focused self-tests.
resource: /.design/watchman/v2-readd/v2-actor0.gpt56solmax.md
tags: [opencode, watchman, v2, w3, actor, test-fixture, implementation-journal]
status: stable
generated: { by: model:openai/gpt-5.6-sol-max, at: 2026-09-05 }
verified: { by: model:openai/gpt-5.6-sol-max, at: 2026-09-05 }
stale_after: 2026-10-05
sources:
  - id: protocol-design
    resource: /.design/watchman/v2-readd/v2-protocol0.glm53max.md
    title: Watchman v2 re-add protocol journal (round 0, W3-W5 focus)
    author: model:zai/glm-5.3-max
    last_modified: 2026-09-05
  - id: work-plan
    resource: file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd3.gpt56solxh.md
    title: Watchman v2 carry-first build work plan
    author: model:openai/gpt-5.6-sol-xhigh
    last_modified: 2026-09-05
  - id: cancelled-actor-closeout
    resource: /.design/watchman/v2-readd/v2-actor0.glm53f.md
    title: W3 protocol actor closeout (cancelled mid-implementation)
    author: model:zai/glm-5.3-flash
    last_modified: 2026-09-05
---

# W3 deterministic Watchman protocol actor implementation

## Scope and starting state

Implemented W3 only in the active rebuild workspace
`/home/rektide/src/opencode-watchman-v2-readd`. Before editing, I inspected the
entire working-copy status and diff. The pre-existing uncommitted changes were
W2 owner work in Config, watcher test support, and focused owner tests. I did
not modify those files or any production backend module.

The cancelled F actor's closeout confirms it changed no rebuild file. Its
useful evidence was design-only: local structural raw-client types are required
until W4 exists, the real transport has one FIFO in-flight command, remote
`end` cancels commands before emitting the event, local `end()` cancels without
emitting `end`, and `capabilityCheck` submits a normal `version` command.

## Files added

- `packages/core/test/filesystem/fixture/watchman/client.ts`
- `packages/core/test/filesystem/watchman-actor.test.ts`

No commit was created.

## Actor design

### Structural transport seam

The fixture defines local `RawClient` and `RawClientFactory` types matching the
donor/transport duck type. W4 can pass `actor.factory` directly to its injected
production factory seam without making W3 depend on not-yet-existing production
modules.

`makeWatchmanActor` supports either free-form control or a strict per-client
construction plan. A plan can describe a client and its complete ordered
command payloads, or an expected synchronous construction failure. Per-client
plans are more useful than one global script once W5 creates replacement
generations and W6 admits several roots concurrently.

### Deterministic synchronization

Effect `Deferred.makeUnsafe`/`Deferred.doneUnsafe` barriers expose:

- construction attempt and result by index;
- listener registration by event and occurrence;
- wire-visible command arrival by FIFO index;
- command callback completion;
- client termination by occurrence.

A monotonic actor sequence stamps construction, listeners, commands, replies,
loss, and termination. `assertListenersBefore` and
`listenersBeforeFirstCommand` therefore prove registration happened before the
first command rather than merely checking eventual listener counts.

The actor snapshots complete command arguments with `structuredClone`. It
keeps submitted commands separate from the wire transcript, dispatches exactly
one command at a time, and advances only after response, callback failure, or
transport cancellation. `nextCommand(expected)` combines the ordered barrier
with a complete deep payload comparison; `awaitCommand(index)` remains an
explicit absolute-index primitive. This avoids F's implicit/explicit cursor
mixing ambiguity.

Strict scripts fail on payload mismatch or extra/duplicate dispatch, while
`assertComplete` detects missing submissions, commands blocked before wire
arrival, unfinished callbacks, and missing/extra constructions. Diagnostics
name client and command indices and print complete expected/received payloads.

### Protocol and lifecycle controls

- `capabilityCheck` creates `['version', { optional, required }]` through the
  same raw FIFO as `command`; it is visible in the transcript and blocks later
  commands until replied to.
- `hold` marks and retains the active callback for TestClock-driven W5 tests.
- `respond` and `fail` complete the callback and admit the next command.
- `emitSubscription` and `emitLog` bypass the command queue and fan out to all
  registered listeners.
- `emitConnect`, `emitError`, and `emitEnd` reproduce the event controls needed
  by W4-W6. An unhandled `error` event throws, matching EventEmitter behavior.
- Remote `emitEnd` cancels active and queued callbacks with
  `The watchman connection was closed` before notifying `end` listeners.
- Local `end()` cancels callbacks with `The client was ended`, records a named
  termination barrier/count, and does not emit `end`.
- `lateRespond` is an explicitly named fault-injection operation. Normal reply
  controls reject an already-cancelled command; `lateRespond` deliberately
  invokes its callback a second time after loss so W5 can prove Effect's
  callback/generation fence ignores a zombie response.

## Decisions relative to GX and F

1. **Kept GX's queue semantics and complete command transcripts.** The actor
   records dispatch/wire order, not mere API submission order, so a held command
   prevents the next arrival exactly like the transport.
2. **Generalized GX's single `script` into a construction plan.** This adds
   strict generation/construction count and expected-failure coverage needed by
   W5-W6 while retaining free-form use for dynamically generated payloads.
3. **Used `Deferred.doneUnsafe`, not F's proposed `Effect.runSync`.** This is
   the direct Effect v4 low-level completion API and avoids an unnecessary
   nested runtime. Valid commands become active before their arrival barrier is
   completed, avoiding a waiter re-entrancy race. Script-invalid commands
   complete their diagnostic arrival barrier but are never installed as the
   active command, avoiding F's half-dispatched-state concern.
4. **Resolved termination fidelity and late injection separately.** Unlike the
   first local draft and unlike F's late-no-op sketch, normal `end` behavior now
   faithfully cancels callbacks. The separate `lateRespond` control preserves
   GX's requirement to actually exercise a late callback rather than merely
   assert that the fake suppressed it.
5. **Did not emulate old-server capability synthesis.** This follows GX's
   recommendation. Command-level errors use `fail`; typed capability response
   validation remains W4's production boundary. The self-test intentionally
   avoids the deleted `relative_root` policy.
6. **Surfaced `hold` state and split command APIs.** `state()` makes held work
   diagnostic, while `nextCommand(expected)` and `awaitCommand(index)` make
   cursor behavior explicit.
7. **Kept post-`end()` submission outside policy.** The actor does not invent a
   permanent-ended state; well-formed production generations are fenced and a
   strict plan reports any unexpected later command. This avoids encoding F's
   acknowledged guess into W3.
8. **Placed self-tests beside the future W4 suite.** This matches the work plan
   and keeps fixture implementation separate from its conformance tests.

## Focused proof

From `packages/core`:

```text
bun test test/filesystem/watchman-actor.test.ts
3 pass, 0 fail, 32 expect() calls

bun typecheck
tsgo -b tsconfig.json tsconfig.tests.json
exit 0
```

From repository root:

```text
node_modules/.bin/prettier --write \
  packages/core/test/filesystem/fixture/watchman/client.ts \
  packages/core/test/filesystem/watchman-actor.test.ts
both unchanged after final formatting

node_modules/.bin/oxlint \
  packages/core/test/filesystem/fixture/watchman/client.ts \
  packages/core/test/filesystem/watchman-actor.test.ts
0 warnings, 0 errors
```

The self-tests prove construction success/failure barriers, repeated listener
barriers and fan-out, listener-before-command ordering, full payload checks,
FIFO blocking, capability/version queueing, callback success/failure, held
commands, unilateral PDUs while a command is pending, socket error/end,
transport cancellation, termination without an extra end event, explicit late
callback injection, and mismatch/duplicate/missing diagnostics. There are no
fixed sleeps or production imports.

## Remaining risks for W4-W6

- Production `RawClient` does not exist yet. Compatibility is structural and
  typechecked only against the source-verified donor shape; W4 should either
  keep that shape exact or add a compile-time `satisfies` use at its injection
  point.
- This is a controller actor, not a BSER/socket/discovery emulator. It does not
  model lazy socket discovery, binary spawning, framing, or old-server
  capability synthesis; live transport coverage remains W9.
- `lateRespond` deliberately violates normal transport callback-at-most-once
  behavior. It is narrowly named and guarded by a prior disruption so tests do
  not accidentally use it as an ordinary response path.
- A never-arriving command barrier necessarily waits until the test either
  completes the strict script assertion or bounds the wait with Effect timeout
  plus TestClock. The actor contains no real-time deadline by design.
- Post-termination command submission is intentionally not assigned policy in
  W3. W5 should prove the production generation fence prevents it; strict plans
  make an occurrence fail visibly.
