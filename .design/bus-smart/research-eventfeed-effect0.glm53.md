---
type: Research
title: EventFeed Effect v4 module architecture
description: Ground-truth study of effect-smol primitives and comparison of semaphore, actor, RcMap, and STM architectures for the controlled EventFeed admission point.
resource: /design/bus-smart/research-eventfeed-effect0
tags: [server, events, effect, semaphore, queue, stm, downstream-patch]
status: draft
generated: { by: "agent:glm-5.3#max", at: 2026-08-31 }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: controlled-draft
    resource: /design/bus-smart/controlled-draft0
    title: Controlled SSE event feed design
  - id: event-feed
    resource: /packages/server/src/event-feed.ts
    title: Current EventFeed implementation
  - id: event-handler
    resource: /packages/server/src/handlers/event.ts
    title: SSE HTTP handler
  - id: event-feed-tests
    resource: /packages/server/test/event-feed.test.ts
    title: EventFeed behavior tests
  - id: keyed-mutex
    resource: /packages/core/src/effect/keyed-mutex.ts
    title: Repo semaphore-mutex idiom
  - id: bus
    resource: /packages/core/src/bus.ts
    title: Bus publication and inline listener seam
  - id: semaphore
    resource: /home/rektide/.local/share/opencode/repos/github.com/Effect-TS/effect-smol/packages/effect/src/Semaphore.ts
    title: Effect v4 Semaphore source
  - id: queue
    resource: /home/rektide/.local/share/opencode/repos/github.com/Effect-TS/effect-smol/packages/effect/src/Queue.ts
    title: Effect v4 Queue source
  - id: runtime
    resource: /home/rektide/.local/share/opencode/repos/github.com/Effect-TS/effect-smol/packages/effect/src/internal/effect.ts
    title: Fiber run loop, scope close, acquireRelease internals
  - id: scheduler
    resource: /home/rektide/.local/share/opencode/repos/github.com/Effect-TS/effect-smol/packages/effect/src/Scheduler.ts
    title: Cooperative yield budget
  - id: rcmap
    resource: /home/rektide/.local/share/opencode/repos/github.com/Effect-TS/effect-smol/packages/effect/src/RcMap.ts
    title: Effect v4 RcMap source
  - id: effect-tx
    resource: /home/rektide/.local/share/opencode/repos/github.com/Effect-TS/effect-smol/packages/effect/src/Effect.ts
    title: Effect.tx transaction semantics
  - id: txqueue
    resource: /home/rektide/.local/share/opencode/repos/github.com/Effect-TS/effect-smol/packages/effect/src/TxQueue.ts
    title: Transactional queue
---

# EventFeed Effect v4 module architecture

## Stage

The controlled-SSE design
([controlled-draft0](/.design/bus-smart/controlled-draft0.gpt56s.md)) fixed the
transport contract, interest model, and admission-order requirements, and then
settled the implementation in one short section: a single Effect v4
`Semaphore`, mutable subscriber registry, and `Effect.sync` critical sections
with `Queue.offerUnsafe` fan-out. The user flagged this as under-defined:
"i don't think we have a great effect v4 design for event-feed at the moment?
somewhat guessing. but like, rcmap or ...?"

This document answers that question against the actual effect-smol source at
`/home/rektide/.local/share/opencode/repos/github.com/Effect-TS/effect-smol`
(v4, not v3), against the current `packages/server/src/event-feed.ts`, and
against the repo's own Effect idioms. Research prompt: *what is the right
Effect v4 architecture for a controlled EventFeed with mutable per-subscriber
interest state, serialized admission through one ordering point, scoped bounded
per-subscriber queues with overflow isolation, encode-once fan-out, and an
out-of-band HTTP control entry point?*

## Finding

**Recommendation: keep the draft's architecture — one `Semaphore.makeUnsafe(1)`
guarding a plain mutable `Map` of subscriber records, where every ordering
operation is exactly one non-yielding `Effect.sync` — with three refinements.**

1. Encode domain events *before* entering the critical section, so the
   critical body is a single `Effect.sync` that cannot throw (a v4 `sync` that
   throws becomes a defect, and defects inside the section break the
   install-state-only-after-successful-offers discipline).
