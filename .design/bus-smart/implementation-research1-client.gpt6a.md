---
type: ImplementationResearch
title: Bus-smart draft1 — lean Client and TUI implementation
description: Concrete controller, retry, experiment, adoption, and projection seams, correcting unsupported convergence and retention claims from the observation review.
resource: /.design/bus-smart/implementation-research1-client.gpt6a.md
tags: [client, tui, events, implementation, adoption, performance]
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
stale_after: 2026-10-05
sources:
  - resource: /.design/bus-smart/draft1.gpt6a.md
    title: Current draft1 proposal
  - resource: /.design/bus-smart/review1-observation.glm53.md
    title: GX observation review — corrected here
  - resource: /.design/bus-smart/review1-contract.glm53.md
    title: GX contract review
  - resource: /.design/bus-smart/research1-client-ownership.gpt6a.md
    title: GX research and Astra client-ownership reconciliation
  - resource: /.design/bus-smart/research1-interest-policy.glm53.md
    title: GX TUI consumer census
---

# Bus-smart draft1 — lean Client and TUI implementation

**Authorship/evidence:** GX gathered the preceding source census and reviews;
GPT-6 Astra continued this same session, rechecked the critical missing seams,
and wrote this synthesis. No production edits, tests, generation, benchmarks,
or live-service operations were performed. Recommendations are implementation
proposals, not verified runtime guarantees. The sibling implementation report
was not read. Existing reports remain unchanged.

## 1. Outcome and corrections

Keep the one-attempt adapter, one controller, and one connection retry owner.
The implementation needs focused extensions, not a new shared connection API:
normalized profile-aware targets; safe negotiation/cleanup; connection-owned
retry suspension; a TUI-owned experiment choice; and an explicit read-adoption
barrier shared by visible and hidden transcript readers.

**Retract observation review F4's “correct completed state always.”** A full
terminal payload cannot repair a snapshot that overwrites it *afterward* when
no later event arrives. Failure events also do not all carry full content.
Draft1's completed-state criterion remains a rollout gate requiring a local
read/reconciliation repair and deterministic tests, not a proven property.

Other corrections to the prior GX reports:

