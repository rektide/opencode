---
type: Research
title: Client event ownership after the SharedEvents rebase
description: Source-grounded reconciliation of shared legacy subscriptions, controlled-feed generations, reconnect ownership, and the smallest client boundary needed for real fanout CPU reduction.
resource: /.design/bus-smart/research1-client-ownership.gpt6a.md
tags: [client, events, sse, shared-events, controlled-feed, reconnect, cpu, upstream]
status: draft
generated: { by: "agent:gpt-6-astra#xhigh", at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-12-05
sources:
  - id: directional-draft
    resource: /.design/bus-smart/draft0.gpt56s.md
    title: Controlled event feed — directional draft
  - id: port
    resource: /.design/bus-smart/port0.glm53h.md
    title: Controlled event feed v2@origin port
  - id: compatibility-research
    resource: /.design/bus-smart/research-client-compat0.glm53.md
    title: Controlled-feed client compatibility surface
  - id: upstream-base
    resource: https://github.com/anomalyco/opencode/commit/2960c61f9c5c
    title: Rebased upstream snapshot at v2 issue 47464
  - id: shared-events
    resource: /packages/client/src/shared-events.ts
    title: Upstream SharedEvents implementation
  - id: controlled-source
    resource: /packages/client/src/solid/controlled-event-feed.ts
    title: Controlled source and interest controller
  - id: connection
    resource: /packages/client/src/solid/connection.ts
    title: Solid connection lifecycle owner
---

# Client event ownership after the SharedEvents rebase

**Authorship:** GLM-5.3#max (GX) gathered the initial source census, upstream
comparison, and ownership analysis in this session. GPT-6 Astra synthesized
this report and checked the missing generated-transport and test evidence.
The report corrects unsupported hypotheses from that conversation; no earlier
same-wave report was used. No production changes, tests, or live-service
operations were performed for this report.

## Conclusion

**There are not two hidden reconnect loops.** Upstream `SharedEvents` multiplexes
one live source but never retries it. The generated Promise SSE transport also
makes one request and terminates on EOF/error. `createClientConnection` is the
retry and managed-service-resolution owner for the TUI's logical subscription;
the controlled adapter owns interest and negotiation, not reconnection.

Keep that division for draft1. Define the existing adapter as a **one-attempt
domain-event source**, retain shared legacy fallback unless a concrete caller
requires exclusive physical-stream ownership, and test the composition rather
than replacing upstream sharing. The controlled path already bypasses the
legacy SharedEvents instance. Thus it can reduce foreign-event network/parse/
projection work without undoing upstream's multi-reader isolation.

The important qualifications are:

- Sharing is **per client instance**, not process-global or cross-TUI.
- An attempt using shared fallback owns a **logical attachment**, not the
  underlying socket. Aborting it must not disconnect another subscriber.
- The feed controller is not a multi-subscriber interest manager. Concurrent
  calls overwrite its single `active` slot, and the stale pre-ready-404 branch
  does not have the fencing present on the successful controlled path.
- Persistent invalid interest is retried by the connection loop. That is an
  actual retry-policy consequence, not evidence of competing reconnect owners.
- The existing standalone tests do not establish the full reconnect/fallback/
  concurrent-subscriber composition, and three connection tests are
  browser-gated.

## Evidence boundary and upstream comparison

GX checked `/home/rektide/archive/anomalyco/opencode` first (also available as
`~/a/a/opencode`). That archive worktree remained at the older base
`e70d667a9fe3` / #46171 and had no `shared-events.ts`. The relevant newer
upstream source was available locally in this workspace's jj history at
`2960c61f9c5c` (`lwoszptrpqvn`, #47464); it was inspected there without fetching
or changing the archive.

Upstream introduced sharing with
[`6a2c3e91c780`, typed RPC/custom events](https://github.com/anomalyco/opencode/commit/6a2c3e91c780)
and changed it to bounded isolated consumers with
[`ac77cc46b811`, #46393](https://github.com/anomalyco/opencode/commit/ac77cc46b811).
At the rebased snapshot, GX's direct comparison found:

| File | Downstream difference |
| --- | --- |
| `packages/client/src/shared-events.ts` | None. |
| `packages/client/src/effect/client.ts` | None. |
| `packages/client/src/promise/client.ts` | Preserve generated methods with `event: { ...raw.event, subscribe: events.subscribe }`, instead of upstream's `event: events`. |
| `packages/client/src/solid/connection.ts` | Optional stream adapter plus event/reconnect diagnostics; upstream's lifecycle loop remains. |

These are comparisons to the **port base**, not claims about today's remote
tip. References below point to current worktree sources, whose relevant
implementations were read in this research.

## Actual ownership, termination, and buffering

| Layer | Owns | Does not own |
| --- | --- | --- |
| Generated Promise `sse` | One fetch, SSE parsing, reader cancellation on iterator closure. | Retry, client-level sharing, controlled interest. |
| `SharedEvents.make` | One current source per factory instance; subscriber membership, marker cache, bounded per-reader queues. | Retry, managed-service election, interest union, durable replay. |
| Promise/Effect wrapper | One SharedEvents instance per constructed client; native and RPC subscription wiring. | A process-wide singleton or controlled-source selection. |
| Controlled adapter | One active control generation, desired/held/installed interest, serial PUTs, ready interception, pre-ready-404 fallback. | Reconnect delay, service resolution, multi-reader fanout. |
| Solid connection | Retry loop, connect timeout, service/API replacement, UI connection state/history, batched domain dispatch. | Server interest semantics or ownership of other SharedEvents subscribers. |

### Generated transport: truly one request

The generated Promise
[`sse` iterator](/packages/client/src/promise/generated/client.ts#L353-L406)
fetches once, parses every frame in a chunk, returns when `reader.read()` says
done, and cancels/releases the reader in `finally`. There is no SSE retry or
`Last-Event-ID` loop. The parser has a `maxSseEventBytes` buffer check
([L298](/packages/client/src/promise/generated/client.ts#L298),
[L375-L376](/packages/client/src/promise/generated/client.ts#L375-L376)); this
is not a domain-event queue.

Fetch failures, **including abort rejections**, become
`ClientError("Transport")`
([L323-L329](/packages/client/src/promise/generated/client.ts#L323-L329)); read
failures receive the same classification
([L369-L374](/packages/client/src/promise/generated/client.ts#L369-L374)).
Declared HTTP failures instead throw the decoded error body; unexpected
statuses become `UnexpectedStatus`
([L332-L338](/packages/client/src/promise/generated/client.ts#L332-L338)).

### SharedEvents: EOF is observable, cancellation is local

[`SharedEvents.make`](/packages/client/src/shared-events.ts#L3-L46) stores
`current` inside the factory. Creating a client, iterable, or idle iterator
opens nothing; first `next()` registers the reader and starts the source
([L93-L125](/packages/client/src/shared-events.ts#L93-L125)). Separate
`OpenCode.make` calls do not share that `current`.

- **EOF/error:** stop and clear the current connection, close its iterator,
  then finish its subscribers. Existing queued events are retained on source
  completion; after draining them the reader observes EOF or the source
  error. There is no automatic replacement source. A later subscription can
  open a new one
  ([L24-L46](/packages/client/src/shared-events.ts#L24-L46),
  [L59-L89](/packages/client/src/shared-events.ts#L59-L89),
  [tests L181-L196](/packages/client/test/shared-events.test.ts#L181-L196),
  [L296-L361](/packages/client/test/shared-events.test.ts#L296-L361)).
- **Abort/return:** discard that reader's queue and settle its pending reads;
  abort the source only if it was the last reader. Another reader remains
  live ([L59-L71](/packages/client/src/shared-events.ts#L59-L71),
  [L127-L129](/packages/client/src/shared-events.ts#L127-L129),
  [tests L223-L244](/packages/client/test/shared-events.test.ts#L223-L244)).
- **Late join:** immediately enqueue the latest cached `server.connected`
  from the live source, but no preceding business events. Stop clears the
  cache. A cached marker therefore means attachment to an already-live
  source, **not a fresh HTTP handshake**
  ([L18-L22](/packages/client/src/shared-events.ts#L18-L22),
  [L31-L34](/packages/client/src/shared-events.ts#L31-L34),
  [L102](/packages/client/src/shared-events.ts#L102),
  [tests L198-L221](/packages/client/test/shared-events.test.ts#L198-L221)).
- **Slow reader:** at 4,096 unread events, the next offer fails that reader
  and discards its backlog. Other readers are not backpressured
  ([L16](/packages/client/src/shared-events.ts#L16),
  [L78-L89](/packages/client/src/shared-events.ts#L78-L89),
  [tests L122-L179](/packages/client/test/shared-events.test.ts#L122-L179)).
- **Cleanup overlap:** a replacement may start while old source cleanup is
  pending. The old connection cannot clear the new `current`
  ([tests L261-L294](/packages/client/test/shared-events.test.ts#L261-L294)).
  Any future source injected beneath this pool must tolerate that lifecycle.

### Wrappers and RPC

The [Promise wrapper](/packages/client/src/promise/client.ts#L10-L17) binds
SharedEvents to **raw legacy** `raw.event.subscribe`. Its `rpc` helper filters
that same shared source only when an RPC event consumer subscribes
([promise/rpc.ts:53-93](/packages/client/src/promise/rpc.ts#L53-L93)). The raw
generated controlled methods survive through the spread; they do not silently
join the legacy pool.

The [Effect wrapper](/packages/client/src/effect/client.ts#L26-L56) likewise
shares legacy events, retaining native typed failures/defects through its
`EventFailure` bridge and the context captured at client construction. It
already spreads `raw.event`; controlled methods are exercised through the
wrapper in the
[Effect contract test](/packages/client/test/effect.test.ts#L161-L201).
Do not replace this with a Promise-only failure adapter in a future unification.

### Controlled adapter plus Solid connection

The [controlled subscription](/packages/client/src/solid/controlled-event-feed.ts#L148-L203)
opens a raw controlled GET, consumes ready, and awaits the serial interest
drain before yielding domain events. It may perform multiple coalesced PUTs
before its first yield if the target changes during activation; the
[coalescing test](/packages/client/test/solid-controlled-event-feed.test.ts#L113-L156)
already demonstrates this. It is not an unconditional “exactly one PUT” rule.

Pre-ready GET 404 enters shared legacy fallback. PUT 404 is a control rejection,
not feature negotiation. Failed PUTs invalidate that control generation; only
transport-class failures leave `flush()` waiters pending for a later successful
generation
([drain L104-L145](/packages/client/src/solid/controlled-event-feed.ts#L104-L145),
[fallback L160-L175](/packages/client/src/solid/controlled-event-feed.ts#L160-L175),
[classifiers L316-L324](/packages/client/src/solid/controlled-event-feed.ts#L316-L324)).

The [Solid loop](/packages/client/src/solid/connection.ts#L74-L161) requires
`server.connected` as its first domain event, aborts its attempt signal on exit,
and retries. It uses a 2s initial timeout and ordinarily a 1s retry delay; a
successful first managed-service resolution can skip that delay. This timeout
includes the controlled GET **and activation PUT**, not just network connection.

Domain events enter an array flushed in a Solid batch after 10ms by default
([connection.ts:63-72](/packages/client/src/solid/connection.ts#L63-L72)).
That batch has no explicit event-count bound; “one bounded server FIFO” never
meant every client buffer was bounded. Shared fallback adds its bounded reader
queue before this batch; controlled delivery adds no equivalent JS fanout queue.

## Composition scenarios and concrete limits

### Healthy controlled TUI: no hidden legacy firehose

The TUI creates one controller and supplies its source to the connection loop
([context/client.tsx:24-40](/packages/tui/src/context/client.tsx#L24-L40)). Its
API is the public wrapper
([client package exports](/packages/client/package.json#L18-L26),
[app.tsx:211-226](/packages/tui/src/app.tsx#L211-L226)). GX's TUI source census
found no direct RPC-event subscribers; PTY uses its separate transport. The
existing
[activation test](/packages/client/test/solid-controlled-event-feed.test.ts#L40-L73)
also asserts zero legacy GETs while controlled delivery succeeds.

Consequently, upstream sharing does **not** force a match-all SSE beside this
TUI's controlled source. But a future direct `api.event.subscribe()` or
`api.rpc(definition).events.subscribe()` on the same API would start the legacy
pool. That is a concrete integration trap, not a current duplicate-ingestion bug.

### Fallback with another legacy/RPC reader

If an independent reader already holds the API's legacy stream, fallback joins
it, receives the cached connected marker, then only future business events.
The marker is useful: current data handling schedules authoritative refreshes
on `server.connected`
([data.ts:569-600](/packages/client/src/solid/data.ts#L569-L600)). It is not a
claim that missed events were replayed.

Aborting the TUI detaches just its reader. A later TUI attempt can try controlled
again, or rejoin the still-live legacy pool and obtain the same marker. Physical
EOF finishes all readers, but only consumers that explicitly resubscribe recover;
RPC event subscriptions are not automatically revived by the TUI's reconnect.

These semantics are coherent for a volatile logical feed. They violate a
stronger promise that “every TUI reconnect creates/owns a fresh socket,” so
draft1 must not make that promise while using shared fallback.

### Source-confirmed gaps versus unsupported bug claims

| Finding | Evidence and qualification |
| --- | --- |
| **Persistent declared 400 is repeatedly retried.** | The controller fails the generation and the Solid loop opens another attempt with the unchanged desired target. This can generate repeated GET/PUT traffic and visible errors. It satisfies draft0's per-generation rejection/no-downgrade rule; permanent suspension is an additional policy decision, not an already-specified guarantee. PUT 404 may heal on a new subscription, so do not suppress all declared failures together. |
| **Overlapping generations can take a stale fallback branch.** | `active` is a single mutable slot. If an older pending controlled GET later rejects 404 after a newer generation succeeds, only `active = undefined` is identity-guarded; `setState(mode: "legacy")`, `settle()`, and the old legacy subscription are not ([L160-L174](/packages/client/src/solid/controlled-event-feed.ts#L160-L174)). This can misreport mode, settle waiters, and open/yield the obsolete fallback stream. The production Solid loop serializes attempts, limiting ordinary exposure. The controller's overlapping-generation test covers late **success**, not this error branch ([test L248-L292](/packages/client/test/solid-controlled-event-feed.test.ts#L248-L292)). Do not use repeated `feed.subscribe` calls as fanout. |
| **Retrying controlled after each fallback disconnect is intentional current behavior.** | The adapter probes every invocation, even with the same API instance. The fallback test explicitly expects two controlled probes across two attempts ([L103-L109](/packages/client/test/solid-controlled-event-feed.test.ts#L103-L109)). One log entry is suppression of duplicate logs, not persistent negative capability caching. |
| **“Teardown abort necessarily rejects flush” is not established.** | GX raised this hypothesis before inspecting generated error conversion. Fetch aborts become `ClientError("Transport")`, and the controller does not `fail()` waiters for that class. A cosmetic teardown/error-state race remains possible, but the claimed normal abort-driven prompt failure does not follow from the actual path. Do not land its proposed fix on that premise. |
| **An arbitrary adapter can prevent shutdown.** | The connection aborts a signal but does not explicitly return the iterator ([connection.ts:123-127](/packages/client/src/solid/connection.ts#L123-L127)). A source whose pending `next()` ignores abort can block the serialized restart. One existing fixture intentionally waits forever ([connection test L16-L20](/packages/client/test/solid-connection.test.ts#L16-L20)); it does not verify teardown. This is a missing adapter contract/test, not evidence that native fetch fails cancellation. |

New-session `flush()` failures do matter to users: the prompt setup gate awaits
flush and routes rejection through session-setup recovery
([prompt/index.tsx:1235-1250](/packages/tui/src/component/prompt/index.tsx#L1235-L1250)).
Pin its behavior using the real generated error path, not an unwrapped mock
`AbortError` that cannot represent that path.

## Smallest coherent draft1 boundary

Retain the current type; give it this precise **one-attempt** contract. No new
transport class, callback registry, or reconnect implementation is necessary.

```ts
// Existing EventStreamAdapter shape; one logical subscription attempt.
type EventAttemptSource = (
  api: OpenCodeClient,
  signal: AbortSignal,
) => AsyncIterable<OpenCodeEvent>
```

1. **No retries inside a source.** EOF/error is terminal for the attachment.
   One controlled attempt may probe controlled and then attach legacy after a
   pre-ready 404; that bounded negotiation is not a reconnect loop.
2. **One active consumer of a controller.** A fresh source invocation follows
   termination/cancellation of the previous one. If overlap remains supported
   for generation fencing, every asynchronous branch—including pre-ready
   fallback—must reject obsolete work before changing state or opening a stream.
3. **Domain output only.** First yielded item is `server.connected`; ready
   remains private. A shared source may replay its live cached marker, but no
   business replay is promised. Later physical replacement must end the old
   attachment rather than silently reconnect beneath its owner.
4. **Cancellation is a resource contract.** A pre-aborted signal opens nothing;
   abort settles a pending read and releases only this attachment's resources.
   The owner aborts first and should close the iterator in `finally`; calling
   `return()` alone cannot unblock an async generator stuck in a pending read.
   The present controller needs an explicit pre-abort check if this guarantee
   is made formal (it currently only adds a future abort listener at L151-L152).
5. **Control generation is the PUT fence.** A quiescent fresh generation installs
   the current target; churn coalesces behind one in-flight PUT. Unknown results
   invalidate that subscription ID, never retry in place. Cancellation must not
   masquerade as a declared rejection, and old responses cannot install state.
6. **Retry policy stays above this interface.** Managed API replacement, delays,
   lifecycle restarts, and status belong to the connection owner. If persistent
   invalid-interest suspension is wanted, represent that policy explicitly and
   resume on meaningful target/server change; do not add a second retry loop or
   an undifferentiated 400/404 memoization cache inside the source.

“One attempt” deliberately means one **logical attachment**. The current
raw-controlled/shared-legacy composition meets the essential ownership split
without guaranteeing physical exclusivity in fallback. The most useful first
change is a composition test for those semantics; fence stale fallback and
formalize cancellation where tests expose gaps.

### Raw versus shared legacy fallback

| Choice | Benefit | Cost / constraint |
| --- | --- | --- |
| **Keep `api.event.subscribe` shared fallback — recommended first carry.** | Preserves upstream reader isolation and avoids another legacy parser/socket when another reader already exists. Smallest downstream diff. | Logical attachment semantics; cached connected is allowed; abort is not necessarily a physical disconnect. |
| **Explicit raw legacy one-attempt source.** | Controlled and fallback transports both have exclusive physical lifetime, which simplifies that stronger invariant. | Needs a narrow hand-written injection/access point while `raw` exists in the wrapper; public shared `subscribe` must stay unchanged. Coexisting legacy/RPC readers now create another full-feed socket/parser. Do not reconstruct authentication/fetch options in Solid or import generated internals around the wrapper. |

Raw fallback is a reasonable architectural choice **if physical ownership is a
requirement**. It is not a demonstrated CPU fix: both fallbacks carry the full
legacy feed, and raw can increase duplicate processing in multi-reader clients.

## Bounded sharing alternative, when actually needed

If a second controlled reader needs the same event policy, reuse upstream's
bounded pool around a **controlled-or-raw-legacy one-attempt source**, rather
than invoking one mutable feed controller independently for every reader:

```text
one interest-policy owner → one controlled negotiation/PUT controller
                                      ↓ domain-only one-attempt source
                          SharedEvents (4096 per reader)
                              ↓                    ↓
                       logical reader        logical reader
                       / lifecycle owner     / lifecycle owner
```

Requirements for this alternative:

- Construct the pool for the correct API/server lifetime; keep old cleanup from
  replacing new state. Do not capture a permanently stale API in a callback
  while higher-level reconnect swaps clients.
- Negotiate/activate **once below sharing**. Consume ready before fanout; replay
  only connected. Preserve EOF/error propagation, error identity, slow-reader
  isolation, and last-reader cancellation. Do not place an autonomous reconnect
  loop below the pool while also retaining reconnecting consumers above it.
- Use a **raw fallback inside this pool**, so it does not nest a controlled
  SharedEvents pool over the public legacy SharedEvents pool. The raw source
  should be supplied at a hand-written construction boundary, not recovered by
  reverse-engineering a wrapped client.
- Share only a compatible policy. Multiple `setDesired` writers otherwise mean
  last-writer-wins, not a union. Independent readers need declared interest
  contributions and one union owner; union overdelivery must be explicit.
- A reader requiring the full feed cannot transparently join a filtered feed.
  Either retain its separate legacy source or explicitly broaden the union,
  which may erase the intended CPU saving. This applies to generic RPC readers
  too; their event routing cannot be assumed to match the TUI's interest.
- Preserve the public legacy Promise/Effect/RPC contracts. A general
  headless-client integration cannot depend on today's Solid-specific controller
  or lose the Effect wrapper's captured context and typed failure preservation.

This is bounded reuse, not a mandate to unify every client now. With only one
controlled TUI reader, inserting another pool adds buffering and lifetime work
without reducing wire events. A transparent replacement of public legacy
`event.subscribe` by a scoped feed would be an upstream compatibility change,
not an internal optimization.

## CPU claim and compatibility gates

SharedEvents saves duplicate fetch/parse work **within one client instance**
when it has multiple readers. It cannot reduce the fanout of a busy server into
separate TUI processes, and it does not filter foreign events. Controlled
server admission can remove those events before client decoding and projection.
That is the relevant draft1 CPU mechanism; no reduction has been measured here.

Keep the wrapper spread preserving `event.controlled`, retain both generated
surfaces, and leave upstream SharedEvents behavior unchanged. Existing consumer
signatures alone are insufficient verification: measure physical GET count,
active readers, decoded/domain event count, CPU, and mode during coexistence and
fallback. The current
[connection counters](/packages/client/src/solid/connection.ts#L82-L88)
count logical subscription attempts; shared reattachments need not equal new
physical GETs. Domain counting at
[L117](/packages/client/src/solid/connection.ts#L117) likewise does not measure
all client-instance traffic when another legacy reader exists.

### Existing evidence and the missing tests

The [port report](/.design/bus-smart/port0.glm53h.md#L41-L55) records prior
passing suites; those results were not rerun here. Source review confirms:

- SharedEvents already tests laziness, multi-reader isolation, finite buffering,
  marker-only replay, EOF/error without retry, and overlapping cleanup.
- Controlled tests already cover zero legacy GETs on success, fallback probes
  on successive invocations, coalescing/grace, indeterminate PUT recovery,
  late-success fencing, and 400/404 no-downgrade behavior.
- The test named
  [“reconnects after an indeterminate PUT”](/packages/client/test/solid-controlled-event-feed.test.ts#L198-L246)
  manually returns the first iterator and opens another. It proves controller
  restoration, not the composed connection loop's actual cancellation/retry.
- All three
  [Solid connection tests](/packages/client/test/solid-connection.test.ts#L1-L93)
  use `browserTest = isServer ? test.skip : test`; a normal server-condition
  pass is not a reconnect-integration proof.

Priority composition gates:

1. **One healthy controlled stream:** wrapped API + controller + connection
   receive foreign traffic only when admitted; no legacy GET. The existing
   controller-only test is the starting precedent.
2. **Shared fallback coexistence:** hold a legacy/RPC reader, fall back the TUI,
   assert one physical legacy GET and marker-only late join; abort the TUI,
   prove the other reader still receives events; retry on a replacement API and
   prove controlled is probed again.
3. **EOF/overflow recovery:** finish the actual response while readers have
   buffered events; verify ordered tail then termination, no hidden retry, and
   a new connection-owned attempt. Overflow one idle reader while a fast reader
   stays live; do not confuse local reader failure with server overflow.
4. **PUT uncertainty with the real wrapper:** drop the stream during a pending
   PUT and armed flush; verify generated Transport classification, old-ID
   invalidation, and flush settlement after new activation—not after stale
   responses. Exercise initial activation and later updates.
5. **Cancellation/fencing:** pre-aborted source, abort during ready/PUT/read,
   explicit iterator closure, and an obsolete GET resolving 404 after a new
   controlled generation succeeds. Decide whether overlap is prohibited or
   supported, then pin that rule.
6. **Persistent rejection:** reproduce repeated unchanged-interest 400 across
   real connection attempts; decide suspend/retry policy separately from
   recoverable subscription-not-found. Never silently downgrade.

From `packages/client`, use `bun test test/shared-events.test.ts
test/promise.test.ts test/effect.test.ts test/solid-controlled-event-feed.test.ts`
and `bun typecheck` for implementation follow-up. Run connection integration
under actual browser conditions (and assert those tests executed, not skipped)
or extract the lifecycle runner for headless testing. No browser-condition
command was validated during this documentation-only pass.

The final release gate remains draft0's two-project before/after reproduction
with real server admission, CPU, event volume, and reconnect/overflow counts.
Legacy fallback is compatibility mode, **not** evidence of filtering success.

## Cross-references

- [Directional draft0](/.design/bus-smart/draft0.gpt56s.md#L596-L666) established
  the adapter/connection split and generation-fenced interest. This report
  preserves it while distinguishing physical transport from logical shared
  attachment after the rebase.
- [Port0](/.design/bus-smart/port0.glm53h.md#L30-L39) explains the wrapper
  preservation change. This report supplies the behavioral interpretation that
  a clean merge and additive generated methods alone cannot establish.
- [Client compatibility research0](/.design/bus-smart/research-client-compat0.glm53.md)
  is the earlier consumer census, not the current retry or wire specification:
  it predates SharedEvents and contains proposals superseded by draft0. Preserve
  its non-TUI compatibility intent, not its obsolete adapter mechanics.

**Remaining uncertainty:** no runtime interleaving, browser-condition command,
server cleanup rate, or live CPU result was established in this pass. Those are
verification gates, not reasons to invent another connection owner.
