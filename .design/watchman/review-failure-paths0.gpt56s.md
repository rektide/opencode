---
type: Review
title: Watchman failure-path and test audit
description: Verified audit of acquisition, recovery, subscribe-response delivery, fallback, fatal-state lifetime, stream termination, Parcel behavior, and the smallest deterministic policy test matrix.
resource: /.design/watchman/review-failure-paths0.gpt56s.md
tags: [opencode, watchman, review, failure-policy, fallback, recovery, subscribe-response, parcel, tests]
status: draft # Runtime findings are verified; the policy section is deliberately provisional.
generated: { by: model:openai-gpt-5.6-sol, at: 2026-09-01T21:25:18-04:00 }
verified: { by: model:openai-gpt-5.6-sol, at: 2026-09-01T21:25:18-04:00 }
stale_after: 2026-10-01
sources:
  - id: consolidation-vision
    resource: /.design/watchman/vision0.gpt56s.md
    title: Watchman consolidation vision
  - id: fallback-discovery
    resource: /.design/watchman/fallbacks0.glm53.md
    title: Watchman fallback semantics
  - id: since-query-assessment
    resource: /.design/watchman/topic-query0.glm53.md
    title: Since-query semantics vs the root-scoped Watchman client
  - id: root-implementation
    resource: /packages/core/src/filesystem/watcher/watchman/root.ts
    title: Root-scoped Watchman registry, acquisition, and recovery
  - id: watcher-implementation
    resource: /packages/core/src/filesystem/watcher.ts
    title: Generic watcher registry and Parcel/Node adapter
  - id: backend-adapter
    resource: /packages/core/src/filesystem/watcher/watchman/backend.ts
    title: Watchman Native adapter and Parcel fallback
  - id: watchman-tests
    resource: /packages/core/test/filesystem/watchman-root.test.ts
    title: Injected root connection tests
  - id: watcher-tests
    resource: /packages/core/test/filesystem/watcher.test.ts
    title: Generic watcher lifecycle tests
  - id: daemon-subscribe
    resource: file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands/subscribe.rs
    title: watchwoman subscribe command and initial response
  - id: effect-rcmap
    resource: file:///home/rektide/src/opencode-watchman/node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/src/RcMap.ts
    title: Effect RcMap reference lifetime implementation
  - id: parcel-watchman
    resource: file:///home/rektide/archive/parcel-bundler/watcher/src/watchman/WatchmanBackend.cc
    title: Parcel Watchman event mapping
---

# Watchman failure-path and test audit

## Scope and status

This review traces the current implementation and tests for:

- initial Watchman acquisition;
- established-generation recovery;
- command subscribe responses and unilateral subscription PDUs;
- both Watchman-to-Parcel fallback decisions;
- root-fatal state and its actual lifetime;
- Watcher stream failure versus normal completion;
- inherited Parcel acquisition and callback behavior;
- the tests that do, do not, or incorrectly claim to pin those paths.

The review intentionally ignores compatibility preservation. The software is
early alpha, so deterministic semantics and a small carryable policy boundary
matter more than retaining accidental behavior.

Two kinds of material are kept separate:

1. **Verified findings** describe what the current code and focused probes do.
2. **Proposed policy** is this reviewer's candidate for making those outcomes
   explicit. It is not an accepted design. In particular,
   [`vision0.gpt56s.md`](/.design/watchman/vision0.gpt56s.md) advances a strong
   strict-selection hypothesis under which configured Watchman never falls
   back to Parcel. The vision itself is provisional, and other reviews may
   recommend that stricter policy.

## Executive result

The reconnect-response loss identified by
[`topic-query0.glm53.md`](/.design/watchman/topic-query0.glm53.md) is real, but
the problem and required repair are broader than that document says:

- every call to `establish`, including first acquisition, discards response
  `clock`, `is_fresh_instance`, `root`, and `files`;
- the subscription stores the requested `since` clock instead of the response
  clock;
- an initial response can contain changes from the `clock`-to-`subscribe`
  window;
- directly publishing those initial rows inside `establish` loses them at the
  generic Watcher boundary because no PubSub subscriber is attached yet;
- reconnect responses occur after attachment and can use the normal live
  delivery path.

The fallback analysis in
[`fallbacks0.glm53.md`](/.design/watchman/fallbacks0.glm53.md) correctly finds
the pre-ack/post-ack cliff and terminal per-interest Parcel entries. Several
details need correction: root-fatal state is retained-lease scoped rather than
intrinsically process scoped, concurrent nonfatal acquisitions do not all
share one failure, Parcel acquisition failure ends streams silently without
triggering owner recovery, and Parcel does emit directory-create events.

The larger architectural problem is that failure disposition is inferred in
four different places from operation-stage strings and timing. The current
tests cover successful sharing, cursor request reuse, reconnect coordination,
cancellation, and live PDU mapping. They do not pin fallback, response batches,
response clocks, root-versus-subscription terminal failures, fatal-state
release, or inactive Parcel stream semantics.

