---
type: Evidence
title: E12 Scope-free Watchman lifecycle proof attempt
description: Pinned ownership, interruption, joining, and release-latency evidence for the v4 Native subscription shape.
resource: /.design/watchman/v2-readd/v2-readd4-e12-lifecycle0.gpt56solmax.md
tags: [opencode, watchman, v2, lifecycle, effect, rcmap]
status: stable
generated: { by: model:openai/gpt-5.6-sol-max, at: 2026-09-05 }
verified: { by: model:openai/gpt-5.6-sol-max, at: 2026-09-05 }
stale_after: 2026-10-05
sources:
  - { id: v4, resource: "file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md", title: Watchman v2 re-add v4 }
  - { id: opencode, resource: "https://github.com/anomalyco/opencode/commit/4306c07b340b9a0504e65785f366d2793cd1b169", title: OpenCode carrier base }
  - { id: effect, resource: "https://github.com/Effect-TS/effect/tree/2600f62f4532026928454dcea8d1c48557b3f942", title: effect 4.0.0-rc.112 }
  - { id: donor, resource: "/packages/core/src/filesystem/watcher/watchman/", title: Donor Watchman implementation }
  - { id: transport, resource: "file:///home/rektide/src/watchman-esm/watchman/node/index.js", title: ESM Watchman transport }
---

# E12 Scope-free Watchman lifecycle proof attempt

## Proof status

**Not proven: Effect 4.0.0-rc.112 and the current `RcMap` do join an in-flight lookup and await a successfully returned Native subscription's `unsubscribe` Promise, but v4 has no production composition that owns pre-return controller/sentinel/client work or captures the backend scope, the donor leaves best-effort `unsubscribe` in a detached fiber, and the raw transport neither cancels nor joins socket discovery/socket shutdown, so neither a no-survivor result nor v4's single-command-timeout release bound follows from the available source.**

## Pinned evidence boundary

| Source | Pin actually inspected | Working-copy qualification |
| --- | --- | --- |
| OpenCode upstream | `4306c07b340b9a0504e65785f366d2793cd1b169` | `/home/rektide/a/a/opencode` was at later `e70d667a` with two generated declarations added; all upstream claims here came from `git show 4306c07b:…`, not that checkout's working tree. |
| Carrier | base `4306c07b`; committed W1 parent `620fc620b67f774579835006846f53c55cead235`; current working-copy commit `e77301b44188` | W1 is committed and changes only generic readiness/invalidation plus its watcher test. The Watchman actor's two files are **uncommitted**. Other uncommitted W2/config/test edits were excluded. No production `packages/core/src/filesystem/watcher/watchman/` exists. |
| Effect | npm `effect@4.0.0-rc.112`, tag commit `2600f62f4532026928454dcea8d1c48557b3f942` | `/home/rektide/a/Effect-TS/effect` was clean at later `96ced895`; exact claims came from the rc.112 Git object. Both carrier and donor lockfiles pin rc.112. |
| Donor | jj working tree `a9d3d5abb792`, parent `cb7cba92e23d` | Only three design documents were modified; the cited Watchman production files were byte-identical to the parent. |
| Transport fork | `@superbfowle/fb-watchman-esm@3.0.0`; clean jj tree `8ed9bbf44fec`, content parent `3a463955acf6` | Runtime and declarations were inspected directly under `/home/rektide/src/watchman-esm/watchman/node/`. |

The carrier's committed W1 preserves the upstream ownership chain while adding
`NativeSignal.invalidation`; its test proves shared subscribers finish readiness
before a later update and that the final consumer invokes a fast fake
`unsubscribe` once. The uncommitted actor proves a scripted FIFO and synchronous
fake `end()`/callback behavior, but explicitly does not emulate binary discovery,
socket lifecycle, or a production controller. Neither artifact implements E12.

## The ownership the current watcher actually supplies

The current source establishes this scope tree, independently of v4:

```text
Watcher layer scope
└─ RcMap (one entry per structurally equal physical key)
   └─ entry.scope (one per key)
      ├─ PubSub finalizer
      ├─ lookup-fiber interruption finalizer while lookup is pending
      └─ Native Subscription finalizer, but only after Native.subscribe succeeds
          └─ await subscription.unsubscribe() Promise
```

The exact path is:

1. A returned `Stream` is lazy. Consumption reaches `RcMap.get`, which creates
   or retains an entry and registers one reference-release finalizer in that
   consumer's current scope.
2. The first `get` starts the lookup in a separate fiber, gives it the entry's
   closeable scope as its `Scope` service, and attaches the fiber to that scope.
   Equal-key callers share both the in-progress `Deferred` and the acquired
   value.
3. One consumer ending only decrements `refCount`. With another reference, no
   physical release occurs. The last reference closes the entry immediately
   because OpenCode supplies no idle TTL and rc.112 defaults it to zero.
4. Layer shutdown marks the `RcMap` closed and closes every entry scope even if
   references remain. The entries are closed sequentially (`Effect.forEach`
   defaults to concurrency `1`).
5. OpenCode's lookup acquires the PubSub, then wraps `native.subscribe` in
   `Effect.acquireRelease(..., { interruptible: true })`. After a successful
   return, entry closure runs `Effect.promise(() =>
   subscription.unsubscribe())`, ignores its cause, and only then logs stopped.
   There is no timeout around that Promise.
6. Before `native.subscribe` returns, no Native release finalizer exists.
   Entry closure instead interrupts and joins the lookup fiber. Only cleanup
   already registered *inside* the Native acquisition participates.

The last point is the exact pre-return boundary. V4 installs the symlink sentinel
before shared acquisition and does not return the Native `Subscription` until
`subscribe` acknowledgement. Thus a sentinel, acquisition/probe, generation,
raw client, command callback, and local route can all exist while OpenCode has
only an interruptible acquisition—not the returned stop/join handle. No carrier
source defines their internal ownership during that interval.

## Resource ownership ledger

“Established” means source establishes the whole row; “declared” means v4 names
the role but no carrier code realizes it.