- Retention is **all open-tab roots/families plus three recent non-tab roots
  and the current root**, not current plus three tabs. The implementation
  computes `retained = keep ∪ recentNotKept.slice(0, limit)` and evicts only
  newly excluded IDs/root mappings ([session-retention.ts:14-39](/packages/tui/src/context/session-retention.ts#L14-L39)).
  It is neither a four-transcript limit nor a continuous firewall against
  subsequent foreign `step.started` recreating rows.
- A flush before route **metadata** synchronization is not sufficient. Actual
  visible transcript reads happen independently in
  [rows.ts:89-103](/packages/tui/src/routes/session/rows.ts#L89-L103).
- `session.message.content.updated` has full replacement semantics but is not
  shown by this research to be emitted at every completion. Do not budget or
  prove convergence on that assumption.
- Broad non-streaming observation preserves upstream notification eligibility;
  it does not repair pre-existing notification title/parent-metadata races or
  promise notification replay after disconnect.

## 2. Keep/delete map and concrete file seams

| File/domain | Keep | Small change |
| --- | --- | --- |
| `client/src/shared-events.ts` | Entire upstream implementation, bounded readers, cached connected marker | Composition tests only |
| `client/src/promise/client.ts`, `effect/client.ts`, RPC wrappers | Public shared legacy `subscribe`, spread preserving controlled methods, Effect error/context bridge | No new raw accessor or scoped public default |
| `client/src/solid/controlled-event-feed.ts` | `Generation`, serial drain, desired/held/installed sets, one removal timer | Profile normalization, fenced negotiation, terminal rejection state, target-change equality fast path |
| `client/src/solid/connection.ts` | Sole retry/service/timeout/status owner and batching | Iterator cleanup, narrow retry-policy option, owner restart/resume handle |
| `tui/src/context/client.tsx` | One API and emitter; existing provider position | Experiment selection, TUI interest facade, retry-policy wiring |
| `tui/src/context/event-interest.tsx` | Pure set calculation and single policy owner | Register synchronous policy reader; include the directly requested Session ID |
| `tui/src/component/dialog-experiments.tsx` | Registry/dialog/persistence machinery | One boolean experiment entry; default off |
| `tui/src/routes/session/rows.ts`, `context/session-tabs.tsx` | Visible rows and delayed hidden-tab prefetch | Shared pull-policy → flush → read barrier; stale-work checks |
| `client/src/solid/data.ts` | Metadata/family/attention projection and real transcript edits | Missing-target early return; bounded transcript read-race repair |

Delete no existing sharing, notification, retention, or experiment machinery.
Do not add per-tab fidelity tiers, an interest lease registry, a second retry
loop, or a general snapshot/event replay system.

## 3. Controller internals: normalize once, mutate only on real change

Current [controller:32-145](/packages/client/src/solid/controlled-event-feed.ts#L32-L145)
already has enough control-state structure. Extend `InterestSet` with the
normalized profile (`input.profile ?? "location"`); include it in equality,
serialization, installed diagnostics, and every attempted PUT snapshot. Omit
the profile field when talking to an old Location-only server. Never infer
support from a successful PUT or silently substitute Location for streaming.

Keep `locations` as full workspace-aware refs and `sessions` as exact IDs.
The profile is one scalar, not a grace-held key. Membership removals retain the
existing grace; profile changes take effect as explicit replacements when
supported. The TUI experiment itself switches connection attempts instead of
trying to convert a legacy attachment in place.

Efficiency improvements grounded in
[controller:205-265](/packages/client/src/solid/controlled-event-feed.ts#L205-L265):

1. `setDesired`: normalize, compare with previous **desired**, return on equality
   before rewriting the Solid store, rebuilding the timer, or calculating a
   second transport union. Equivalent order/duplicate inputs are no change.
2. Cache one immutable normalized transport-target object. Rebuild only after
   real desired/grace membership changes; the drain captures that object before
   awaiting PUT. `settle()`/`flush()` compare against it without rebuilding
   Maps/Sets repeatedly. This is one cache, not an index framework.
3. Serialize to arrays only when publishing changed diagnostics or issuing PUT.
   Keep equality order-insensitive; no sorting/stringifying the whole set per
   event. Iterate Maps/Sets directly in comparisons instead of allocating
   `Array.from(...).every(...)` intermediates.
4. Keep one trailing removal timer. No per-key timers, no grace reset on repeated
   identical desired input, no debounce on additions. Bounds are still checked
   by the server; never silently truncate client interest.

Retain `dirty` plus the one `running` promise: updates during PUT are coalesced
and the drain installs the latest target afterward. No revision needs to travel
over the wire. A local target identity/change counter is enough for retry wakes.

## 4. Generation, fallback, flush, and rejection ownership

Use the current generation as the owner of **both** controlled and fallback
attachments. Do not clear `active` on entering fallback as
[L166](/packages/client/src/solid/controlled-event-feed.ts#L166) currently does;
that discards the identity needed to fence later fallback reads and cleanup.
Make transport kind/reason generation-local; diagnostic `mode` is not a lease.

Required small changes:

- Check disposed/pre-aborted state before opening anything; propagate an abort
  already present before listener registration. Fence identity and cancellation
  after **every** awaited first-frame/control/read result, including exceptions.
- Missing capability is a second negotiation outcome, not a PUT error. Close
  the pending controlled HTTP stream **before** opening fallback. A separate
  GET AbortController is justified for this handoff: aborting the whole attempt
  would also kill fallback. Abort GET, then await iterator return; retain the
  parent attempt signal for the shared legacy reader.
- Funnel pre-ready 404 and absent-capability fallback into one branch; record
  distinct reasons. Missing/empty advertised profiles mean streaming unavailable.
  Authentication, malformed ready, and declared PUT errors do not downgrade.
- `finally`: abort first, then close the iterator; only the current generation
  may clear current state. Connection teardown must also retain/return its
  iterator ([connection:81-127](/packages/client/src/solid/connection.ts#L81-L127)).
  Do not claim `return()` interrupts an arbitrary stalled source; abort must
  settle its pending read as part of the adapter contract.

**Error propagation is essential to 400 suspension.** A later PUT is launched
with `void update(...).catch(...)`; it aborts the SSE on failure. The generated
reader can then throw `ClientError("Transport")`, hiding the declared PUT 400
from the connection. Retain that control failure on `Generation` (or preserve
its deliberate abort reason) and rethrow it on reader termination before a
generic EOF/abort error. Parent cancellation wins and must not become a new
user-visible rejection. This is source-level control-flow analysis, not a
tested reproduction.

`flush()` remains **current target installation**, not queue drainage or replay:

- resolve only for the current acknowledged target or intentional legacy mode;
- a new flush after a persistent rejected target must reject immediately, not
  join a waiter Set that can never settle; store one rejected target+error;
- genuine transport uncertainty keeps waiters pending across owner retries;
- target change/new server/explicit retry clears rejection deliberately;
- optionally accept an AbortSignal for adoption callers and remove their waiter
  on cancellation. Disposal rejects remaining waiters and future calls.

This is bounded failure state, not a command cache. Do not retain every rejected
target or settle an old generation's waiters from a stale fallback branch.

## 5. Invalid-target suspension without changing the source shape

Keep `EventStreamAdapter(api, signal): AsyncIterable<OpenCodeEvent>` unchanged.
Use a narrow **connection option**, e.g. `retry(error): "retry" | "pause"`,
defaulting to existing retry behavior. Add an owner method such as
`reconnectEvents()` that interrupts/serializes a live attempt or wakes a paused
one, plus observable `paused()` state. This is not the existing TUI
`client.restart`, which restarts the service and must not be used for toggles.

Responsibilities:

- Controller classifies/preserves the declared rejection and its exact attempted
  target. TUI's callback pauses only an unchanged invalid-interest 400, not
  every 400 or every decoded error. Prefer generated error guards over message
  matching. If the target changed while the rejected PUT was in flight, retry
  the newer target instead of parking indefinitely.
- Connection owns the parked wait, diagnostic paused flag, teardown, backoff,
  and eventual new service resolution. Pause before its current automatic
  reconnect path, otherwise rejection churn still invokes service discovery.
- TUI wakes it on a **meaningful normalized target change**, experiment change,
  an externally known server change, or explicit retry. Wake a paused owner on
  interest change; do not reconnect an otherwise healthy stream for every tab.
- Record a wake counter before invoking policy; consume it when parking so a
  target change between rejection and pause cannot be lost. No autonomous poll.
- New API object identity alone is not a trustworthy server-change signal:
  constructors may wrap the same endpoint repeatedly. There is no existing
  independent server-change watcher in `ManagedService`; while paused, an
  invisible elected-server restart cannot promise automatic recovery. Explicit
  retry re-runs resolution. Document this limit instead of adding a watcher.

Only one optional classifier and one owner restart/wake handle are needed;
do not turn `subscribe` into an object containing lifecycle, interest, status,
and retry callbacks. Test permanent 400 through both initial and later PUTs.

## 6. Experiment/provider ownership and adoption sequencing

`ConfigProvider` already wraps `ClientProvider`
([app.tsx:364-386](/packages/tui/src/app.tsx#L364-L386)); `useConfig()` is
available at connection construction. The config supports boolean experiment
records ([config/index.tsx:229](/packages/tui/src/config/index.tsx#L229)), and
[dialog-experiments.tsx:16-48](/packages/tui/src/component/dialog-experiments.tsx#L16-L48)
already persists toggles. Add one entry, default false. No provider-tree move.

One stable source function in `ClientProvider` selects legacy or controlled
**at attempt start**. A config effect compares the boolean and asks the owner
to restart the event attachment once on change; do not remount DataProvider or
the TUI tree. Keep desired interest while disabled; facade `flush()` resolves
in intentional legacy mode. Devtools distinguishes disabled legacy from
capability fallback and shows paused/rejection state. Notifications stay intact.

**Do not rely on `createEffect` registration order for adoption.** The interest
provider is *inside* tabs, so a tabs effect cannot read an inner context, and
`flush()` today only sees the previous desired set. Small shared seam:

1. Keep the raw controller private to `ClientProvider`; expose its existing TUI
   interest facade plus one policy-reader registration slot (not a registry).
2. `EventInterestProvider` synchronously registers `readDesired()` at init and
   still maintains it reactively. The facade's adoption/flush method pulls that
   reader under `untrack`, calls `setDesired` synchronously, **then** flushes.
   It fails if used before binding rather than pretending an empty policy is
   ready; initial binding occurs before mount effects. Cleanup unbinds by identity.
3. Invoke this barrier before the actual message reads in `rows.ts:94` and
   hidden-tab prefetch `session-tabs.tsx:305-310`, and use the same facade for
   the optimistic prompt gate. Metadata/permission/form HTTP reads can remain
   concurrent; they are not among the five gated types.
4. Recheck route/tab membership and cancellation after awaits; stale reads must
   not close a newly selected tab or perform a now-obsolete adoption. A root's
   family metadata may be fetched first, then re-pulled before transcript reads.

Also seed `follow(id)` with **id and root**, not just root plus currently known
family ([event-interest.tsx:49-55](/packages/tui/src/context/event-interest.tsx#L49-L55)).
This makes the direct route ID invariant independent of family-index readiness.
New children discovered through metadata join reactively; no claim covers their
pre-discovery ephemeral prefix. Hidden families remain followed regardless of
LRU eviction or root idleness. Do not expose private optimistic outbox internals.

## 7. Snapshot/terminal repair: actual proof boundary

Current [message.sync:1549-1568](/packages/client/src/solid/data.ts#L1549-L1568)
replaces the latest page and index. [createSync:143-188](/packages/client/src/solid/data.ts#L143-L188)
serializes invalidated re-reads but **does not stop the old response applying**.
Execution completion refreshes session metadata, not message history
([data.ts:1004-1016](/packages/client/src/solid/data.ts#L1004-L1016)).

Concrete failing order: GET captures a running row → full `text.ended` and
`step.ended` project locally → old GET resolves, replacing it with running/empty
content → no more Session events. Flush-before-GET changes none of this.

Failures are a separate hole. The durable updater
[message-updater.ts:253-266](/packages/core/src/session/message-updater.ts#L253-L266)
and client `step.failed` set finish/error/time without replacing text/reasoning.
A client can therefore retain only the delivered ephemeral suffix, while the
durable row retains no such prefix. Canonical convergence may mean dropping
that non-durable suffix, not recovering it. Tool terminal handling is more
self-contained but still needs its target/state. Compaction failure actually
**replaces** the running row with a failed shape without summary, on both sides
([Core:435-448](/packages/core/src/session/message-updater.ts#L435-L448),
[Client:1082-1104](/packages/client/src/solid/data.ts#L1082-L1104)); partial local
summary is discarded in the ordinary path, but a late running snapshot can
resurrect it/running state. The failure is not “all terminal events assign text.”

Smallest repair direction, local to the Client data read boundary:

- Record explicit transcript observation/read state on `message.sync` calls,
  not on metadata or automatically created arrays; clear it on eviction/delete.
  Existing cache keys are insufficient because `session.created` also marks
  message sync complete without an explicit read ([data.ts:605-614](/packages/client/src/solid/data.ts#L605-L614)).
- For a pending transcript request, retain an identity token and a local durable
  mutation version/dirty flag. Observed transcript-changing durable events,
  disconnect, eviction, and deletion invalidate that token. Before reconcile,
  discard a stale result and coalesce one serial replacement read. Do not issue
  a new queued request per event, and do not restart reads on every text delta.
- Reconcile explicitly observed/materialized transcripts after failed Step or
  execution interruption/completion as needed, even when no request was pending;
  this is the read-after-terminal repair for incomplete parts. Coalesce adjacent
  terminal triggers; keep metadata/badge handling separate. On adoption after
  an interest gap, force an authoritative read rather than trust `sync.complete`.
- Guard deletion/eviction against late response resurrection. Preserve existing
  optimistic outbox/admitted rows and pagination semantics; first-page repair
  must not casually discard already loaded older history.

This local token is **not a server watermark** and proves no exact live merge.
It can target eventual canonical state after observed durable activity settles
and a fresh authoritative read succeeds. It does not prove equality during
ongoing mutation, across missed terminal events without reconnect hydration,
or for every unobserved foreign cache. If the stronger wording is retained,
tests must first establish the needed read-model/adoption semantics. Do not
promote the profile while treating this outline as completed verification.

## 8. Projection efficiency and decisive implementation tests

Put the missing-target guard at `message.editAssistant`, before
`message.update`: look up `messageIndex.get(id)?.get(messageID)`, read that row,
and return unless it is an assistant. Do not call allocating `index(id)` on a
miss. Leave insertions and actual edits unchanged; text/reasoning/tool helpers
inherit the guard. Compaction uses another path and needs its own measurement.
No `store.session.info` interest gate. Foreign targets created by `step.started`
still update: this optimization only saves absent-target work.

Implement in logical explicit-path commits with these focused tests:

1. **Controller/real wrapper:** profile equality/defaults, same-set no PUT/store
   churn, rapid add/remove/re-add grace, cached target consistency, capability
   fallback closing pending GET first, pre-abort, stale 404, EOF, and shared
   reader isolation. Zero hidden legacy GET while controlled succeeds.
2. **Retry owner:** initial and midstream PUT 400 pause with no repeat GET/PUT or
   resolver calls; new target during failing PUT wakes without race; unchanged
   normalized input stays paused; PUT 404/Transport retry; disposal interrupts
   pause; explicit retry re-resolves. Preserve actual decoded rejection identity.
3. **TUI fixture:** experiment default off and one controlled/legacy attachment
   after toggle; no remount; persisted foreign tabs, hidden children, mid-part
   navigation, route-before-tab-storage resolution, direct child ID before
   family registration, and cancelled adoption. Assert PUT install precedes
   *both* visible and hidden message GETs, not just metadata GET.
4. **Data deterministic deferred reads:** terminal-before-snapshot-response with
   no later event; response-before-terminal; failed text/reasoning without ended;
   compaction failure; eviction/delete/reconnect during fetch; overlapping reads,
   optimistic admission, and loaded pagination. Compare to the real durable
   projector where practical. Count replacement reads to catch accidental storms.
5. **Performance characterization:** absent-target guard versus existing-row
   foreign streams separately; five-type versus residual events/bytes; HTTP
   metadata and repair reads; physical GETs versus logical retries. Many open
   tab families must remain a valid high-interest case, not an assumed LRU cap.

Run package-local Client/TUI tests and `bun typecheck` during implementation;
Client connection browser-conditioned tests must actually execute. Regenerate
Client after Protocol changes. None were run for this report. Remaining blockers
are demonstrated convergence/failure fixtures and measured CPU, not a missing
transport platform.

## Cross-references

- [Current draft1](/.design/bus-smart/draft1.gpt6a.md): retained design; this report
  supplies concrete implementation seams for §5–6 and keeps §8's rollout gates.
- [Client ownership](/.design/bus-smart/research1-client-ownership.gpt6a.md): source
  authority for shared attachments, generated errors, and composed test gaps.
- [Observation review](/.design/bus-smart/review1-observation.glm53.md): F3/F4
  and retention claims are explicitly corrected here, not silently overwritten.
- [Contract review](/.design/bus-smart/review1-contract.glm53.md): negotiation and
  broad residual-cost cautions remain; acceptance must distinguish publication
  after replacement from queued old-interest tails, not use client arrival time
  alone as proof of when the server selected an event.
- [GX interest census](/.design/bus-smart/research1-interest-policy.glm53.md): useful
  consumer inventory, not proof of four-transcript bounds or broad no-op behavior.