## Current path trace

| Path | Implementation | Current result | Existing test coverage |
| --- | --- | --- | --- |
| Watchman backend construction | [`Watcher.layer`](/packages/core/src/filesystem/watcher.ts#L97-L115) -> [`watchman/backend.make`](/packages/core/src/filesystem/watcher/watchman/backend.ts#L7-L15) | A typed transport-load failure selects the inherited native adapter process-wide | None |
| File interest while Watchman is configured | [`backend.ts:17-18`](/packages/core/src/filesystem/watcher/watchman/backend.ts#L17-L18) | Goes directly to the inherited Node file adapter; Watchman is never attempted | Node file behavior is covered, but not this selection branch |
| First directory interest on a new root | [`Registry.subscribe`](/packages/core/src/filesystem/watcher/watchman/root.ts#L84-L90) -> `current` -> `create` -> `establish` | One root creation attempt and one subscription establishment; any typed escaping failure reaches per-interest Parcel fallback | Root failure metrics only; actual fallback untested |
| New directory interest on an active root | `current` returns `state.active`; `establish` issues `clock` and `subscribe` | It skips client construction, capability, and route resolution | Success is incidentally covered by nested-interest sharing |
| New interest while the root is recovering | [`current()`](/packages/core/src/filesystem/watcher/watchman/root.ts#L178-L195) awaits `state.recovering` | It inherits the existing root's unbounded recovery before its own establishment | Not directly covered |
| Successful subscribe command response | [`SubscribeResponse`](/packages/core/src/filesystem/watcher/watchman/schema.ts#L23-L26), [`establish()`](/packages/core/src/filesystem/watcher/watchman/root.ts#L218-L269) | Unknown fields are stripped; no rows publish; request clock is retained | Fake responses contain only `{subscribe}` and hide the gap |
| Socket `error` or `end` after acknowledgement | [`close()`](/packages/core/src/filesystem/watcher/watchman/root.ts#L116-L134) -> [`loop` closed branch](/packages/core/src/filesystem/watcher/watchman/root.ts#L359-L371) -> `reconnect` | The root is recreated with capped jittered backoff and the subscription requests its retained cursor | Covered by `resumes each subscription...` and `runs one reconnect attempt sequence...` |
| Canceled PDU | [`loop` canceled branch](/packages/core/src/filesystem/watcher/watchman/root.ts#L375-L385) | Publishes one conservative target update, detaches, and re-establishes that subscription | Covered by `recovers a canceled subscription without disturbing its sibling` |
| Normal unilateral PDU | [`loop`](/packages/core/src/filesystem/watcher/watchman/root.ts#L387-L396) -> [`publishFiles`](/packages/core/src/filesystem/watcher/watchman/root.ts#L466-L492) | Stores PDU clock and maps create/update/delete after ignore filtering | Covered by Watchman metrics test and canceled-sibling test |
| Fresh unilateral PDU | [`root.ts:389-392`](/packages/core/src/filesystem/watcher/watchman/root.ts#L389-L392) | Stores clock and emits one conservative target update; file rows are not individually published | Covered only inside canceled recovery test |
| Invalid PDU or nonrecoverable post-ack error | [`subscribe` loop fiber](/packages/core/src/filesystem/watcher/watchman/root.ts#L399-L435) | Calls `input.fail`; Watcher subscriber streams fail; no Parcel fallback | Generic Native failure is tested, but not a Watchman failure or sibling scope |
| Fatal root creation/recovery | `current` or `recoverRoot` sets `state.fatal` for `decode`/`route` | Current root leases fail immediately; established subscriptions eventually call `input.fail` | One initial fatal metric assertion; no recovery or lease-lifetime test |
| Successful Parcel fallback acquisition | [`backend.ts:23-31`](/packages/core/src/filesystem/watcher/watchman/backend.ts#L23-L31) | Exact physical interest remains on Parcel until release; no promotion exists | None |
| Parcel callback error after acquisition | [`subscribeDirectory` callback](/packages/core/src/filesystem/watcher.ts#L297-L300) -> `input.fail` | Watcher stream fails, allowing error-driven owner recovery | Generic fake-Native failure only |
| Parcel unsupported, rejected, or timed out | [`subscribeDirectory`](/packages/core/src/filesystem/watcher.ts#L283-L320) returns `undefined`; [`Watcher.layer`](/packages/core/src/filesystem/watcher.ts#L149-L153) shuts down the PubSub | Stream ends successfully, readiness is not acknowledged, and no immediate owner recovery is triggered | None |
| Explicit unsubscribe | `item.stop` wins `loop.wait`; client-side map entry is removed and daemon unsubscribe is best effort | Normal termination with no resurrection during outage | Covered by `does not resurrect a subscription removed during an outage` |

## Verified findings

### V1. Subscribe responses are discarded on every establishment

The daemon's initial subscribe response is not merely an acknowledgement. The
current watchwoman command constructs:

```text
{ version, subscribe, clock, is_fresh_instance, root, files }
```

See
[`commands/subscribe.rs:71-87`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands/subscribe.rs#L71-L87).
The query executes for every subscribe command, so this response is the carrier
for:

- changes between an initial `clock` command and first subscribe;
- the disconnect gap on socket recovery;
- changes since the last cursor after canceled-subscription re-establishment;
- changes between a replacement clock and subscribe after route incompatibility;
- any explicit fresh-clock retry.

The client schema keeps only `version`, `warning`, and `subscribe` at
[`schema.ts:23-26`](/packages/core/src/filesystem/watcher/watchman/schema.ts#L23-L26).
Effect Schema strips the remaining fields. A direct decode probe with all six
daemon fields produced only `{ subscribe: "s" }`.

`establish` then wraps the response with the request clock:

```ts
Effect.map((response) => ({ response, clock }))
```

and assigns `item.clock = result.clock` at
[`root.ts:235-258`](/packages/core/src/filesystem/watcher/watchman/root.ts#L235-L258).
Even after response rows are decoded, retaining the request clock would replay
already delivered rows on another reconnect and leave telemetry reporting a
cursor behind the acknowledged batch.

This is already encoded as an incorrect expectation. Test
`"counts reconnects, generations, and resubscribes after a socket restart"`
expects `channel.subs[0].clock` to remain `c:2` after resubscribe at
[`watchman-metrics.test.ts:136-164`](/packages/core/test/filesystem/watchman-metrics.test.ts#L136-L164).
The fixture never supplies a response clock, so the test pins the request clock
rather than daemon acknowledgement.

The claim in `topic-query0` that the fresh-subscribe response is empty is also
incorrect. It is usually empty, but changes can occur after `clock` and before
the query snapshot. Dropping it creates an initial acquisition window as well
as a reconnect gap.

### V2. Publishing response rows in `establish` is not enough before ack

The proposed response repair in `topic-query0` sends response files directly
through `publishFiles` from `establish`. That works during an established
reconnect because the Watcher stream is already attached. It does not work on
first acquisition through the real adapter stack.

The generic watcher performs these operations in order:

1. Create an unbounded PubSub.
2. Call `native.subscribe`, giving `publish` as `PubSub.publishUnsafe`.
3. Wait for native acquisition to return a `Subscription`.
4. Return the physical entry from the watcher `RcMap`.
5. Only then construct `Stream.fromPubSub` for the logical subscriber.

See
[`watcher.ts:124-160`](/packages/core/src/filesystem/watcher.ts#L124-L160) and
[`watcher.ts:179-187`](/packages/core/src/filesystem/watcher.ts#L179-L187).
Effect PubSub is not replay storage. A scripted Native that published one event
synchronously before returning its subscription produced no stream head after
attachment.

`WatchInterests` partly masks this for current production directory owners.
Its placement metadata supplies a `ready` callback that enqueues one target
update after acquisition at
[`interests.ts:31-57`](/packages/core/src/filesystem/watcher/interests.ts#L31-L57).
That dirty signal closes initial scan-to-subscribe races for refresh-on-signal
owners. It does not make the generic Watcher deliver exact pre-ack rows, and it
cannot substitute for exact descendant paths where consumers filter by path.
The exact-path caveat is detailed in
[`vision0.gpt56s.md` lines 150-181](/.design/watchman/vision0.gpt56s.md).

A complete correction must therefore choose and test one initial-delivery
contract:

- buffer exact rows until the logical stream is attached; or
- explicitly collapse initial acquisition to coarse invalidation and update all
  exact-path consumers to understand that invalidation.

Silently publishing into an unattached hub is not a valid third option.

### V3. Failure disposition is distributed rather than centralized

| Decision site | Current rule |
| --- | --- |
| [`backend.ts:23-31`](/packages/core/src/filesystem/watcher/watchman/backend.ts#L23-L31) | Any typed error escaping an unacknowledged directory interest becomes Parcel |
| [`current()`](/packages/core/src/filesystem/watcher/watchman/root.ts#L178-L195) | A root-creation error whose stage is `decode` or `route` sets sticky `state.fatal` |
| [`establish()`](/packages/core/src/filesystem/watcher/watchman/root.ts#L236-L249) | Any error from a compatible subscribe on an open generation is treated as cursor rejection: take a fresh clock, publish a target update, retry once |
| [`recoverRoot()`](/packages/core/src/filesystem/watcher/watchman/root.ts#L299-L317) | Retry every creation failure except `decode` and `route` |
| [`recoverable()` and `reconnect()`](/packages/core/src/filesystem/watcher/watchman/root.ts#L290-L351) | Retry a different stage-based set after per-subscription establishment failure |
| [`loop()`](/packages/core/src/filesystem/watcher/watchman/root.ts#L359-L397) | A PDU decode failure is subscription-local and ends that stream |

These rules cannot be reconstructed from `WatchmanError.stage` alone. `stage`
mixes operation name and intended scope:

- invalid capability or watch response decoding is root-fatal;
- invalid subscribe-response decoding enters the generic cursor-retry branch;
- invalid unilateral PDU decoding is subscription-local;
- every completed raw `watch` callback error becomes stage `route` and is
  root-fatal, whether it is a stable policy rejection or an ambiguous command
  error;
- a route-local invariant thrown by `subscription()` occurs outside `create`
  and therefore does not set root fatal state despite using the same stage.

The broad route behavior is not just theoretical. Test
`"counts acquisition failures and fatal channels"` scripts
`callback(new Error("daemon refused"))` for `watch` and expects `fatal: true` at
[`watchman-metrics.test.ts:167-186`](/packages/core/test/filesystem/watchman-metrics.test.ts#L167-L186).
It pins ordinary callback failure as poison, not only malformed protocol data.

The compatible-subscribe catch is similarly too broad for deterministic
semantics. A command error, a malformed response, and a true cursor rejection
all trigger the same fresh-clock behavior. No test proves that the error was a
cursor failure. An arbitrary subscribe error should not advance or discard the
old cursor unless it carries an explicit typed reason.

`Effect.catch` is also not a full-Cause catch. The fallback boundaries catch
typed errors, not defects or interruption. The document phrase "any error" is
therefore broader than runtime behavior. In particular, the local backend
dynamic import uses `Effect.promise`; a rejected promise is a defect, although
the transport import inside `loadFactory` is correctly wrapped by
`Effect.tryPromise`.

### V4. The acknowledgement cliff also affects new interests on healthy roots

The initial subscription path at
[`root.ts:399-436`](/packages/core/src/filesystem/watcher/watchman/root.ts#L399-L436)
does not apply `recoverable` around `current().flatMap(establish)`. Therefore a
new interest with no `previous` establishment falls to Parcel if its queued or
submitted command observes a generation closure, even when established
siblings on the same root enter unbounded recovery.

This produces three populations after one generation closes:

- previously acknowledged interests reconnect on Watchman;
- an unacknowledged interest whose command was collateral damage falls to
  Parcel;
- another interest arriving after `state.recovering` is installed waits for
  the shared recovery and may establish on Watchman.

Timing, rather than failure scope or configured backend, decides the adapter.
No existing test places a new interest into an established root's failing
generation and observes whether fallback was invoked.

The `GenerationClosed.submitted` field does not currently resolve this. Policy
does not inspect it, and an admitted-command timeout probe surfaced
`GenerationClosed(false)` because the outer `closed(false)` race completed
after `close()` signaled the generation. It should not become a policy input
without a focused dispatch test and correction.

### V5. Fatal state is retained-root-lease scoped, not process scoped

`state.fatal` has no clearing assignment inside one `makeConnection`, so all
entry points retaining that same connection observe the poison. The connection
itself is not automatically process-lived.

The registry creates roots with:

```ts
RcMap.make({ lookup: (intent) => makeConnection(...) })
```

and supplies no `idleTimeToLive` at
[`root.ts:65-70`](/packages/core/src/filesystem/watcher/watchman/root.ts#L65-L70).
Effect's default is zero. Its `RcMap` removes and closes an entry as soon as its
last reference is released; see the installed implementation at
[`RcMap.ts:736-750`](file:///home/rektide/src/opencode-watchman/node_modules/.bun/effect@4.0.0-rc.112/node_modules/effect/src/RcMap.ts#L736-L750).
A later lookup builds a fresh `makeConnection` with empty state.

The reason poison can appear process-long in practice is scope retention.
`backend.ts` catches the failed Watchman acquisition and starts Parcel inside
the same physical watch scope. If Parcel succeeds, that long-lived fallback
interest retains the root's `RcMap` lease. Other same-root interests see the
same fatal state and immediately fall back. Once every same-root lease closes,
the connection and its fatal state disappear.

Scripted probes confirmed both halves:

- two acquisitions in one retained scope saw one factory call and the same
  fatal failure;
- placing the first failed acquisition in a nested scope, closing that scope,
  and then acquiring again created a second client and succeeded.

The fatal metric has a different lifetime and is currently misleading as a
gauge. [`ChannelMetrics.fatalChange()`](/packages/core/src/filesystem/watcher/watchman/metrics.ts#L198-L200)
sets `fatal = true`; neither `connection()` nor new `makeConnection` activity
clears it. `WatchmanMetrics.channel(intent)` reuses the same metrics object.
The scoped reacquisition probe succeeded behaviorally while the channel still
reported `fatal: true`. Runtime poison is retained-lease scoped; the metric is
registry-lifetime sticky.

Only failures escaping root `create` with stage `decode` or `route` set this
state. Malformed subscribe responses and subscription PDUs do not poison the
root, contrary to any broad reading of "fatal errors poison a root."

### V6. Concurrent initial failures do not all share one result

The fallback document attributes a herd to the `connection` semaphore. That is
only partly correct.

`current()` holds the semaphore while checking state or running one `create`.
It does not install a shared deferred for ordinary initial creation. If the
first factory or capability attempt fails with a nonfatal `connect` error, the
next waiter enters after it, sees no active/fatal/recovering state, and runs its
own `create`.

A scripted concurrent probe made the first factory call throw and the second
return a healthy fake client. The first subscription failed, the second
succeeded, and the factory count was two. The waiters did not receive one
memoized failure.

Herd behavior still exists in narrower forms:

- a root-fatal `decode` or `route` failure is cached, so queued callers all see
  `state.fatal`;
- after root creation succeeds, each interest's `clock` and `subscribe`
  commands serialize on the generation command semaphore; a generation close
  can make several still-unacknowledged establishments escape to Parcel;
- established siblings on that generation recover instead of falling back.

The acquisition-cliff diagnosis remains valid, but the document should not
claim that every `create()` failure is shared by every waiter.

### V7. Initial acquisition is not uniformly five round trips or one shot

Raw client construction is not a daemon round trip. A first interest on a new
root performs four daemon requests:

1. capability check;
2. `watch`;
3. `clock`;
4. `subscribe`.

A later interest on an active root performs only `clock` and `subscribe`. A
compatible re-establishment with a retained cursor performs only `subscribe`.
A new interest arriving while `state.recovering` is set waits for the root's
shared unbounded recovery, so its overall acquisition is not single-shot even
though its final `establish` remains one-shot.

There are two runtime fallback decisions for directory watches:

- whole-backend substitution in `Watcher.layer`;
- per-interest substitution in `watchman/backend.ts`.

There are three literal calls/routes to the inherited adapter when the explicit
file branch at `backend.ts:18` is counted. Files are a deliberate Node policy,
not a failed Watchman directory acquisition, so "two fallback sites" is useful
only with that qualifier.

### V8. Parcel inability is silent EOF, not failure

The inherited directory adapter converts unsupported native bindings,
subscription rejection, interruption, and acquisition timeout into
`undefined` at
[`watcher.ts:283-320`](/packages/core/src/filesystem/watcher.ts#L283-L320).
The watcher entry then shuts down its PubSub and marks itself inactive at
[`watcher.ts:149-153`](/packages/core/src/filesystem/watcher.ts#L149-L153).
`Stream.fromPubSub` completes successfully.

This differs materially from callback failure. `WatchInterests` runs each
physical stream with `tapError` at
[`interests.ts:49-57`](/packages/core/src/filesystem/watcher/interests.ts#L49-L57).
An error is placed into the owner change queue; normal completion is not. The
Config and Skill observer loops recursively reload and re-subscribe after an
error, but inactive Parcel EOF gives them no immediate trigger. `FiberMap`
removes the completed entry, so a later unrelated `ensure` can retry, but there
is no watcher-driven recovery.

For per-interest Watchman fallback followed by real Parcel acquisition failure,
the logs are normally at least:

- `watchman acquisition failed; using parcel watcher`;
- either `watcher backend not supported` or `failed to subscribe`.

The fallback document's "one log line" statement is therefore not generally
correct for this path.

### V9. Parcel and the local mapper both emit directory creates

`topic-query0` says the Parcel fallback does not emit directory creates. The
claim is false.

Parcel's Watchman mapper evaluates `isNew && exists` before checking directory
mode and emits `create` at
[`WatchmanBackend.cc:116-144`](file:///home/rektide/archive/parcel-bundler/watcher/src/watchman/WatchmanBackend.cc#L116-L144).
Parcel's platform watcher test corpus also explicitly asserts directory-create
events. The local mapper has the same order:

```ts
file.new && file.exists
  ? "create"
  : file.exists && file.type !== "d"
```

at [`root.ts:480-487`](/packages/core/src/filesystem/watcher/watchman/root.ts#L480-L487).
It publishes newly created directories and directory deletions while dropping
updates to already-existing directories.

Setting `always_include_directories: false` may reduce full-tree response size,
but it also removes empty-directory creates and deletes entirely. Child rows do
not cover an empty directory, and tombstone pruning weakens the claim that child
deletions always compensate. This optimization is independent of response
correctness and should not be bundled without a source-domain test. The same
correction applies to the provisional recommendation in `vision0`.

## Coverage audit

| Existing test | What it actually pins | Important missing assertion |
| --- | --- | --- |
| `shares one route and raw client across nested project interests` | One client and one `watch` command for nested interests | Complete response shape, response rows, response clock |
| `does not let a pending route block another root intent` | Cross-root isolation under a real-time route timeout | Same-root disposition, fatal state, fallback |
| `a submitted timeout closes only its root generation` | Different root remains usable after first root timeout | Same-root retry versus poison; originator versus collateral caller |
| `resumes each subscription from its cursor after a socket restart` | Second subscribe request contains the last PDU cursor | Second response rows and returned clock; third resume cursor |
| `does not resurrect a subscription removed during an outage` | Stop wins over pending recovery | Initial-acquisition unsubscribe |
| `runs one reconnect attempt sequence for all subscriptions on a root` | Established siblings share `recoverRoot` | Unacknowledged interest joining or losing that recovery |
| `holds command admission after the submitted caller is interrupted` | Caller interruption does not release protocol admission early | Generation close and the accuracy of `GenerationClosed.submitted` |
| `recovers a canceled subscription without disturbing its sibling` | Conservative canceled update, fresh PDU update, sibling live PDU | Resubscribe response batch and clock; terminal error scope |
| `records commands, pdus, and filtered updates per channel` | Live PDU file mapping, ignores, and metrics | Subscribe-response accounting and pre-ack delivery |
| `counts reconnects, generations, and resubscribes after a socket restart` | Recovery counters | Currently encodes stale request clock `c:2` |
| `counts acquisition failures and fatal channels` | A `watch` callback error marks fatal | Fatal sharing, release, reacquisition, and metric reset |
| `receives project-relative updates from the daemon` | One opt-in live post-ack update | Daemon restart, subscribe response, clock advance, deletion gap |
| `fails every subscriber to one physical interest` | Generic callback failure reaches shared Watcher consumers | Watchman root/subscription failure and no post-ack Parcel fallback |
| `propagates a physical failure and allows owner recovery` | Error termination lets `WatchInterests.ensure` redemand | Normal inactive EOF, no readiness, and automatic owner response |

There is no test of [`watchman/backend.ts`](/packages/core/src/filesystem/watcher/watchman/backend.ts)
itself. Consequently the actual fallback call, `metrics.fallback()`, file
bypass, fallback retention, and "never fallback after acknowledgement" claim
are inferred from code rather than exercised at the adapter interface.

Both fake-daemon `standard()` helpers return only `{ subscribe: name }` at
[`watchman-root.test.ts:45-49`](/packages/core/test/filesystem/watchman-root.test.ts#L45-L49)
and
[`watchman-metrics.test.ts:44-48`](/packages/core/test/filesystem/watchman-metrics.test.ts#L44-L48).
Requiring a complete subscribe response in the schema would force every test to
confront clock and batch semantics instead of silently modeling an
acknowledgement-only protocol.

## Policy-independent requirements

The strict-selection vision and this reviewer's phase-aware fallback candidate
still share these requirements:

1. One root supervisor should own acquisition and recovery; timing around the
   first acknowledgement should not select among several unrelated code paths.
2. Failure types must state their scope and disposition. Operation labels such
   as `route` and `subscribe` are not policy classes.
3. Subscribe responses and unilateral PDUs must share one decoded change-batch
   schema and delivery function.
4. The acknowledged batch clock, not its request cursor, becomes the next
   resume cursor.
5. Exact pre-ack rows must be buffered until delivery or replaced by an
   explicitly redesigned coarse-invalidation contract.
6. An inactive native acquisition must have an explicit result. Silent normal
   EOF must not masquerade as a healthy, completed watch.
7. Root-fatal behavior and the `fatal` metric must have the same documented
   lifetime.
8. Directory-row suppression must remain separate from response correctness.

## Proposed policy

This section is a **proposal, not a verified finding or accepted direction**.
It records the smallest phase-and-scope policy that would make the current
fallback design deterministic without building Parcel-to-Watchman promotion.
It deliberately differs from the strict no-fallback hypothesis in
[`vision0.gpt56s.md`](/.design/watchman/vision0.gpt56s.md).

### Candidate A: explicit phase-and-scope fallback

| Lifecycle and failure scope | Proposed action |
| --- | --- |
| Root has never acknowledged; expected generation/unavailability failure | Attempt Parcel once for that physical interest |
| Root has acknowledged; generation loss or admitted-command timeout | Recover the root and retry every registered established or pending interest; never Parcel |
| Root-semantic or root-schema failure before acknowledgement | Mark that retained root connection terminal and attempt Parcel for the interest |
| Root-semantic or root-schema failure after acknowledgement | Fail all streams on that root visibly; close the terminal root; never Parcel |
| Subscription-semantic or subscription-schema failure before acknowledgement | Attempt Parcel for that interest without poisoning siblings |
| Subscription-semantic or subscription-schema failure after acknowledgement | Fail only that interest visibly; keep same-root siblings live |
| Explicit canceled PDU | Publish one conservative invalidation and re-establish from the last completed batch clock |
| Parcel unsupported, rejected, or timed out | Fail the stream visibly rather than complete normally |
| Explicit unsubscribe | Complete normally and remove registration immediately |

This candidate retains the accepted design's one pre-ack Parcel attempt, but
centralizes it. A healthy or recovering acknowledged root becomes authoritative
for new interests as well as existing ones, eliminating the collateral
new-interest cliff. A Parcel fallback remains terminal only for the lifetime of
its exact physical interest; there is no live promotion.

### Candidate B: strict configured backend

The vision's stronger candidate changes the first, third, and fifth rows:

- configured Watchman never invokes Parcel for a directory;
- retryable first acquisition remains pending under the root supervisor;
- terminal protocol or semantic failure becomes visible rather than changing
  adapters.

All other scope, response, clock, pre-ack delivery, stream-end, and test
requirements remain. The strict policy removes mixed-backend state and timing
as a backend selector, but its startup versus asynchronous-availability
contract still needs a decision. This review does not choose between Candidate
A and Candidate B.

### Shared change-batch policy

Regardless of fallback choice, one `applyBatch`-equivalent operation should own
these semantics:

| Batch | Deterministic action |
| --- | --- |
| Normal response or PDU | Publish exact create/update/delete rows after local ignore filtering and retain `batch.clock` |
| Fresh response or PDU | Apply the chosen fresh-instance invalidation contract once and retain `batch.clock`; do not both burst and silently drop rows by accident |
| Initial pre-ack response | Buffer exact rows until the Watcher stream can observe them under the current exact-path contract |
| Reconnect response | Publish exact rows through the attached stream, even when a separate conservative reconnect invalidation is also retained |
| Empty reconnect response | Still record the response clock; whether reconnect emits a conservative update is an explicit policy row |
| Canceled PDU | Do not advance from a cancellation-only clock that carries no file delta; resume from the last completed batch clock |

An arbitrary subscribe command or decode error must not enter a cursor-reset
branch. Cursor reset requires an explicit typed result. If the selected daemon
never rejects cursors, that branch can be deleted rather than guessed from an
unrelated error.

## Minimal deterministic test matrix

The smallest coherent matrix is four parameterized behavior groups plus two
focused lifecycle tests. It should use scripted callbacks and `Deferred`
barriers, not `Effect.sleep` or randomized backoff.

### M1. Batch carrier matrix

Add `"applies subscribe responses and PDUs through one batch policy"` in
[`watchman-root.test.ts`](/packages/core/test/filesystem/watchman-root.test.ts).

| Carrier | Fresh | Input | Expected |
| --- | --- | --- | --- |
| Subscribe response | false | create, modify, delete; response clock `c:3` | Three exact updates; next resume uses `c:3` |
| Unilateral PDU | false | Same rows and clock | Same updates and cursor result |
| Subscribe response | true | Nonempty full-state rows | Exactly the selected fresh invalidation behavior; cursor `c:3` |
| Unilateral PDU | true | Same shape | Same fresh behavior and cursor |

Extend the existing test
`"resumes each subscription from its cursor after a socket restart"` rather
than adding a separate happy-path reconnect test: make the second subscribe
return the three rows and `c:3`, assert publication, force a third generation,
and assert `since: "c:3"`.

Update `"counts reconnects, generations, and resubscribes after a socket restart"`
to expect the response clock, and add explicit response-batch metrics rather
than counting command responses as unilateral PDUs accidentally.

### M2. Pre-ack delivery matrix

Add `"does not drop updates published during native acquisition"` at the full
[`Watcher.layer`](/packages/core/src/filesystem/watcher.ts) interface.

| Native behavior before returning | Expected current-contract result |
| --- | --- |
| Publishes exact row, then acknowledges | The eventual logical stream receives that exact row |
| Publishes several exact rows, then acknowledges | Every required path is observable in order or under a documented coalescing rule |
| Acknowledges with no rows | `ready` fires once and no synthetic exact path is invented |

A registry-level array assertion is insufficient because it bypasses the
unattached PubSub. If coarse invalidation is selected instead, rename this test
to pin one post-ack coarse dirty signal and add exact-path consumer tests in
Agent, Command, and Plugin Source.

### M3. Failure disposition matrix

Add a backend-level suite, preferably
`test/filesystem/watchman-backend.test.ts`, with an injected
`RawClientFactory` and fallback spy. Name the table
`"chooses fallback, retry, root failure, or subscription failure by lifecycle and scope"`.

| Case | Candidate A expectation | Strict vision expectation |
| --- | --- | --- |
| First root generation unavailable | Parcel called once | Parcel never called; shared root acquisition remains pending or fails visibly per final startup decision |
| Generation closes after one root acknowledgement | Same stream resumes; Parcel never called | Same |
| New unacknowledged interest is collateral to that close | It follows root recovery; Parcel never called | Same |
| Invalid replacement watch response | Same-root streams fail; another root remains live; Parcel never called post-ack | Same |
| Invalid subscribe response after ack | Only that interest fails; same-root sibling remains live | Same |
| Invalid unilateral PDU | Only named interest fails; generation remains usable | Same |

The test must select exactly one expectation for first acquisition once policy
is accepted. It must not preserve both as runtime modes.

### M4. Parcel terminal matrix

Add `"makes inactive native acquisition visible and permits owner redemand"`
across
[`watcher.test.ts`](/packages/core/test/filesystem/watcher.test.ts) and
[`watcher-interests.test.ts`](/packages/core/test/filesystem/watcher-interests.test.ts).

| Native result | Expected |
| --- | --- |
| Active subscription, later callback error | Shared subscriber streams fail and final release runs once |
| `undefined` acquisition | Explicit stream failure, no false readiness |
| First acquisition unavailable, second succeeds | Owner observes failure, calls `ensure`, receives exactly one later ready update |

This turns the current silent EOF into a tested policy rather than relying on
an unrelated future reconciliation.

### M5. Fatal lease lifetime

Add `"scopes fatal root state to retained leases and resets its gauge on reacquire"`
in `watchman-root.test.ts` or the new backend suite:

1. Cause a root-semantic fatal acquisition.
2. Retain the resulting fallback or failed-acquisition scope.
3. Assert a second same-root demand sees the retained terminal state without a
   second factory call.
4. Assert another root still succeeds.
5. Release every same-root lease.
6. Reacquire and assert a fresh client can succeed.
7. Assert the current channel no longer reports `fatal: true` as a live gauge.

If the accepted supervisor deletes sticky fatal state entirely, keep the test
name but change step three to assert a classified retry. The important
requirement is that behavior and gauge lifetime agree.

### M6. Concurrent acquisition correction

Add `"does not memoize a nonfatal initial creation failure"` and
`"shares one retry sequence after an acknowledged generation closes"` using
barriers rather than timing:

- first factory call fails `connect`, second succeeds; assert one failed and one
  successful result under Candidate A, or one shared eventual success under
  the strict supervisor;
- after root acknowledgement, queue several interests, close the generation,
  and assert one replacement sequence with no collateral Parcel calls;
- retain the existing cross-root timeout assertion.

These cases distinguish the verified current semaphore behavior from the
desired centralized supervisor behavior.

## Verification record

No source or test file was edited during this audit. Verification ran from
`packages/core` on 2026-09-01.

```sh
bun typecheck
bun test test/filesystem/watchman-root.test.ts \
  test/filesystem/watchman-metrics.test.ts
bun test test/filesystem/watcher.test.ts \
  test/filesystem/watcher-interests.test.ts
bun test test/filesystem/watcher.test.ts \
  --test-name-pattern 'publishes .hg/branch events'
```

Results:

- Core typecheck passed.
- Watchman root and metrics suites passed 14/14.
- Watcher and interests combined run passed 16 tests and hit the known
  `.hg/branch` five-second timeout once.
- The `.hg/branch` test passed in isolation in 47.59 ms.

Focused in-process probes, executed without creating repository files,
confirmed:

- `SubscribeResponse` strips response files, clock, root, and fresh flag;
- a Native publication before `native.subscribe` returns is absent from the
  later Watcher stream;
- fatal root state is shared inside one retained scope but disappears after
  final lease release;
- the `fatal` metric remains true after successful scoped reacquisition;
- one nonfatal concurrent connect failure does not prevent the next waiter from
  creating a healthy client;
- an admitted timeout can surface as `GenerationClosed(false)`, so the current
  `submitted` flag is not a tested policy discriminator.

## Cross-references

- [`vision0.gpt56s.md`](/.design/watchman/vision0.gpt56s.md) is the provisional
  consolidation vision. Its strict no-fallback selector and phase-independent
  root supervisor are a competing policy direction, while its shared response
  delivery and exact-path caveat reinforce this audit. This review corrects
  the vision's still-provisional directory-row suppression recommendation.
- [`fallbacks0.glm53.md`](/.design/watchman/fallbacks0.glm53.md) provides the
  original static fallback map. This review narrows its process-lifetime fatal
  and concurrent-herd claims, traces silent Parcel EOF into owner recovery, and
  identifies the missing adapter-level tests.
- [`topic-query0.glm53.md`](/.design/watchman/topic-query0.glm53.md) identifies
  the dropped reconnect delta and tombstone edge. This review extends the gap
  to every establishment, adds response-clock and pre-ack PubSub findings, and
  separates directory filtering from the correctness repair.
- [`draft2.gpt56t.md`](/.design/watchman/draft2.gpt56t.md) is the accepted
  architecture whose pre-ack fallback, cursor recovery, and conservative
  invalidation claims the current implementation only partially realizes.
- [`README.md`](/.design/watchman/README.md) records the implemented stack and
  verification history; its `fatal` gauge and post-ack recovery descriptions
  should be revisited after a policy is accepted.
- [`parcel0.glm53.md`](/.design/watchman/parcel0.glm53.md) contains the Parcel
  Watchman implementation comparison and its own mapping evidence for
  directory-create events.