| Resource | Creator | Owner | Finalizer / stop | Joiner | Fence | Evidence status |
| --- | --- | --- | --- | --- | --- | --- |
| `RcMap` entry | First consumed equal-key stream | Entry scope under the watcher layer | Last reference with zero TTL or map shutdown closes `entry.scope` | `Scope.close(entry.scope)` | Entry identity, refcount, map `Closed` state | Established by rc.112 and upstream. |
| PubSub | Watcher lookup | Entry scope | `PubSub.shutdown` | Entry-scope closure | PubSub shutdown state | Established. |
| Pending lookup | `RcMap.get` | Lookup fiber attached to `entry.scope` | Scope requests interruption | `Fiber.interrupt` finalizer waits for fiber exit | Interrupted fiber and lookup `Deferred` exit | Established. |
| Directory supervisor | v4 `Native.subscribe` | V4 says one logical demand lifetime | Resolve stop; clean up; return only after `Fiber.join` | Returned `Subscription.unsubscribe()` Promise | Absorbing `Released`, target epoch | Declared only; start point, fork kind, pre-return finalizer, and backend-shutdown attachment are absent. |
| Symlink sentinel | Controller calls inherited Node `entries` Native | Controller | Sentinel subscription's `unsubscribe`, which invokes `FSWatcher.close()` | Controller cleanup only; Node close is not awaited | `Released` plus target epoch/mailbox check | Declared only; donor has no such sentinel. Current Node wrapper returns an already-resolved Promise after calling `close`. |
| Circuit/admission waiter | Controller calls `acquisition.acquire` | Calling controller fiber; coordinator only stores callback/gate state | Interrupt `Deferred.await` or semaphore wait | Controller join / lookup-fiber interruption | Circuit epoch and candidate validity | Donor mechanism established; carrier composition absent. |
| Active half-open probe | The first waiter after `ready` claims `HalfOpen` | Calling controller fiber; coordinator does not fork the work | `onExit(abandon)` reopens if the candidate still owns the epoch | Controller join | Half-open epoch/candidate identity | Donor mechanism established; carrier composition absent. |
| Shared circuit sleep | `open` transition | Scope captured when coordinator is constructed | `forkIn(scope)` interruption; `Effect.sleep` clears its timer | Scope closure waits for timer fiber interruption | Circuit epoch; a stale gate cannot mutate a newer epoch | Donor mechanism established. It is backend-scoped only if v4 construction actually receives the backend layer scope, which is not implemented. |
| Root retry sleep | Controller retry loop | Controller fiber | Fiber interruption; `Effect.sleep` clears timer | Controller join | `Released` and target epoch | Declared only. |
| Generation and local routes | Successful client construction / attach | Controller generation | Idempotent generation close; route removal; `client.end()` | Controller join for Effect work; no raw close join | `generation.closed`, generation-stamped route name, route absence | Donor mechanics support the fences; final v4 ordering has no implementation. |
| Submitted command | Command wrapper after command permit | Detached `execute` fiber, synchronously joined by an uninterruptible caller section; raw client owns FIFO slot | Callback, `generation.closed`, or command timeout; permit released on exit | Uninterruptible caller joins `execute`, then controller joins caller | Effect callback resume-once flag plus `generation.closed` | Established in donor client code, not carrier-composed. |
| Command-timeout timer | Submitted command's response race | Detached `execute` fiber | Race completion/interruption clears `Effect.sleep` timer | `execute` completion | Callback/closed/timeout first exit | Established in rc.112 + donor. |
| Best-effort daemon `unsubscribe` | Donor `detach` | A global `Effect.runFork` fiber, not controller or entry scope | Response, generation close, or timeout | **No joiner in donor** | Generation fence only | Established counterexample to a no-Effect-fiber-survivor claim if carried literally. |
| Raw client socket | Transport `makeSock` | Raw `Client` object / Node runtime | `client.end()` calls `socket.end()` and drops its field | **None**; `end()` returns `void` | No terminal-ended flag; v4 generation fence blocks well-formed later submission | Raw transport fact; no close acknowledgement or duration bound. |
| `watchman get-sockname` child | Transport `connect` when `WATCHMAN_SOCK` is absent | Local closure/event loop | No cancellation from `client.end()`; process is not retained on the client | **None** | Generation's late-`connect` listener can end a socket only after discovery succeeds and connects | Raw transport fact; unbounded survivor case. |
| Daemon-side subscription | Watchman `UserClient` after acknowledged `subscribe` | Daemon client session | Acknowledged `unsubscribe`, or daemon `UserClient` destruction on connection loss | No client-side join of daemon destruction | Connection plus unique subscription name | Server source establishes eventual ownership, not client-observed completion after local socket `end`. |

## Release traces by controller state

These traces start at **final** equal-key demand removal. A non-final consumer
release stops at `refCount--` and intentionally retains every physical resource.