2. Construct the semaphore with `Semaphore.makeUnsafe(1)` rather than
   `yield* Semaphore.make(1)`: `make` is just `internal.sync` around the same
   constructor (`Semaphore.ts:329`), and `makeUnsafe` matches this repo's
   established module-held-lock idiom
   ([state.ts:88](/packages/core/src/state.ts#L88),
   [model-transport.ts:113](/packages/core/src/session/model-transport.ts#L113),
   [keyed-mutex.ts:28](/packages/core/src/effect/keyed-mutex.ts#L28)).
3. State the invariant the semaphore actually protects. In v4 a single
   `Effect.sync` is *already* atomic with respect to other fibers, so the
   semaphore is not for memory safety and not even strictly required for the
   cut when every section is one op — it is for (a) serializing realistically
   multi-op sections, (b) FIFO arrival ordering, and (c) keeping the invariant
   true under refactoring. See "Is the semaphore even necessary" below.

RcMap is the wrong shape for this registry, STM (TxRef/TxHashMap) is unsound
for the publish path because `Queue.offerUnsafe` side effects are not journaled
and would replay on retry, and a single-fiber actor adds a hop and new failure
modes to every event with no ordering benefit over the semaphore. There is no
`Mailbox` module in this effect-smol checkout (only cluster `MailboxFull`
error types), so the actor candidate would be built on plain `Queue` anyway.

## Properties of the current implementation that must be preserved

From [event-feed.ts](/packages/server/src/event-feed.ts) (89 lines) and its
tests ([event-feed.test.ts](/packages/server/test/event-feed.test.ts)):

| Property | Where | Test |
| --- | --- | --- |
| Dropping queue, capacity 4096 | `SubscriberCapacity = 4_096`, `Queue.dropping` ([event-feed.ts:8](/packages/server/src/event-feed.ts#L8), [event-feed.ts:76](/packages/server/src/event-feed.ts#L76)) | — |
| Encode once per publication, offer the same string to every subscriber | render once before the loop ([event-feed.ts:51-68](/packages/server/src/event-feed.ts#L51-L68)) | "encodes once and delivers the same frame" (test :47-70) |
| Zero-subscriber fast path skips encoding | `if (subscribers.size === 0) return` ([event-feed.ts:50](/packages/server/src/event-feed.ts#L50)) | — |
| Per-subscriber overflow isolation: failed offer deletes the subscriber and fails only its queue | [event-feed.ts:64-68](/packages/server/src/event-feed.ts#L64-L68) | "fails only the subscriber that exceeds its lag capacity" (test :72-114) |
| Public-event filtering: non-`OpenCodeEvent` payloads never consume capacity | `isOpenCodeEvent` guard ([event-feed.ts:49](/packages/server/src/event-feed.ts#L49)) | "filters internal events before they consume subscriber capacity" (test :137-149) |
| Encoding failure fails all current subscribers, later subscribers work | `fail` clears the set and `failCauseUnsafe` each ([event-feed.ts:41-46](/packages/server/src/event-feed.ts#L41-L46)) | test :151-175 |
| Scoped lifetime: queue registered on acquire, unregistered + shut down on release | `Effect.acquireRelease` ([event-feed.ts:75-79](/packages/server/src/event-feed.ts#L75-L79)) | — |
| Feed lifetime: Bus unsubscribe registered as layer finalizer | [event-feed.ts:71-72](/packages/server/src/event-feed.ts#L71-L72) | — |
| Handler prepends one synthetic `server.connected` before live frames, 15s heartbeat comment frames | [event.ts:14-24](/packages/server/src/handlers/event.ts#L14-L24) | — |

The wire contract is `data: ${JSON.stringify(event)}\n\n` (`frame`, [event-feed.ts:29-31](/packages/server/src/event-feed.ts#L29-L31)).

## Effect v4 ground truth

All claims verified against the actual effect-smol checkout at
`/home/rektide/.local/share/opencode/repos/github.com/Effect-TS/effect-smol/packages/effect/src`
— bare `File.ts:line` citations in this section refer to files under that
root. This is v4; several behaviors differ from v3 assumptions.

### The run loop: single ops are atomic, op chains are not

The fiber run loop (`internal/effect.ts:621-663`) checks
`this.currentScheduler.shouldYield(this)` on **every operation**
(`internal/effect.ts:629-639`). `MixedScheduler.shouldYield` returns
`fiber.currentOpCount >= fiber.maxOpsBeforeYield`
(`Scheduler.ts:163-165`), with the default budget set by
`Scheduler.MaxOpsBeforeYield = 2048` (`Scheduler.ts:258-260`).
When the budget is hit, the loop prepends `yieldNow` between two otherwise
synchronous operations, parking the fiber and letting other fibers run.

Consequences:

- A **single `Effect.sync` op cannot be preempted**. Once the run loop starts
  evaluating it, the whole thunk runs to completion; yields can only be
  injected between ops. Interruption is likewise delivered at continuation
  boundaries (`interruptUnsafe` swaps the continuation,
  `internal/effect.ts:573-590`); it cannot abort a JS call mid-execution.
- A **chain of sync-looking ops can be preempted every 2048 ops**. Today's
  `publish` is a generator with `yield* Effect.try(...)` plus a loop
  ([event-feed.ts:48-69](/packages/server/src/event-feed.ts#L48-L69)) — a
  multi-op section that in principle can yield between encoding and offering.
  At EventFeed's tiny op counts the budget will not trip in practice, but
  correctness should not rest on an invisible op-count budget.
- `Effect.sync` "must not throw. If it throws, the thrown value is treated as a
  defect" (`Effect.ts:1117-1120`). Critical sections that can
  fail (encoding) must catch before or inside the thunk and convert to a
  deliberate path.

### Semaphore

From `Semaphore.ts`:

- `make(permits)` is `internal.sync(() => new SemaphoreImpl(permits))`
  (`:329`); `makeUnsafe` (`:190`) is the same constructor directly. No scope is
  involved either way.
- `take(n)` uncontended is a synchronous fast path — `this.taken += n;
  succeed(n)` (`:220-222`). No fiber suspension, no allocation. Contended
  `take` registers a waiter callback and suspends (`:206-219`); the
  implementation documents FIFO: "Concurrent pending `take` calls are processed
  in a first-in, first-out manner" (`:122-124`).
- `withPermits(n)(self)` is `uninterruptibleMask(restore =>
  flatMap(restore(this.take(n)), (permits) =>
  onExitPrimitive(restore(self), releaseCallback, true)))` (`:263-279`).
  Waiting for the permit is interruptible (restored), the guarded effect is
  interruptible, and the release callback runs on **every exit** — success,
  failure, interruption — via `onExitPrimitive`'s `contA`/`contE` continuations
  (`internal/effect.ts:3907-3934`). The release callback is a plain function
  performing `updateTakenUnsafe` synchronously; it cannot fail or yield.
- When a permit is released and waiters exist, wakeups go through
  `fiber.currentDispatcher.scheduleTask(..., 0)` (`:229-239`): a contended
  handoff costs one scheduled task (a `setImmediate` batch under
  `MixedSchedulerDispatcher`, `Scheduler.ts:196-201`). One
  scheduling hop, no timer.
- `withPermitsIfAvailable(n)(self)` runs only when permits are free and returns
  `Option.none` otherwise (`:283-293`). Not usable for admission: silently
  skipping an admission under contention would drop events and break the cut.

### Queue

From `Queue.ts`:

- `Queue.dropping(capacity)` is `make({ capacity, strategy: "dropping" })`
  (`:562-563`). Construction captures the creating fiber's dispatcher
  (`:447-450`); taker wakeups are scheduled on that dispatcher
  (`scheduleReleaseTaker`, `:1817-1823`), so offering from any fiber is safe.
- `offerUnsafe(queue, message)`: returns `false` when the queue is not `Open`
  (`:695-696`), `false` when full under the dropping strategy (`:697-707`),
  otherwise appends to a `MutableList` (FIFO), schedules taker release, and
  returns `true` (`:709-711`). It is one synchronous function call: no yield,
  no allocation beyond the list node.
- `failCauseUnsafe(queue, cause)`: if no offers pending and no buffered
  messages, the queue finalizes to `Done` immediately; otherwise it enters
  `Closing` with the failure exit stored (`:924-939`). **In `Closing`, buffered
  messages are still drained by consumers before the failure is observed**
  (take path checks `state._tag === "Done"`, `:1830`; `releaseCapacity`
  finalizes when the buffer empties, `:1885-1896`). This is exactly the
  contract the controlled feed needs: a subscriber that overflows still
  receives every frame admitted before the cut, then fails.
- `shutdown` is immediate and synchronous: clears buffered messages, finalizes
  with interrupt (or the stored exit if `Closing`), resumes pending offers,
  idempotent (`:1114-1133`). `Stream.fromQueue` emits non-empty FIFO batches
  and ends on `Cause.Done`, propagating other failures
  (`Stream.ts:1262-1294`).

### Scope finalizers

Scope close runs finalizers in **reverse registration order** (LIFO):
`for (let i = arr.length - 1; i >= 0; i--)` (`internal/effect.ts:3745`).
`Effect.acquireRelease(acquire, release)` runs `acquire` uninterruptibly by
default (the `interruptible` option restores it, `internal/effect.ts:3876-3888`)
and registers `release` on the surrounding scope. Synchronous finalizers keep
scope close synchronous for that resource, which matters for the SSE
disconnect path: unregister (Map delete) and `Queue.shutdown` are both plain
sync ops, so an SSE request scope close cannot stall on EventFeed cleanup.

### RcMap — verdict: wrong shape for this registry

`RcMap.ts` is explicitly "meant for resource lifecycles such as
clients, sessions, and connections, not as a general mutable cache" (module
doc, `:4-10`). Mismatches for a live-SSE subscription registry:

- `RcMap.get` **acquires or creates** (`:326-374`): it increments `refCount`
  (`:342`), runs `lookup` in a forked fiber with a per-entry scope on miss
  (`:347-367`), and adds a release finalizer to the **caller's scope**
  (`:369-372`). The control PATCH needs "find existing or fail not-found";
  `get` would fabricate a subscription, and `has` is boolean-only (`:541-551`)
  so `has`-then-`get` reintroduces a check-then-act race.
- Lifetime is already exact without it: the SSE request scope plus
  `Effect.acquireRelease` gives precisely "entry lives as long as the
  request". `idleTimeToLive` (default zero → immediate release at refcount 0,
  `:258-260`, `:376-389`) and capacity eviction are resource-sharing features
  with no role for exactly-one-owner subscriptions.
- `invalidate` removes the map entry but deliberately does **not** close an
  entry still referenced (`if (entry.refCount > 0) return`, `:511`) — the
  opposite of the overflow path, which must terminate a live subscriber
  immediately (done directly with `Queue.failCauseUnsafe`).

RcMap would be the right tool if the registry shared *acquisition cost*
(deduping concurrent identical lookups across request scopes), which is not
this problem. Plain `Map` inside the critical section is simpler and has the
right semantics.

### STM (TxRef / TxHashMap / TxPubSub / TxQueue) — verdict: unsound for this publish path

`Effect.tx` creates an outermost transaction boundary with a journal of
`TxRef` reads/writes; it is optimistic with retry: a transaction re-runs when
its body calls `Effect.txRetry` and an accessed ref changes, or when any
accessed ref changed because another transaction committed first
(`Effect.ts:14610-14691`). Consistency is version comparison over journaled
refs (`isTransactionConsistent`, `:14693-14700`); commit is synchronous version
bumps plus scheduled waiter wakeups (`commitTransaction`, `:14723-14734`);
blocked retries suspend until a journaled ref changes
(`awaitPendingTransaction`, `:14702-14721`).

Why it does not compose with the EventFeed admission cut:

- **Non-transactional side effects replay on retry.** The journal covers only
  `TxRef` state. `Queue.offerUnsafe` inside a transaction body is an ordinary
  side effect: if the transaction conflicts and re-runs, already-offered real
  frames are offered again — duplicated delivery. To be sound, every
  subscriber's queue would have to be a `TxQueue` ("state changes participate
  in Effect transactions", `TxQueue.ts:1-9`) or the fan-out a
  `TxPubSub` ("each subscriber owns a `TxQueue`",
  `TxPubSub.ts:1-8`), with a bridge from the transactional
  structure to the SSE stream — a second queue per subscriber and a drain
  fiber, replacing one `offerUnsafe` call.
- **Different overflow semantics.** `TxQueue` offers to a full bounded queue
  *retry* (backpressure, `TxQueue.ts:5-8`); the existing
  contract is dropping-with-failure isolation. Emulating the latter on STM
  means fighting the primitive's design.
- **Conflict surface is maximal.** Publish reads the subscriber registry;
  control writes it. Every publish's read set contains the same registry ref
  as every control's write set, so control commits force concurrent publishes
  to retry — serialization achieved by re-execution rather than queueing.
  Retries re-run recipient selection under burst load precisely at the
  interesting moments (move admission).
- **No repo precedent.** Zero uses of `TxRef`/`Effect.tx` anywhere in
  `packages/*/src` (grep), versus semaphores in ten modules.

STM earns its cost when several independent keys must compose transactionally.
Here one 1-permit lock over one op is strictly cheaper and already exact.

### Other primitives checked

- **`Deferred`**: `makeUnsafe` (`Deferred.ts:153`) plus an interruptible
  `await` implemented as a resume-callback registration (`:185-194`). Used
  throughout the repo for join semantics
  ([run-coordinator.ts:84](/packages/core/src/session/run-coordinator.ts#L84),
  [run-coordinator.ts:125-128](/packages/core/src/session/run-coordinator.ts#L125-L128)). An
  actor reply Deferred that is never completed leaves awaiters hanging until
  they are interrupted — the core actor failure mode (below).
- **`PubSub`**: broadcast hub where each subscription gets its own copy
  (`PubSub.ts:1-12`). Already used inside Bus
  ([bus.ts:194](/packages/core/src/bus.ts#L194)). It broadcast-to-all; it
  cannot express per-subscriber interest predicates without one PubSub per
  interest set, so it does not replace the registry. Encode-once would also be
  lost unless the payload is pre-encoded strings.
- **`SynchronizedRef`**: serializes effectful updates of one immutable value
  (`SynchronizedRef.ts:1-4`). It can serialize the
  registry, but the section must then rebuild/copy immutable structures and
  still cannot hold the unsafe offers without wrapping effects; the semaphore
  over a mutable Map does the same job without copies. (The draft's "Why
  Semaphore rather than SynchronizedRef" argument holds.)
- **`SubscriptionRef`**: change stream for a serialized ref
  (`SubscriptionRef.ts:1-4`) — observation, not
  admission ordering.
- **`FiberMap`**: fibers-by-key tied to a scope, interrupted on close
  (`FiberMap.ts:1-7`). Right tool if the actor variant needed
  supervised restart; not needed for the recommended design.
- **`Mailbox`**: does not exist in this checkout (directory listing of
  `packages/effect/src`; only cluster `MailboxFull` errors match). Any actor
  sketch must use `Queue` + `Take`-style loops.
- **`Effect.fn` / `Effect.fnUntraced`**: tracing/span and closure-reuse
  wrappers (`Effect.ts:13563`, `Effect.ts:13682`); the
  current module already uses both
  ([event-feed.ts:33](/packages/server/src/event-feed.ts#L33), [event-feed.ts:48](/packages/server/src/event-feed.ts#L48)).

## Repo idioms

The repo already answers "how do we serialize mutable state in v4" three ways,
all semaphore-based:

- **Module-held 1-permit semaphore + multi-yield critical section**:
  [state.ts:88](/packages/core/src/state.ts#L88) creates
  `Semaphore.makeUnsafe(1)` over `let` variables and wraps an effectful
  `materialize` in `withPermit` ([state.ts:107](/packages/core/src/state.ts#L107)).
- **Per-key mutex**: [keyed-mutex.ts:20-42](/packages/core/src/effect/keyed-mutex.ts#L20-L42)
  builds `KeyedMutex` from `Semaphore.makeUnsafe(1)` per key with refcounted
  cleanup; Bus serializes durable-aggregate publication through it
  ([bus.ts:200](/packages/core/src/bus.ts#L200), [bus.ts:469](/packages/core/src/bus.ts#L469)).
- **Manual take/release bracket**:
  [model-transport.ts:458](/packages/core/src/session/model-transport.ts#L458)
  uses `Effect.acquireRelease(owner.lock.take(1), () => owner.lock.release(1), { interruptible: true })`.
- **Callback → `offerUnsafe` → `Queue.take` loop** (single-writer queue):
  [pty.ts:183-206](/packages/server/src/handlers/pty.ts#L183-L206).
- **`Context.Service` + `Layer.effect` + `Effect.fn`**: EventFeed itself
  ([event-feed.ts:27](/packages/server/src/event-feed.ts#L27), [event-feed.ts:33](/packages/server/src/event-feed.ts#L33), [event-feed.ts:83-89](/packages/server/src/event-feed.ts#L83-L89)).

The draft's pick matches every one of these. Note also where admission runs
today: EventFeed's `publish` is invoked *inline on publisher fibers* inside
Bus's `notify`, awaited before PubSub publication
([bus.ts:494-505](/packages/core/src/bus.ts#L494-L505)). The controlled routed
observer keeps that property, which is why the critical section must never
await backpressure — it would stall session runners.

## Candidate architectures

### (a) Semaphore-guarded mutable registry — recommended

Validate the draft against the source, with corrections:

**Is `Effect.sync` inside `withPermit` genuinely non-yielding?** Yes, with the
precise reading: the run loop can only inject `yieldNow` *between* ops
(`internal/effect.ts:629-639`); a single `Effect.sync` op runs to completion
once started, and interruption cannot abort it mid-thunk. The permit is
released on every exit through `onExitPrimitive` with a synchronous release
callback (`Semaphore.ts:263-279`). So `withPermit(Effect.sync(section))` is:
wait (interruptible) → one atomic op → release. Between the permit acquisition
and the body there are a few ops where the op-budget could park the fiber
*holding* the permit — exclusion and the cut are unaffected; worst case is a
brief delay.

**Is the semaphore needed for memory safety?** No. JS is single-threaded and a
single sync op cannot interleave; a plain `Map` mutated inside one
`Effect.sync` is atomic without any lock. The semaphore's actual roles:

1. **Tolerance for multi-op sections.** Realistic admission sections want
   `Effect.try` encoding, logging, or metrics. Any `yield*` makes the section
   preemptible (op budget); the semaphore keeps multi-op sections serialized
   anyway. Without it, the invariant "this section is atomic" lives only in
   the discipline "never write `yield*` here," which refactoring silently
   breaks.
2. **FIFO arrival ordering.** Semaphore waiters are served first-in-first-out
   (`Semaphore.ts:122-124`, `:229-239`), so admission order equals arrival
   order at `withPermit` — a cleaner spec than "whichever fiber the runtime
   scheduled first."
3. **A greppable invariant.** `admission.withPermit` marks every ordering
   operation; reviewers can audit the cut by listing call sites.

**Fairness/convoying at 10-100 events/sec, a few subscribers:** uncontended
`take` is a few synchronous instructions (`:220-222`); contended handoff costs
one `scheduleTask` batch hop (`:229-239`, `Scheduler.ts:196-201`).
Sections are microseconds. There is no convoy risk at these rates. **Cost when
zero subscribers:** the existing `subscribers.size === 0` fast path
([event-feed.ts:50](/packages/server/src/event-feed.ts#L50)) skips encoding and
never reaches the semaphore; zero. The read is safe outside the lock because
the size only transitions inside registration/unregistration critical
sections: a stale zero read linearizes the publish *before* an in-flight
registration, which is a legal cut for a subscriber that does not exist yet.

**Corrections to the draft sketch:**

- Pre-encode outside the section. The draft says the section performs "frame
  encoding" — don't. Encoding is per-publication, not per-subscriber, so
  encode-once is preserved by encoding before the lock; a pure string cannot
  "overtake" admission because admission order is decided at offer time (the
  same argument [location-streams0 Design
  C](/.design/bus-smart/location-streams0.gpt56s.md) makes). Encoding failures
  then never defect inside the section; the existing fail-all-subscribers
  fan-out stays a standalone one-op sync section.
- Prefer `Semaphore.makeUnsafe(1)` (repo idiom; `make` adds nothing, `:329`).
- The critical body must be total: validate-and-offer logic that can fail
  should return a result discriminator converted to `Effect.fail` *after* the
  section, not throw inside the thunk.

Sketch (shapes only; full module below):

```ts
const subscribers = new Map<SubscriptionID, Subscriber>()
const admission = Semaphore.makeUnsafe(1)

const critical = <A>(section: () => A): Effect.Effect<A> =>
  admission.withPermit(Effect.sync(section))
```

Failure modes: none new beyond the current module's — sections are sync and
total; overflow removal mirrors today's loop; scope close is synchronous.

### (b) Single-fiber actor — rejected

One fiber consumes a command `Queue` of `admit(event) | control(cmd) |
subscribe | unsubscribe | moved`; control commands carry a `Deferred` reply.

- **Ordering**: trivially exact (single consumer). This is its one advantage,
  and (a) already achieves it.
- **Fiber hop per event**: every publish becomes `offer(commandQueue)` +
  actor-loop `take` + fan-out, even with zero controlled subscribers unless a
  bypass is added — but a bypass reintroduces exactly the ordering question
  the actor was supposed to answer.
- **Backpressure**: the command queue must be bounded (else unbounded memory
  under subscriber lag). Dropping loses events; suspending stalls publishers —
  and publishers are session runner fibers, so a lagging SSE consumer would
  backpressure model execution. The current design isolates lag per subscriber
  precisely to avoid this.
- **Crash semantics**: if the actor dies (defect in one section), every
  in-flight `Deferred.await` hangs until callers are interrupted
  (`Deferred.ts:185-194` — await parks; nobody completes it), and the feed
  needs supervised restart (`FiberMap`-style) plus reply invalidation.
- **Shutdown**: the drain protocol (end command queue, complete or fail
  pending replies, then exit) is extra machinery the semaphore design gets
  from scopes for free.

The draft's one-line dismissal ("adds a fiber hop and shutdown/reply failure
modes to every event") is confirmed by the source; if it were ever needed,
`Mailbox` does not exist in this checkout — it would be `Queue` + `Deferred`.

### (c) RcMap-managed subscriptions — rejected

See the RcMap verdict above. Additional specifics for the exact question
asked: the control PATCH cannot `RcMap.get` the subscription without either
creating-on-miss or racing `has`→`get`; transient request-scoped references
churn refcounts and register request-scope finalizers for every PATCH
(`RcMap.ts:369-372`); `idleTimeToLive` is meaningless for an entry whose
lifetime is exactly one SSE scope; and overflow termination cannot use
`invalidate` on a referenced entry (`:511`). Every operation RcMap offers is
either wrong-shaped or redundant with `Map` + `acquireRelease`. Not a fit.

### (d) STM registry — rejected for admission, noted for the future

See the STM verdict above. The one place STM ideas could help later: if
interest state ever splits across independently-updated structures that must
commit together *without* a single global ordering point. Today the design
wants one global ordering point (publish vs control vs move coverage), which a
1-permit lock expresses directly; STM would express it as retry loops with
re-executable side effects, which the offer path forbids.

### (e) Hybrids — one worthwhile, the rest rejected

- **Adopted**: mutable registry + semaphore *only where ordering matters* is
  already the shape of (a); zero-subscriber fast path stays outside the lock.
- **Rejected**: `withPermitsIfAvailable` fast path for publishes (drops
  admissions under contention, breaking the cut).
- **Rejected**: per-Location `PartitionedSemaphore` sharding — admission must
  be totally ordered against control commands and move coverage, so there can
  be exactly one ordering point.

## Recommended module shape

```ts
export * as EventFeed from "./event-feed"

import { Bus } from "@opencode-ai/core/bus"
import { Event } from "@opencode-ai/schema/event"
import { isOpenCodeEvent, type OpenCodeEvent } from "@opencode-ai/protocol/groups/event"
import { Cause, Context, Effect, Layer, Queue, Redacted, Schema, Scope, Semaphore, Stream } from "effect"

export const SubscriberCapacity = 4_096

export class SubscriberOverflowError extends Schema.TaggedError<SubscriberOverflowError>()(
  "EventFeed.SubscriberOverflow", { capacity: Schema.Int },
) {}
export class EncodingError extends Schema.TaggedError<EncodingError>()(
  "EventFeed.EncodingError", { eventID: Event.ID, eventType: Schema.String, cause: Schema.Defect() },
) {}
// control taxonomy below
export type Error = SubscriberOverflowError | EncodingError | ControlError

type Subscriber = {
  readonly id: SubscriptionID
  readonly token: Redacted.Redacted<string>
  readonly queue: Queue.Queue<string, Error>
  interest: SubscriberInterest   // mutable; owned by the critical section
  readonly commands: Map<string, AppliedCommand>
}

export interface Interface {
  readonly subscribe: Effect.Effect<
    { readonly subscriber: Subscriber; readonly stream: Stream.Stream<string, Error> },
    never, Scope.Scope,
  >
  readonly control: (input: ControlInput) => Effect.Effect<AppliedCommand, ControlError>
  readonly publish: (event: Event.Payload, audience: EventAudience) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode-server/EventFeed") {}

export const make = Effect.fn("EventFeed.make")(function* (
  observe: (subscriber: Bus.RoutedSubscriber) => Effect.Effect<Bus.Unsubscribe>,
  options?: { readonly capacity?: number; readonly encode?: (event: OpenCodeEvent) => string },
) {
  const capacity = options?.capacity ?? SubscriberCapacity
  const render = options?.encode ?? frame
  const subscribers = new Map<SubscriptionID, Subscriber>()
  const admission = Semaphore.makeUnsafe(1)

  // One admission point. The section is a single, total, non-yielding op.
  const critical = <A>(section: () => A): Effect.Effect<A> =>
    admission.withPermit(Effect.sync(section))

  const publish = Effect.fnUntraced(function* (event: Event.Payload, audience: EventAudience) {
    if (!isOpenCodeEvent(event)) return
    if (subscribers.size === 0) return
    // encode once, outside the section: cannot throw inside the critical body
    const encoded = yield* Effect.try({
      try: () => render(event),
      catch: (cause) => new EncodingError({ eventID: event.id, eventType: event.type, cause }),
    }).pipe(Effect.catch(failAll))   // failAll stays a standalone one-op sync fan-out
    if (encoded === undefined) return
    yield* critical(() => {
      for (const [id, subscriber] of subscribers) {
        if (audience.type === "global" || matches(subscriber.interest, event, audience)) {
          admit(subscribers, id, subscriber, encoded)
        }
      }
    })
  })

  // move coverage: one section installs derived interest, marker, then move
  // frame, per matching follower — structurally ordered inside the op

  const unsubscribe = yield* observe(publish)
  yield* Effect.addFinalizer(() => unsubscribe)

  const register = (queue: Queue.Queue<string, Error>): Subscriber =>
    // runs inside critical(): mint id/token, build interest, offer ready frame
    // and server.connected *before* any concurrent publish can match
    ...

  return Service.of({
    subscribe: Effect.acquireRelease(
      Queue.dropping<string, Error>(capacity).pipe(
        Effect.flatMap((queue) => critical(() => register(queue))),
      ),
      (subscriber) =>
        critical(() => subscribers.delete(subscriber.id)).pipe(
          Effect.andThen(Queue.shutdown(subscriber.queue)),
          Effect.asVoid,
        ),
    ).pipe(Effect.map((subscriber) => ({ subscriber, stream: Stream.fromQueue(subscriber.queue) }))),
    control: (input) =>
      critical(() => applyCommand(subscribers, input)).pipe(
        Effect.flatMap((result) => result._tag === "Applied" ? Effect.succeed(result.command) : Effect.fail(result.error)),
      ),
    publish,
  })
})
```

Where `admit` is the extracted offer-or-terminate used by both event admission
and control-marker admission:

```ts
function admit(subscribers: Map<SubscriptionID, Subscriber>, id: SubscriptionID, subscriber: Subscriber, frame: string) {
  if (Queue.offerUnsafe(subscriber.queue, frame)) return
  subscribers.delete(id)
  Queue.failCauseUnsafe(subscriber.queue, Cause.fail(new SubscriberOverflowError({ capacity })))
}
```

Key properties of this shape:

- **Encode once**: `render(event)` runs once per publication; the same string
  is offered to every matching subscriber.
- **Exact cut**: event admission, registration (with ready + `connected`
  frames), control application (marker before install), and move coverage are
  each one atomic op under one FIFO ordering point. Events offered before a
  control section were selected under old interest; after it, new interest.
- **Legacy unchanged**: legacy subscribers are registry records with a
  match-all interest and an unexposed id/token (or a second collection
  iterated in the same sections — one collection is simpler and preserves a
  single ordering point). They receive every public event exactly as today.
- **Never backpressures publishers**: sections contain only `offerUnsafe`,
  `failCauseUnsafe`, and Map/Set mutation. No `Queue.offer` suspension can
  ever run inside admission.
- **Disconnected-mid-control**: the SSE scope's LIFO finalizers run
  unregister + `shutdown` synchronously; a concurrent control section either
  serialized before (marker offered to a queue that then failed — subscriber
  already drained or failed; harmless) or finds the subscription absent and
  returns not-found.
- **Shutdown drain**: nothing feed-level to drain. Queues are owned by request
  scopes; scope close shuts each queue (`Queue.shutdown` clears buffers and
  resumes takers, `Queue.ts:1114-1133`); the layer finalizer unsubscribes from
  Bus (`event-feed.ts:71-72` unchanged).

One subtlety worth a comment in the implementation: `offerUnsafe` returns
`false` both for "full" and "not Open" (`Queue.ts:695-707`). The event path
treats false as overflow-failure either way (correct: a closed queue's
subscriber is gone). The *control* path should distinguish: check
`subscriber.queue.state._tag !== "Open"` first and return a not-found/closed
error rather than conflating it with `SubscriberOverflowError`.

## Control command plumbing

The PATCH handler stays thin, mirroring the current handler style
([event.ts:9-35](/packages/server/src/handlers/event.ts#L9-L35)):

```ts
// handlers/event.ts (controlled group)
handlers.handle("event.controlInterest", (input) =>
  Effect.gen(function* () {
    const feed = yield* EventFeed.Service
    const token = yield* headerToken()   // x-opencode-event-control-token
    const command = yield* EventFeed.decodeCommand(input.body) // Schema decode outside the lock
    return yield* feed.control({ ...command, token })
  }),
)
```

Schema decode, auth checks, and header extraction happen outside the critical
section; only validation that depends on subscriber state (token equality,
revision match, command-ID dedup) runs inside it, returning a typed result.

Error taxonomy (`Schema.TaggedError`, extending today's two):

- `EventFeed.SubscriberOverflow` (existing) — queue full.
- `EventFeed.EncodingError` (existing) — render defect.
- `EventFeed.ControlInvalid` — malformed add/remove contradiction, oversized
  interest set.
- `EventFeed.SubscriptionNotFound` — unknown id **or** id whose queue is no
  longer Open (overflowed, disconnected mid-request).
- `EventFeed.TokenMismatch` — subscription exists, token differs.
- `EventFeed.RevisionConflict` — `expectedRevision !== requestedRevision`.
- `EventFeed.CommandConflict` — commandID reuse with different canonical
  content.

Ready-frame admission: `register` offers `event-feed.ready` and the synthetic
`server.connected` *inside* the registration critical section, so no event can
precede them and the handler does not prepend frames outside EventFeed (today
the handler prepends via `Stream.make(...).pipe(Stream.concat(live))`,
[event.ts:19-20](/packages/server/src/handlers/event.ts#L19-L20); the
controlled path moves this into registration per the draft's verification
list).

Revision/marker ordering matches
[research-controlled-sse0](/.design/bus-smart/research-controlled-sse0.gpt56s.md#revision-and-marker-ordering):
the applied marker is offered under old interest, then state installs, then
the section releases — all inside one op, so the "enqueue marker; install
without releasing serialization" step is literally the same statement.

## Evaluation

| Criterion | (a) semaphore | (b) actor | (c) RcMap | (d) STM |
| --- | --- | --- | --- | --- |
| Exactness of admission cut | exact, one op per section | exact | cut complicated by get-or-create races | exact but via retries |
| Fiber hops per event | 0 extra (inline on publisher fiber) | +1 hop + queue offer | 0 | 0, plus retry re-runs |
| Unsafe-offer soundness | direct | direct (inside actor) | direct | **unsound** (replay on retry) unless TxQueue |
| Interruption safety | release-on-exit; sections atomic | awaiters can hang on actor death | request-scope refcount churn | retry suspension is interruptible |
| Overflow isolation | per-subscriber failCauseUnsafe, same as today | possible but queue policy conflicts arise | invalidate can't close live entry | TxQueue backpressure ≠ drop+fail |
| Repo idiom fit | exact (KeyedMutex, State, model-transport) | partial (pty outbox; no actor services) | RcMap used for resources elsewhere | none |
| Testability | sections are pure functions of registry state | must drive the mailbox loop | must fake scopes | must control retries |
| Downstream patch carry | small delta on event-feed.ts | rewrite + new failure modes | rewrite | rewrite + unfamiliar paradigm |

### Verification focus (extends the draft's list)

- Section atomicity: assert no interleaving by publishing concurrently with a
  control patch under `yield` pressure (e.g., a slow consumer and bursts over
  2048 ops to exercise the scheduler budget — the property must hold anyway).
- Ready frame: first two frames of a controlled subscription are exactly
  `event-feed.ready`, `server.connected`, even when events publish
  concurrently with registration.
- Overflow-during-control: PATCH against a subscriber whose queue just failed
  returns `SubscriptionNotFound`, never installs interest, never caches a
  command result.
- Disconnect-mid-control: scope close concurrent with `control` yields either
  an applied result (marker drainable before failure) or not-found — never a
  hang.
- Legacy: unscoped subscribers still receive every public event exactly once,
  including global events, in publish order (existing tests unchanged).

## Open questions

1. Should the zero-subscriber fast path check live in the routed observer seam
   (Bus passes audience regardless; EventFeed checks size) or should Bus skip
   the observer entirely when EventFeed reports no subscribers? The latter
   saves a call but adds a feedback channel to the seam contract.
2. Is one registry collection (legacy entries as match-all records) the right
   carry, or does upstream prefer two collections iterated in the same
   sections to make the legacy-diff visibly untouched?
3. The control body computes canonical command equality inside the section;
   should command-cache retention be bounded (draft open question) and, if so,
   is a size cap checked inside the same section sufficient?

## Cross-references

- [Controlled SSE draft](/.design/bus-smart/controlled-draft0.gpt56s.md) — the
  design this module implements; this doc confirms its "Effect v4 module
  shape" claims against source and sharpens the semaphore's justification.
- [Controlled-SSE research](/.design/bus-smart/research-controlled-sse0.gpt56s.md) —
  revision and marker ordering rules realized here by one-op critical
  sections.
- [Location-stream alternatives](/.design/bus-smart/location-streams0.gpt56s.md) —
  Design C "Atomic interest cut"; the "encoding may happen before it" caveat
  is resolved here (pure pre-encoded strings cannot overtake admission).
- [Event sequencing research](/.design/bus-smart/research-event-sequencing0.gpt56s.md) —
  the FIFO/dedup guarantees the per-subscriber queue must keep providing.
- [Durable Streams research](/.design/bus-smart/research-durable-streams0.gpt56s.md) —
  the larger replay architecture this admission point must not preclude.
