---
type: Research
title: Client event ownership — SharedEvents and controlled feed composition
description: Post-rebase census of who owns the event connection, reconnect, and buffering across upstream SharedEvents, the solid connection loop, and our controlled event feed; concrete composition bugs; smallest coherent design and unify strategy.
resource: /design/bus-smart/research1-client-ownership
tags: [client, events, sse, shared-events, controlled-feed, reconnect, upstream, cpu]
status: draft
generated: { by: "agent:glm-5.3#max", at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-12-31
sources:
  - id: draft0
    resource: /design/bus-smart/draft0
    title: Controlled event feed directional draft
  - id: port0
    resource: /design/bus-smart/port0
    title: Controlled event feed v2@origin port
  - id: client-compat0
    resource: /design/bus-smart/research-client-compat0
    title: Controlled-feed client compatibility surface
  - id: shared-events
    resource: /packages/client/src/shared-events.ts
    title: Upstream shared event multiplexer
  - id: promise-wrapper
    resource: /packages/client/src/promise/client.ts
    title: Hand-written promise client wrapper
  - id: effect-wrapper
    resource: /packages/client/src/effect/client.ts
    title: Hand-written effect client wrapper
  - id: solid-connection
    resource: /packages/client/src/solid/connection.ts
    title: Shared solid event connection loop
  - id: controlled-feed
    resource: /packages/client/src/solid/controlled-event-feed.ts
    title: Controlled event feed controller
  - id: shared-events-tests
    resource: /packages/client/test/shared-events.test.ts
    title: SharedEvents behavior oracle
  - id: upstream-46393
    resource: https://github.com/anomalyco/opencode/pull/46393
    title: fix(client): isolate shared event consumers
---

# Client event ownership — SharedEvents and controlled feed composition

## Situation

draft1 must deliver a **real event-fanout CPU reduction after the rebase**. The
rebase window brought an upstream change that reshapes the client half of the
bus-smart story: the promise and effect clients gained hand-written wrappers
around a new `SharedEvents` multiplexer, so every `event.subscribe()` on one
client instance now shares a single SSE connection instead of opening one stream
per consumer. The highest-priority question for draft1 is whether our
controlled feed's reconnect and fallback behavior composes correctly with that
shared machinery — who owns the connection, who reconnects, who buffers — and
whether anything concrete breaks where the two designs meet.

Method: read the current client sources and tests in this worktree, diffed
them against upstream `v2@origin` (`lwoszptrpqvn`, #47464) via `jj file show`,
and inspected the two upstream commits that introduced and then reshaped
SharedEvents. Facts below carry file:line links; anything not verified is
listed in [Unverified questions](#unverified-questions).

## Verified facts

### Upstream SharedEvents arrived in the rebase window

- `6a2c3e91c780` *feat(plugin): add typed rpc and custom events (#46105)*
  introduced `packages/client/src/shared-events.ts` plus the hand-written
  promise and effect client wrappers.
- `ac77cc46b811` *fix(client): isolate shared event consumers (#46393)*
  rewrote the fanout contract: `push` went from an awaited
  `Promise.all` (a slow subscriber backpressured everyone) to fire-and-forget
  into a **bounded per-subscriber queue of 4,096 events**
  ([shared-events.ts:16](/packages/client/src/shared-events.ts#L16)); a
  subscriber that overflows is finished with an error
  ([shared-events.ts:85-88](/packages/client/src/shared-events.ts#L85-L88))
  while everyone else keeps flowing. Upstream's own words: "isolate shared
  event consumers".

### What SharedEvents owns

`SharedEvents.make(connect)` is a per-client-instance multiplexer over the
**legacy** `GET /api/event` stream:

- **One singleton connection.** `current` holds the only live source
  ([shared-events.ts:15](/packages/client/src/shared-events.ts#L15)); the
  first `next()` on any subscriber starts it lazily
  ([shared-events.ts:93-104](/packages/client/src/shared-events.ts#L93-L104));
  the last subscriber out stops it
  ([shared-events.ts:63](/packages/client/src/shared-events.ts#L63)).
- **Late-joiner marker replay.** A subscriber attaching to a live connection
  immediately receives the cached `server.connected`
  ([shared-events.ts:102](/packages/client/src/shared-events.ts#L102)) — never
  business-event replay
  ([shared-events.test.ts:198-221](/packages/client/test/shared-events.test.ts#L198-L221)).
  The cache is cleared on stop
  ([shared-events.ts:18-22](/packages/client/src/shared-events.ts#L18-L22)).
- **Per-subscriber buffering.** Pending reads resolve directly; unread events
  queue up to 4,096, then that subscriber errors out — isolation, not
  backpressure.
- **No retry, no reconnection.** Source EOF/errors finish all subscribers with
  the original error identity
  ([shared-events.ts:36-46](/packages/client/src/shared-events.ts#L36-L46),
  [shared-events.test.ts:296-347](/packages/client/test/shared-events.test.ts#L296-L347));
  reconnect ownership stays with the consumer.
  [shared-events.test.ts:349-361](/packages/client/test/shared-events.test.ts#L349-L361)
  pins "no automatic retry".
- Rapid resubscription while old cleanup is still unwinding opens a
  replacement connection safely
  ([shared-events.test.ts:261-294](/packages/client/test/shared-events.test.ts#L261-L294)).

### Where SharedEvents is wired in

- **Promise wrapper**
  ([promise/client.ts:10-17](/packages/client/src/promise/client.ts#L10-L17)):
  `SharedEvents.make((signal) => raw.event.subscribe({ signal }))` at L12;
  the returned client replaces `event.subscribe` with the shared one. Upstream
  writes `event: events`; ours writes
  `event: { ...raw.event, subscribe: events.subscribe }` (L16) so the
  generated `event.controlled` namespace survives beside shared legacy
  subscriptions — this is the single port adaptation recorded in
  [port0](/.design/bus-smart/port0.glm53h.md).
- **Effect wrapper**
  ([effect/client.ts:27-46](/packages/client/src/effect/client.ts#L27-L46)):
  the native generated stream is wrapped once per shared connection via
  `Stream.toAsyncIterableWith`, cause identity is preserved through an
  `EventFailure` class, and `event: { ...raw.event, subscribe }` (L49) already
  spreads the generated namespace — byte-identical to upstream.
- **RPC events ride the shared stream.**
  [promise/rpc.ts:53-93](/packages/client/src/promise/rpc.ts#L53-L93) builds
  `rpc(definition).events.subscribe/on` by filtering the shared iterable —
  lazily; no subscriber exists until a plugin-style consumer calls it.
- **Consumers of the shared surface today:** the solid connection loop's
  default path
  ([connection.ts:88](/packages/client/src/solid/connection.ts#L88)), the
  controlled feed's legacy fallback
  ([controlled-event-feed.ts:173](/packages/client/src/solid/controlled-event-feed.ts#L173)),
  the mini transport (`tui/src/mini/stream-v2.transport.ts:1426`), CLI
  noninteractive (`cli/src/run/noninteractive.ts:72`), ACP
  (`cli/src/acp/event.ts:89`), and the SDK `events` re-export. In-process
  plugin consumers use the Core Bus directly and never touch this surface.

### What the solid connection loop owns

[connection.ts](/packages/client/src/solid/connection.ts) remains the single
owner of connection lifecycle for its subscribers:

- connect timeout 2s / reconnect delay 1s
  ([connection.ts:35-36](/packages/client/src/solid/connection.ts#L35-L36));
- the first-frame-must-be-`server.connected` check (L97-98);
- the reconnect loop with attempt counting and managed-service
  `options.reconnect` that swaps `api` for a freshly constructed client
  (L130-161, L148-158);
- generation fencing (`generation`, `started`) so a stopped connection's late
  promises cannot act (L53, L132, L140, L166-183);
- output batching: events accumulate in `pending` and flush on a
  `flushInterval` (default 10ms) timer inside a Solid `batch`
  (L63-72).

Our additions are purely additive: an optional `subscribe` adapter used
instead of `api.event.subscribe` (L86-88), domain-event/reconnect counters
(L54-56, L82-83, L117), and an `internal.diagnostics()` accessor (L214).

### What the controlled feed owns

[controlled-event-feed.ts](/packages/client/src/solid/controlled-event-feed.ts)
owns interest state and the controlled transport generation, nothing else:

- **Generation per connection attempt.** The adapter (an async generator,
  L148-203) creates one `Generation` per call, reads
  `api.event.controlled.subscribe` — the *raw generated* method, deliberately
  bypassing SharedEvents so subscription IDs map 1:1 to SSE lifetimes (L157);
- **Activation.** First frame must be `event-feed.ready`; its `subscriptionID`
  is captured and one coalesced activation PUT installs interest before any
  domain event is yielded (L160-190);
- **Interest algebra.** desired set vs transport target (removal grace,
  default 3s, L60, L205-265) vs installed set; exactly one PUT in flight via
  the `update`/`drain` loop (L90-146); `flush()` resolves when installed equals
  the transport target, and is an explicit no-op in legacy mode (L267-272);
- **Fallback.** Only a pre-ready 404 on the controlled GET falls back; the
  fallback stream is `api.event.subscribe` — i.e. the **shared** legacy
  connection of the wrapped client (L160-175). Non-404 failures propagate;
- **Generation invalidation.** A failed PUT aborts the generation's
  controller; determinate (400/404) rejections also reject `flush()` waiters
  (L121-132), matching draft0's "never claim the target was installed".

The TUI wires exactly one feed per client context
([tui/src/context/client.tsx:24](/packages/tui/src/context/client.tsx#L24))
and passes `subscribe: interest.subscribe` into the connection loop (L26-40).
The client itself is the wrapped `OpenCode.make`
([tui/src/app.tsx:212](/packages/tui/src/app.tsx#L212)), and managed-service
reconnection constructs a fresh wrapped client
([app.tsx:226](/packages/tui/src/app.tsx#L226)).

### The buffering stack, end to end

| Layer | Mechanism | Bound | Owner |
| --- | --- | --- | --- |
| Shared subscriber queue | per-subscriber array | 4,096 events, overflow = subscriber error | SharedEvents |
| Connection pending batch | `pending[]` + flush timer | unbounded during one 10ms window | connection loop |
| Controlled feed | no event buffering — interest coalescing only | one PUT in flight | controlled feed |

## Concrete bugs found

These are verified against source; each names the interleaving that triggers
it.

### 1. A dying generation can reject `flush()` waiters with a transient abort error

`drain()`'s catch classifies every non-`ClientError.Transport` failure as
determinate and calls `fail(error)`, rejecting all waiters
([controlled-event-feed.ts:121-132](/packages/client/src/solid/controlled-event-feed.ts#L121-L132)).
But an abort of a still-in-flight PUT when the **stream** drops (EOF/server
restart) is neither a determinate rejection nor an indeterminate PUT result —
it is teardown noise. The `subscribe` finally aborts the generation controller
and only afterwards clears `active`
([controlled-event-feed.ts:194-202](/packages/client/src/solid/controlled-event-feed.ts#L194-L202)),
so the PUT's `AbortError` can win the microtask race and take the `fail()`
branch while a reconnect — which would reinstall the same target on a fresh
generation moments later — is already scheduled.

This is user-visible: the new-session gate awaits
`client.interest.flush()`
([tui/src/component/prompt/index.tsx:1240](/packages/tui/src/component/prompt/index.tsx#L1240))
inside `newSession.gate`, and a rejection lands in `recover` as a
"Creating a session failed" toast (L1243 onward). A server blip racing session
creation can therefore fail prompt admission even though the system heals
itself within one reconnect delay.

**Smallest fix:** in `drain`'s catch, take the early `throw` when
`generation.controller.signal.aborted` (teardown already happened) in addition
to the existing `parent.aborted || active !== generation` guard, before any
`setState`/`fail()` side effects. Waiters then stay armed and are settled by
the next generation's activation or by dispose.

### 2. A determinate PUT rejection becomes an infinite ~1/s reconnect storm

When `replaceInterests` returns a declared 400 (e.g. interest exceeds server
bounds), `drain` throws, the adapter generator rejects, and the connection
loop treats it like any stream failure and reconnects after 1s
([connection.ts:130-161](/packages/client/src/solid/connection.ts#L130-L161) —
fixed delay, no exponential backoff). Each retry: fresh controlled GET (200),
ready, PUT, 400, throw. draft0 says a determinate rejection must terminate the
generation with a visible error and never downgrade to legacy — both hold —
but nothing makes it *terminal*: the same over-limit interest is re-sent
forever at line rate, ~2 requests/s, with `error` visible in status.

Reachability is narrow (the server bounds raw interest bodies, and TUI policy
should stay far under them) but it is a real loop, not a hypothetical.

**Smallest fix:** fingerprint suppression in the feed — remember the last
rejected `(transport target, declared status)` pair and short-circuit
`drain()` into the same visible-error path without issuing the PUT until
`setDesired` produces a different target. No protocol change; the error
surface stays as draft0 specifies.

### 3. Controlled is retried after *every* reconnect, not only managed-service ones

draft0 specifies "on a later managed-service reconnection, try the controlled
endpoint again" (server may have changed). The implementation resets
`mode: "connecting"` at the top of every generation
([controlled-event-feed.ts:154](/packages/client/src/solid/controlled-event-feed.ts#L154)),
so a legacy-fallback TUI against an old server re-attempts the controlled GET
after each legacy stream drop. Cost is one 404 per reconnect; behavior is
otherwise correct and self-limiting. **Recommendation: accept and document the
divergence** rather than add reconnect-cause plumbing to the adapter's
signature; tightening it is only warranted if the 404 noise shows up in
diagnostics.

### 4. Transient state flicker on the same race as bug 1

If `drain`'s catch runs before the `subscribe` finally clears `active`, it
mutates the store for a dying generation (`mode: "connecting"`,
`installed: undefined`, `error`) before the next generation immediately
overwrites it. Cosmetic; the fix for bug 1 removes this path too.

## Hypothetical risks checked and cleared

- **Double ingestion (shared firehose + controlled stream concurrently).**
  Not present in the TUI today: with the controlled adapter installed, the
  only subscriber surfaces for `api.event.subscribe` are the fallback path
  (dormant unless a 404 occurred) and lazy `rpc.events` (unused by the TUI —
  no `rpc` usage in `packages/tui/src`); the solid PTY client uses its own
  ticket/WebSocket transport and never subscribes to events. So in controlled
  mode the SharedEvents singleton never starts, and the TUI parses exactly one
  stream. *Structural hazard, not a bug:* any future TUI code that calls
  `api.event.subscribe` or `rpc.events.on` would silently start the legacy
  firehose next to the controlled stream. Nothing guards against this; a
  comment on the fallback line and a gate test (below) are cheap insurance.
- **SharedEvents capacity overflow in fallback mode.** The connection loop
  drains promptly (await-driven read + 10ms batch), so the 4,096 queue fills
  only if the consumer genuinely stalls for thousands of events; the failure
  mode is that subscriber erroring → normal disconnect/reconnect. Isolation
  is exactly what #46393 bought.
- **Cached `server.connected` replay corrupting reconnect semantics.** The
  cache exists only while the underlying connection is live (cleared on
  stop), so a reconnecting subscriber either gets a real first frame from a
  fresh connection or the cached marker of a still-live one. The connection
  loop's first-frame check composes correctly either way; pinned by
  [shared-events.test.ts:198-221](/packages/client/test/shared-events.test.ts#L198-L221).
- **Connect-timeout vs shared-connection startup.** If the shared source is
  mid-connect when the loop's 2s timeout fires, the loop aborts *its*
  subscriber; as the only subscriber it tears the shared connection down, so
  the next attempt starts fresh rather than piling onto a stuck stream. The
  rapid-resubscription test
  ([shared-events.test.ts:261-294](/packages/client/test/shared-events.test.ts#L261-L294))
  covers the overlap window.

## What actually reduces CPU now

Upstream's SharedEvents already deduplicated *connections per client
process* — its win applies to multi-subscriber processes (SDK/app rpc events,
workerd profile) and to any consumer that subscribed more than once. The TUI
was already a single-SSE consumer via one connection loop, so for the TUI the
rebase did not change wire volume. The controlled feed's reduction is
**admission**: fewer events cross the wire, get parsed by the SSE decoder,
fan out through the loop's batching, and hit the Solid projection. The
remaining per-event costs (10ms batch flush, emitter dispatch, `data.ts`
projection) all scale with admitted events only. The measurement gates are
already in the tree: `receivedDomainEvents`/`reconnects`
([connection.ts:117](/packages/client/src/solid/connection.ts#L117),
[L214](/packages/client/src/solid/connection.ts#L214)), the client event-feed
counters, and server-side overflow logging.

## Upstream compatibility assessment

| Surface | State vs `v2@origin` | Rebase risk |
| --- | --- | --- |
| `shared-events.ts` | byte-identical | none |
| `effect/client.ts` | byte-identical | none |
| `promise/client.ts` | one line: `event: { ...raw.event, subscribe: events.subscribe }` vs upstream `event: events` | small — conflict only if upstream edits the wrapper; our spread is strictly more preserving (upstream's own replacement would drop any future generated `event.*` methods, ours keeps them) |
| `solid/connection.ts` | additive: adapter option + counters + diagnostics accessor | low — conflicts confined to `connect()`'s iterator construction |
| generated trees | `event.controlled.*` additive ([promise/generated/client.ts:1667-1689](/packages/client/src/promise/generated/client.ts#L1667-L1689)) | mechanical regenerate (`bun run generate` from `packages/client`) |

The generated `event` namespace keeps `subscribe` and `controlled` as sibling
members, so the wrapper's spread is the only place the two designs touch on
the promise surface; the Effect surface already spread and needed no change.

## Recommendation — smallest coherent design

**Keep the current three-owner split.** Post-rebase it is already the smallest
coherent shape and each owner has a crisp contract:

1. **SharedEvents** — per-process legacy SSE multiplexing, bounded
   per-subscriber buffering, late-joiner marker replay. Upstream-owned,
   byte-identical, do not fork it.
2. **connection loop** — the only reconnect/backoff/managed-service/generation
   fence in the client. Both raw and controlled streams flow through it.
3. **controlled feed** — interest algebra and one-PUT-in-flight generation
   control; no buffering, no reconnection logic of its own.

Land the two small fixes from the bug list (teardown-abort waiter guard in
`drain`; rejected-target fingerprint suppression) plus one guard comment/test
for the dormant-shared-firehose hazard. No structural change is needed for
draft1's CPU goal.

## Alternative unify strategy (when a second controlled consumer appears)

SharedEvents is transport-agnostic — it takes a `(signal) => AsyncIterable`
callback — so the unify path is already available:

- **Near-term:** when a second in-process controlled consumer appears
  (devtools bar, multi-view surfaces), wrap the controlled stream in its own
  `SharedEvents.make` inside the feed module, exactly as
  [promise/client.ts:12](/packages/client/src/promise/client.ts#L12) wraps
  legacy. Interest control (PUTs, generations, fallback) stays in the feed;
  only SSE fanout is shared. No wire or protocol change.
- **Longer-term:** move the SharedEvents instantiation out of the promise
  wrapper into a pluggable "active transport" so `rpc.events` and future
  SDK consumers can transparently ride whichever stream is live (controlled
  or legacy), making fallback a transport-level fact instead of a feed-level
  branch. This is a genuine refactor of upstream-owned wiring — propose it
  upstream only after controlled delivery graduates, per draft0's graduation
  open item.

Today there is exactly one controlled consumer (the connection loop), so both
steps are speculative; do not build them into draft1.

## Tests and gates

Existing (post-port, per
[port0](/.design/bus-smart/port0.glm53h.md) — 54 client tests pass / 3 browser
skips; contract surfaces 28 pass):

- [shared-events.test.ts](/packages/client/test/shared-events.test.ts): 14
  tests covering laziness, sharing, slow/idle consumer isolation, capacity
  overflow, buffered-event preservation across EOF, marker-only replay,
  abort isolation, for-await break, rapid resubscription, error identity, and
  no-auto-retry.
- `solid-controlled-event-feed.test.ts` (364 lines) and
  `solid-connection.test.ts` (93 lines) — pass per the port matrix; contents
  not re-reviewed in this pass (see below).

Proposed gates for the findings above, in priority order:

1. **Flush survives generation death:** stream EOF while a PUT is in flight
   and a `flush()` waiter armed → waiter resolves on the *next* generation's
   activation (pin after the bug-1 fix; today it may reject).
2. **Determinate rejection is bounded:** `replaceInterests` returning 400
   twice with an unchanged target → no third PUT (pin after the bug-2 fix).
3. **No shared firehose while controlled:** with the controlled stream
   healthy, assert the legacy connect callback passed to `SharedEvents.make`
   is never invoked; after fallback, assert exactly one shared connection.
4. **Fallback retry scope:** after legacy fallback, a plain stream drop
   re-attempts the controlled GET once per reconnect (documents finding 3 as
   intended).

Run gates from `packages/client` (`bun test`, `bun typecheck`); live
acceptance stays the two-project `dev:live` reproduction from draft0 with the
diagnostics counters as the before/after evidence.

## Unverified questions

- Contents of `solid-controlled-event-feed.test.ts` and
  `solid-connection.test.ts` were not re-read this pass; the proposed gates
  may partially exist there already. Check before writing new tests.
- Whether the Effect generated tree exposes `event.controlled` with identical
  shapes (port0's matrix implies yes via regenerated contract tests; not
  inspected directly here).
- The exact import path in `app.tsx` for `OpenCode.make` (verified the symbol
  and that the promise surface's `OpenCode` is the SharedEvents wrapper; the
  import statement itself was not read).
- Whether `dev:live`'s implicit managed-service replacement path (older
  elected server) ever exercises the fallback-with-cached-`connected`
  interplay in practice — the analysis says it is safe; no live run was
  performed here.
- Server-side pending-subscription accumulation during the bug-2 storm:
  scoped SSE cleanup should remove each abandoned record, but the bound was
  not measured.

## Cross-references

- [draft0](/.design/bus-smart/draft0.gpt56s.md) — the controlled feed design
  whose client half this research re-validates post-rebase; its fallback and
  determinate-rejection rules are the ones findings 2-3 measure against.
- [port0](/.design/bus-smart/port0.glm53h.md) — recorded the wrapper
  one-liner this research explains in full; its verification matrix is the
  baseline the proposed gates extend.
- [research-client-compat0](/.design/bus-smart/research-client-compat0.glm53.md)
  — the pre-SharedEvents consumer census; every row still holds, but its
  "one SSE per subscriber" framing predates the multiplexer and should be
  read with this document's ownership map.
- [verification0](/.design/bus-smart/verification0.gpt56s.md) — release gates
  (notification scope, live reproduction) that remain open independently of
  these client findings.