| State at final release | Source-grounded trace | What completion proves | Exact gap |
| --- | --- | --- | --- |
| `Pending` before stream consumption | Stream scope ends; no `RcMap.get`; no entry or Native work exists. | No physical resource was created. | None. |
| `Pending` after lookup starts but before controller side effects | Ref finalizer closes `entry.scope` → scope interrupts and waits for lookup fiber → PubSub finalizer runs. | The lookup effect has exited and its registered scoped resources are finalized. | V4 does not identify whether a supervisor has already been detached. |
| `Pending` after sentinel creation | Same lookup interruption path. The outer Native release is not registered because `native.subscribe` has not returned. | Only an internal sentinel finalizer, if one exists, could establish closure. | No `directory.ts` exists and v4 gives no executable pre-return bracket; therefore sentinel stop/join is unproved. |
| `Acquiring`, waiting on open circuit or admission permit | Controller/lookup interruption runs the `Deferred.await` or semaphore canceler; the waiter is removed. No command deadline was started. | No waiter remains and no new work begins from that waiter. | A shared open-circuit timer can remain under backend ownership; this is not a controller leak but falsifies a literal “no timer survives logical root release.” |
| `Acquiring`, active probe/work | Interruption propagates through coordinator work; semaphore exit releases admission; probe `onExit` executes `abandon` if its epoch remains current. | Donor composition exits the probe once its work exits. | If work has submitted a command, exit waits on the submitted-command trace. V4 has no carrier wiring that joins this from both initial release and backend shutdown. |
| `Attaching` before raw command submission | Interruption removes any command-permit waiter and unwinds attach. | No raw command was queued; permit accounting is restored. | Generation close and any pre-installed route/sentinel depend on absent controller cleanup. |
| `Attaching` after raw submission, including `subscribe` callback wait | Stop/interruption reaches a race loser, but `raceFirst` interrupts **and waits** for it. The admitted wrapper's caller section is uninterruptible and joins detached `execute`; `execute` ends on callback, generation close, or timeout. Attach unwind can then remove its route and close the generation. | The Effect command fiber and permit are gone if all named unwind actions are present. | Those unwind actions are donor fragments, not a v4 implementation. Raw child/socket shutdown is still not joined. |
| `Attached` | Entry finalizer invokes and awaits returned `unsubscribe()` → proposed stop wakes supervisor → local route is removed → generation is unsubscribed or closed → sentinel stops → supervisor join settles Promise → PubSub shutdown follows. | Current `RcMap` proves only that the Promise settled; the Promise's claimed internals require production code or a faithful test. | V4 does not define the exact unsubscribe-vs-close branch. Donor stop/join omits the detached best-effort unsubscribe from its join. |

### Named concurrent release cases

| Concurrent point | Exact lower-level behavior | E12 result |
| --- | --- | --- |
| Sentinel retarget signal already enqueued | The OpenCode wrapper only invokes `FSWatcher.close()`; it does not remove a signal already placed in the proposed controller mailbox or wait for that mailbox. V4's stated protection is serialized processing plus `Released`/target-epoch checks. | No mailbox, callback fence, or sentinel handle exists on the carrier, so release-during-retarget is not proved. If retarget already submitted a command, the submitted-command trace applies. |
| Root-local retry sleep | rc.112 live `Effect.sleep` returns an interruption canceler that calls `clearTimeout`. | A sleep actually running in the joined controller cannot survive that controller's interruption. The controller ownership is not implemented. |
| Shared circuit sleep | Donor `open` forks the sleep into the captured coordinator scope. Releasing one root removes its waiter but does not cancel this shared timer; the timer only completes a `Deferred` and cannot itself construct a client. | It may survive logical root release for the remaining capped delay. Closing the captured backend scope interrupts and joins it. The v4 backend-scope capture is unproved. |
| Circuit waiter races timer expiry | Interrupted `Deferred.await` removes its resume callback. If expiry wins, the waiter reevaluates and one may claim `HalfOpen`; the controller's own interruption and v4 `Released` fence are then the barriers before factory work. | Donor proves waiter cancellation and circuit epochs, not the missing controller/release interleaving. |
| Active half-open probe | Coordinator runs probe work in the caller; it does not detach it. On interruption, `onExit(abandon)` returns current `HalfOpen` to `Open` and installs a backend-scoped sleep. | Probe joining reduces to controller joining, except while a submitted command is uninterruptible. No carrier proof. |
| Command permit wait | `Semaphore.withPermit` waits interruptibly; its callback canceler removes the waiter. The outer race with `generation.closed` also ends the wait. Timeout has not started. | No daemon-dependent release latency and no queued raw command at this point. |
| Already-submitted callback wait | Caller interruption is deferred by `Effect.uninterruptible`. The detached `execute` fiber remains joined and races response/timeout against `generation.closed`; `Effect.callback` ignores every resume after the first or after interruption. The raw registration supplies no cancellation effect. | One command unit is bounded by its remaining Effect-clock timeout only if the timeout is finite, its clock advances, and close completes. It is not canceled merely because the logical caller was interrupted. |

## Backend shutdown trace

For the composition that current `Watcher.layer` actually supplies, layer-scope
closure does the following:

1. The `RcMap` finalizer changes the map to `Closed`, then closes each current
   entry scope sequentially and waits for each close.
2. A pending entry interrupts and joins its lookup fiber. A successfully
   acquired entry invokes and awaits its Native `unsubscribe` Promise.
3. Any fibers actually registered with that scope are interrupted and joined;
   their `Effect.sleep` timers are cleared.
4. Entry closure finishes only after all of its finalizers finish. A never-settling
   `unsubscribe` Promise therefore makes layer shutdown unbounded; `ignoreCause`
   suppresses failure but does not turn non-settlement into completion.

V4 additionally assigns shared circuit timers to the backend layer, but its
`backend.make`/`directory.subscribe` snippets are expressly directional and the
carrier has neither module. There is no source establishing which concrete
scope is captured, whether the supervisor is `forkIn` that scope or detached,
or how a pre-return controller is signaled when shutdown interrupts Native
acquisition. Consequently the four steps above do not extend to v4's resources
by construction.

Even with a complete Effect-level join, `Client.end()` is not a transport join.
It synchronously errors current and queued callbacks, calls `socket.end()` when
a socket field exists, clears the field and decoder, and returns. It neither
waits for socket `close` nor cancels/awaits the `watchman --no-pretty
get-sockname` child. That child can later call `makeSock`; v4's proposed
late-`connect` listener can call `end()` after connection, but cannot bound or
join discovery that never completes. This independently blocks a process-level
“no client work survives backend shutdown” proof.

## Exact Effect and raw-callback semantics used in the trace

| Primitive at rc.112 | Exact consequence |
| --- | --- |
| `Effect.acquireRelease` | Runs acquisition under an uninterruptible mask by default; `{ interruptible: true }` restores interruption for acquisition. It registers release only after successful acquisition, with registration protected by the mask. |
| `RcMap.get` | Under an uninterruptible mask, increments/creates the entry and registers the caller-scope release; waiting for the shared lookup `Deferred` is restored to interruptible. The lookup is run in its own entry scope. |
| `Scope.close` | Marks closed before running finalizers; default scopes run finalizers sequentially in reverse registration order. In the current RcMap/layer paths it runs from an uninterruptible finalizer region. |
| `Fiber.runIn` / `Effect.forkIn` / `forkScoped` | Registers a scope finalizer that interrupts the fiber; `Fiber.interrupt` waits for fiber exit. `runIn` itself only attaches and returns. |
| `forkChild` | Parent termination interrupts the child, so a child cannot outlive a successful `Native.subscribe` acquisition merely by being a child. |
| `forkDetach` / `Effect.runFork` | Creates a daemon/root fiber with no parent/scope shutdown owner. It is owned only when another live effect explicitly joins or interrupts it. |
| `Fiber.join` | Waits and propagates the joined exit; it does not initiate interruption. Joining is itself interruptible unless enclosed by an uninterruptible/finalizer region. |
| `raceFirst` | First exit wins, then the implementation uninterruptibly interrupts **and awaits** remaining race fibers before exposing the winner. An uninterruptible loser therefore extends race latency. |
| `Semaphore.withPermit` | Permit wait is interruptible and unregisters on interruption; acquisition/release bookkeeping is masked; the permit is released on every wrapped-effect exit. |
| `Deferred.await` | Interruption removes that waiter callback from the Deferred's resume list. Completing a Deferred resumes retained waiters once. |
| `Effect.callback` | `resume` is accepted once. Interruption marks the continuation resumed, aborts a requested signal, and runs a returned canceler. Donor command registration requests no signal and returns no canceler, so Effect interruption fences the continuation but does not cancel the raw command. |
| `Effect.sleep` | Live clock uses `setTimeout` and returns `clearTimeout` as interruption cleanup. Timeout is an Effect-clock/scheduler bound, not a hard wall-clock guarantee under event-loop stall or a non-advancing test clock. |
| OpenCode release `Effect.promise` | The zero-argument thunk does not request an AbortSignal. Its underlying Promise has no RcMap-imposed deadline; the scope finalizer awaits settlement. |

Raw transport behavior at the pinned fork is equally specific:

- exactly one `currentCommand` is written; later commands remain in an array;
- remote socket `end` clears socket/decoder, synchronously cancels active and
  queued callbacks, then emits `end`;
- socket `error` only emits `error`; the generation listener is responsible for
  ending/canceling the client;
- local `Client.end()` synchronously cancels callbacks, calls `socket.end()` if
  present, and emits no `end` event;
- `Client.end()` sets no permanent ended state, removes no EventEmitter
  listeners, kills no discovery child, and returns no close Promise; and
- stock Watchman's server clears a `UserClient`'s subscriptions on client
  destruction, but the JavaScript client does not join that destruction.

## Release-latency facts

Let `T` be the finite validated `commandTimeoutMs` (v4 default `60_000 ms`) and
`B` the shared/root backoff cap (v4 provisional `2_000 ms`).

| Case | Bound established by available source |
| --- | --- |
| Circuit/permit/Deferred wait before command submission | No daemon-response bound is involved; interruption removes the waiter cooperatively. There is no numeric wall-clock bound on scheduler progress. |
| One already-submitted command | At most the remaining `T` in its Effect clock, assuming the clock advances and timeout close terminates normally; callback or `generation.closed` may finish sooner. The permit remains held until then. |
| Root retry sleep | No remaining-`B` wait when its owning controller is interrupted; timer cleanup clears it. |
| Shared circuit sleep after one root's final release | May remain for up to its remaining `B` in the Effect clock because the backend, not the root, owns it. It performs no client construction itself. |
| Backend shutdown of a correctly backend-scoped circuit sleep | Scope interruption clears the timer and waits for its fiber; no sleep-duration wait. This is conditional on the unimplemented scope capture. |
| Current OpenCode Native finalizer | Exactly as long as `subscription.unsubscribe()` takes; **unbounded** because OpenCode adds no timeout. |
| Donor attached release | Controller stop/join can settle while the detached daemon-unsubscribe fiber remains. Thus return latency is not a no-survivor bound. |
| Joined unsubscribe queued behind an incumbent command | The primitives expose one remaining incumbent deadline plus a separate timeout after unsubscribe submission—up to `2T` in the serial case—not a source-derived single-`T` bound. Closing rather than awaiting unsubscribe has different behavior; v4 does not fix the branch. |
| Backend shutdown with `N` acquired RcMap entries | Entry closes are sequential, so Effect-level latency is the sum of their finalizer latencies, not one global `T`; any non-settling entry makes shutdown unbounded. |
| Node sentinel wrapper | Its Promise resolves immediately after synchronous `FSWatcher.close()` invocation; queued callback/kernel close completion is not joined and has no source-stated duration bound. |
| Raw transport after `Client.end()` | Callback cancellation is synchronous, but socket close and a spawned discovery child are unjoined and have **no bound** in the transport source. |

Therefore v4's sentence that the configured command timeout is *the* upper
bound on release latency is not established. It is a per-submitted-command
Effect-clock bound, while the current outer finalizer, serial shutdown,
potential second unsubscribe command, and raw transport contain independent or
unbounded terms.

## Concrete proof gaps and survivor findings

1. **No carrier controller exists.** The exact supervisor fork, stop race,
   finalizers, route cleanup, and shutdown attachment cannot be inspected or
   tested.
2. **Pre-return acquisition is the first ownership hole.** The outer
   `acquireRelease` has no `Subscription` to finalize while v4 can already have
   installed a sentinel and created a raw generation. The current pending-
   acquisition test proves interruption reaches Native code, not that such
   internal resources are stopped.
3. **Scope-free fiber ownership is unresolved.** `forkChild` dies with the
   successful acquisition parent; `forkDetach` survives without explicit
   cleanup; `forkIn` needs a captured scope. V4 does not instantiate one of
   these possibilities or establish its pre-return path.
4. **Backend-scope capture is unresolved.** Donor acquisition gets
   `Effect.scope` from `makeRegistry`; v4 removes that registry and labels
   backend construction scope requirements as E12. No carrier call proves the
   coordinator timer's scope.
5. **The donor's daemon unsubscribe is demonstrably unjoined.** `detach` calls
   `Effect.runFork(command(...).pipe(Effect.ignore))`; supervisor join and
   RcMap release do not await that fiber.
6. **The raw locator child is demonstrably unowned by `Client.end()`.** It is a
   concrete process-handle survivor until the child happens to exit, with no
   transport timeout or cancellation path.
7. **Raw socket termination is requested, not joined.** Generation close can
   settle every Effect callback while the OS socket has not emitted `close`.
8. **Sentinel retarget fencing is prose-only.** No carrier mailbox proves that
   a callback queued before `FSWatcher.close()` cannot attach a new generation
   after release.
9. **The actor cannot close these gaps.** It is uncommitted and its `end()` is a
   synchronous in-memory cancellation/termination record; it has no discovery
   process, socket, backend scope, RcMap, sentinel, or controller.

## Confidence and caveats

- **High confidence** in the negative proof status, RcMap/acquire-release/scope
  semantics, donor detached-fiber finding, and raw transport behavior: each is
  directly present in pinned source.
- **High confidence** that W1 is committed, the actor is uncommitted, and no
  production Watchman carrier module exists, from the carrier jj status and
  tree.
- **Medium confidence** in any numeric end-to-end latency expression because
  there is no implementation selecting release branches, no release-barrier
  integration test, and Effect durations depend on clock/scheduler progress.
- No live daemon, operating-system socket, Bun shutdown, or child-process hang
  experiment was run. The report claims absence of source ownership/join/bounds,
  not that every local `socket.end()` will empirically linger.

## E12 v4 pointers

This result bears only on these v4 statements and invariants:

- **Public/internal interfaces, lines 289–305:** `directory.subscribe` and
  `backend.make` are directional; construction scope is explicitly left to E12.
- **Transport generation, lines 338–360:** permit admission, submitted-command
  interruption, closed race, route clearing, and late-callback claims.
- **Controller state and release, lines 395–450:** absorbing `Released`, initial
  attachment before Native return, and stop/remove/unsubscribe/join behavior.
- **Symlink topology, lines 499–516:** sentinel persistence, retarget, and
  release ordering.
- **Acquisition and availability, lines 518–549:** interruptible waiters,
  half-open probe interruption, and backend-shutdown timer property.
- **Lifecycle and failure semantics, lines 617–634:** pending Native acquisition
  and claimed command-timeout release bound.
- **Correctness invariants 5, 8, 15, and 18, lines 660–674:** shared-controller
  final release, retired-work fencing, final release from every pending state,
  and waiter/epoch safety.

## Strongest primary references

- [OpenCode watcher at `4306c07b`, RcMap acquire/release](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/src/filesystem/watcher.ts#L84-L151)
  and [its pending-acquisition/final-release tests](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/test/filesystem/watcher.test.ts#L152-L223).
- [Effect rc.112 `RcMap` construction/get/release](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/RcMap.ts#L240-L288),
  [`get`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/RcMap.ts#L335-L383),
  and [entry release](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/RcMap.ts#L452-L490).
- [Effect rc.112 acquire/release and scope close](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L3775-L3987),
  [fiber ownership](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L5287-L5460),
  and [callback semantics](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L1102-L1169).
- [Donor command admission](/packages/core/src/filesystem/watcher/watchman/client.ts#L102-L149),
  [acquisition ownership](/packages/core/src/filesystem/watcher/watchman/acquisition.ts#L51-L199),
  [detached unsubscribe](/packages/core/src/filesystem/watcher/watchman/root.ts#L275-L290),
  and [returned stop/join](/packages/core/src/filesystem/watcher/watchman/root.ts#L399-L443).
- [Transport FIFO/cancellation](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L72-L112),
  [discovery process](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L114-L273),
  and [`Client.end()`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L353-L361).
