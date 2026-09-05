---
type: Design
title: Bus-smart draft1 — scope streaming, preserve observation
description: Reduce many-client event amplification with Session-scoped streaming on the existing controlled SSE, explicit shared-source ownership, and measured rollout rather than a new proxy or general event platform.
resource: /.design/bus-smart/draft1.gpt6a.md
tags: [events, performance, client, server, session, architecture]
status: draft
generated: { by: "openai/gpt-6-astra#high", at: 2026-09-05 }
stale_after: 2026-10-05
sources:
  - resource: /.design/bus-smart/init1.gpt6a.md
    title: Requested outcome and research brief
  - resource: /.design/bus-smart/research1-client-ownership.gpt6a.md
    title: SharedEvents ownership — GX research and Astra reconciliation
  - resource: /.design/bus-smart/research1-move-guarantees.gpt6a.md
    title: Rebased move paths — GX research and Astra reconciliation
  - resource: /.design/bus-smart/research1-filtering-cost.glm53.md
    title: GX server filtering and cost analysis
  - resource: /.design/bus-smart/research1-interest-policy.glm53.md
    title: GX TUI policy and consumer analysis
  - resource: /.design/bus-smart/draft0.gpt56s.md
    title: Previous directional architecture
---

# Bus-smart draft1 — scope streaming, preserve observation

## 1. Decision and evidence status

**Keep the controlled SSE, but change the first optimization target from
Locations to high-rate Session streaming.** The new TUI profile sends live
text/reasoning/input/compaction fragments and tool progress only for explicitly
followed Sessions. All other public events remain server-wide initially.

This is a deliberate, small fidelity distinction—not a general event-filter
language, a summary projection, or a proxy. It removes repeated foreign
streaming work even when all clients work in the same repository. Retaining
other events avoids making loss of cross-project notifications the price of
trying the optimization.

Keep draft0's one selected FIFO, complete-interest replacement, pending
activation, generation fence, Bus-owned audience, and legacy compatibility.
Keep upstream SharedEvents and the current shared legacy fallback: neither the
generated SSE iterator nor SharedEvents reconnects internally. Test their
composition instead of replacing a nonexistent competing retry loop.

**This document is a proposed architecture, not an implemented or benchmarked
improvement.** Prior automated results belong to
[verification0](/.design/bus-smart/verification0.gpt56s.md) and
[port0](/.design/bus-smart/port0.glm53h.md). The user has not used either branch
to establish a CPU win. The distribution of their Sessions across Locations
is unknown; same-Location traffic is a required stress case, not an observed
fact about their machine.

### What changes from draft0

| Area | draft1 decision |
| --- | --- |
| Primary reduction | Exact Session selection for five streaming event types, including within one Location |
| Default candidate TUI profile | Broad non-streaming observation; no implicit loss of global attention |
| Existing Location predicate | Retain as a named compatibility profile, not the new optimization's definition |
| Client sharing | Preserve SharedEvents, define logical attachment ownership, add composed tests |
| Projection | First remove demonstrable missing-target store writes; do not equate metadata presence with transcript interest |
| Move patch | Keep `publishAll([moved])`; state current active/deferred semantics and live-only guarantees |
| Server indexing | Hoist keys first; index the high-rate exact-Session path; defer generalized Location indexes |
| Performance proof | Isolated many-process benchmark plus same-/cross-Location correctness cases; no live-TUI-startup dependency for basic evidence |
| Deferred work | General fidelity tiers, attention aggregates, arbitrary type filters, replay, connection-manager unification, proxy |

## 2. Diagnosis: which work should disappear?

The current predicate is global **OR** Location-covered **OR** exact-Session
followed ([server matcher](/packages/server/src/controlled-event-feed.ts#L269-L282)).
Session membership adds recipients; it never restricts the Location arm.
Holding the launch directory therefore admits every co-located Session's
streaming events. Permission/forms are not native Session events, so simply
deleting Location interest is not a safe fix.

SharedEvents solves a different problem: multiple readers of **one constructed
client** share one legacy fetch/parser. Separate TUI processes do not share
that pool. Healthy controlled TUI operation does not open the legacy pool.

For a workload with `S` equally busy Sessions, `C` clients, and `F` followed
Sessions per client, let `D` be each Session's rate of the five gated events
and `B` the aggregate rate of all other public events:

```text
legacy/co-located draft0 deliveries ≈ C × (S × D + B)
session-streaming deliveries        ≈ C × (F × D + B)
```

This is an event-count model, not a CPU or byte prediction. `B` includes full
terminal text/tool results and can be large. With many shared tab families,
`F` approaches `S`, and the saving vanishes correctly. Report that case rather
than hiding it behind a favorable separate-project benchmark.

Filtering before queue admission avoids per-recipient queueing, UTF-8/SSE
delivery, client decoding, emitter fanout, and projection. It does not avoid
model execution, durable storage, Core projection, or all Bus publication work.
For events nobody wants, skipping encoding is an additional server saving.

## 3. Small interface: a negotiated delivery profile

Retain the experimental GET and PUT paths and their generated methods in
[`Protocol/groups/event.ts`](/packages/protocol/src/groups/event.ts). Extend
the complete interest body conceptually as follows (proposed wire vocabulary):

```ts
type EventInterest = {
  locations: readonly Location.Ref[]
  sessions: readonly Session.ID[]
  profile?: "location" | "session-streaming"
}
```

- Omitted `profile` means **`location`**, exactly today's controlled predicate.
  Existing controlled consumers are not silently changed.
- **`session-streaming`** is the new candidate TUI profile. It applies the
  five-event gate below; all other public events are admitted regardless of
  Location. The Location array is retained for compatibility/profile changes,
  but is not a streaming wildcard in this profile.
- Both profiles still reject internal events before capacity/encoding. Public
  RPC/custom events keep their existing manifest status; unknown public types
  are not silently classified as streaming.
- This is performance selection, never authorization.

Add an optional supported-profile list to `event-feed.ready`. Missing list
means only the existing Location contract is known. The new client must not
send a new field to an old server and interpret a 204 as capability evidence:
older decoders may ignore fields they do not understand.

For the candidate TUI mode:

1. Open the controlled GET and inspect ready.
2. If `session-streaming` is advertised, PUT that profile with the current set.
3. If the GET returns pre-ready 404 **or** ready lacks the required profile,
   close the pending controlled attachment and join shared legacy instead.
   Report the distinct reason. Do not activate an unintended Location profile.
4. Authentication, malformed frames, other GET errors, and PUT rejections do
   not trigger capability downgrade.

This adds bounded negotiation, not repeated probing within one attempt. A
later connection-owned attempt probes the newly selected server again. Old
clients may ignore the added ready field and continue with Location behavior.

### Exact streaming classifier

Use an explicit typed allowlist in the Protocol event domain, referencing
canonical Schema event definitions. Do not move runtime registries into
Schema or add Server/Core runtime imports to Client. Keep the classifier
shared if the client projection/diagnostics use the same contract.

| Gated public event | Existing canonical counterpart |
| --- | --- |
| `session.text.delta` | `session.text.ended` carries full text |
| `session.reasoning.delta` | `session.reasoning.ended` carries full text |
| `session.tool.input.delta` | `session.tool.input.ended` carries raw input |
| `session.tool.progress` | Tool success/failure carries terminal state/metadata; intermediate progress is not replayed |
| `session.compaction.delta` | `session.compaction.ended` carries the completed summary; failure does not promise partial-summary recovery |

These are verified ephemeral definitions in
[`session-event.ts`](/packages/schema/src/session-event.ts#L369-L605).
**Do not use `*.delta`, “all ephemeral,” or the entire transcript family as
the classifier.** Start/end, tool-called, retry, execution, inbox, content
replacement, permission, and form events are not gated by this list.

For the new profile, classify before the ordinary global/Location arms:

```text
not public                 → reject
one of five streaming types → admit iff Bus-classified Session ID is followed
any other public event     → admit once
```

Thus a Location match or even a global audience cannot accidentally bypass the
streaming gate. The Bus remains authoritative for Session identity. A schema
test must prove each gated event supplies that identity; malformed internal
inputs must not become global traffic by inference.

## 4. Preserve the useful control-plane architecture

Keep the current server module's `subscribe` and `replaceInterests` operations.
Registration queues ready but admits no domain events. First successful PUT
installs the complete target and queues `server.connected` at the same
serialized activation cut. Later PUTs replace the target without reconnecting
or generating a connection boundary.

There is one writer and one in-flight PUT. Changes coalesce; a quiescent target
needs one PUT, while concurrent changes can require another. Unknown PUT
outcomes abandon the subscription ID and recover on a new generation. Do not
restore revisions, command IDs, applied markers, or a command cache.

Queued events selected under an older target may drain after removal or a
profile change. Removal grace remains bounded overdelivery, not a promise of
instantaneous revocation. `flush()` means target installation was acknowledged;
it is not a queue-drained acknowledgment, historical replay, or snapshot fence.

### Server hot path

First separate safe mechanical work from a general indexing redesign:

1. Compute audience Location keys once per publication. Maintain effective
   derived Location key counts alongside per-Session holds; removing one hold
   must not erase another Session's or requested Location's coverage.
2. Maintain **Session ID → active session-streaming subscribers** under the
   existing admission cut. The five-event path visits only its indexed
   recipients, plus any Location-profile population requiring old matching.
3. Leave non-streaming new-profile delivery and old-profile Location matching
   as ordinary iteration initially. Those recipients often really are all
   clients. Add full Location reverse indexes only if profiling justifies the
   mutation and cleanup bookkeeping.

Do not casually split recipient selection, asynchronous encoding, and queue
admission into separate critical sections: replacement and move ordering would
then need a new reservation protocol. First retain today's encode-before-cut
behavior. If zero-recipient encoding measures materially, permit one synchronous
lazy encode within the existing non-yielding admission section, after recipient
selection and before offers. This explicitly revisits draft0's
“encoding outside the permit” rule; measure PUT latency under large payloads.
No network, database access, or blocking queue offers may occur there.

Any such follow-up preserves current encoding-failure behavior explicitly and
cleans every index on unsubscribe, overflow, and failure. Tests compare the
indexed output with an independent expected routing table, including mixed
profiles and duplicate audience refs. Generalized indexing is not “risk-free.”

Keep the legacy feed separate. Two populated feed services can encode the same
event twice; removing client amplification is higher leverage than unifying
their different activation/failure contracts without measurements.

## 5. Client lifecycle: sharing is not reconnecting

The retained adapter is a **one-attempt logical domain-event attachment**:

```text
Solid connection owner (retry / service selection / timeout / status)
  └─ controlled source (ready / profile / desired set / serial PUT / fence)
       ├─ dedicated controlled GET
       └─ bounded compatibility fallback → public SharedEvents attachment
```

- Generated SSE does one request. SharedEvents ends readers on EOF/error; it
  does not retry. The Solid connection owns retries.
- Fallback owns one reader, not necessarily the physical socket. Abort/return
  detaches that reader; the last reader closes the shared source.
- A late attachment may receive the cached `server.connected`, but no past
  business events. This means attach-and-hydrate, not fresh-socket identity.
- Sharing is per client instance. A future independent raw/RPC reader can open
  a separate legacy firehose alongside controlled mode; test physical GETs,
  not just the controller's received-event counter.
- One controller has one active consumer. It is not a multi-writer interest
  union. Do not wrap repeated calls to its `subscribe` as a sharing strategy.

Retain the wrapper spread preserving generated controlled methods. Prefer
shared fallback over introducing a second raw legacy socket just to make
ownership look symmetric. If a second controlled reader is actually needed,
place one negotiation/controller below one bounded pool, with one interest
owner and a raw fallback inside that pool; do not nest pools. That is a future
integration, not a prerequisite for this TUI's win.

### Concrete lifecycle corrections before rollout

- Fence **every** asynchronous branch, including an obsolete pre-ready 404,
  before changing mode, settling flush waiters, or opening fallback.
- Honor pre-aborted signals; abort must settle pending reads. Close iterators
  on teardown after abort, without assuming `return()` alone unblocks fetch.
- Declared invalid-interest 400 should suspend unchanged-target retries at the
  connection policy level. Resume on target/server change or explicit retry.
  Subscription-not-found can recover on a fresh generation; transport errors
  retain backoff. Never silently downgrade an invalid target.
- Use the generated error path in tests: fetch aborts become
  `ClientError("Transport")`. GX's provisional inevitable abort→flush-rejection
  claim was not supported by the actual implementation.

These address observed code paths and public module contracts, not a speculative
new connection framework. The [client report](/.design/bus-smart/research1-client-ownership.gpt6a.md)
contains the ownership matrix and composed test cases.

## 6. TUI interest, transcript adoption, and notification choice

Retain launch/current/Home Locations and exact IDs for the visible route,
every open tab, and every **known** family member. Keep hidden families even
when the root is idle. Do not couple first-rollout fidelity to the transcript
LRU or introduce per-tab full/summary tiers.

Local creation already waits for `interest.flush()` before first execution.
Retain that ordering. Restored roots are declared before metadata hydration;
known family IDs join as they resolve. The new profile's broad lifecycle
delivery preserves discovery of Sessions created elsewhere.

### Do not claim historical streaming continuity

A newly discovered child may emit fragments before the client knows its ID and
the next PUT applies. A newly opened or re-opened Session can similarly have
an in-progress part whose prefix was intentionally not delivered. Exact
following is a live interest, not family recursion or replay.

Adoption must publish desired Session interest and await installation before
relying on live updates, then use authoritative Session/transcript reads. This
does **not** by itself guarantee recovery of ephemeral prefixes: the current
[`message.sync`](/packages/client/src/solid/data.ts#L1549-L1568) replaces fetched
rows and has no general snapshot/SSE watermark. Do not concatenate an arbitrary
buffered suffix onto a snapshot and assume it is neither missing nor duplicated.

The initial contract is full live fidelity for continuously followed Sessions,
and canonical completed-state convergence for newly followed ones. An already
running newly opened part may show only post-follow live fragments until its
canonical terminal value arrives. Characterize this explicitly in UI tests;
it must not leave an incorrect **completed** transcript. Failure/interruption
paths need their own tests; successful full-value terminal events do not prove
partial failure recovery. If current snapshots plus terminal handling cannot
meet that convergence criterion, block the profile's rollout and repair that
specific read-model/adoption seam rather than invent replay in EventFeed.

### Projection changes: do not trust the cheap-no-op premise

Direct review found that
[`session.step.started`](/packages/client/src/solid/data.ts#L818-L850) appends a
real assistant row, even for an otherwise foreign Session. Later fragments can
therefore do real writes. “Every foreign delta already drops” and “at most four
Sessions ever have transcript state” are not valid invariants.

Start with a small independently testable optimization: `editAssistant` checks
the existing message index/row before entering `produce`; a missing-target
edit must not create an array or index. It preserves present observable edits,
helps legacy mode too, and does not alter the domain emitter.

A stronger transcript-interest guard is a separate measured change. It must
distinguish explicit transcript reads/retention and optimistic local admission
from metadata loaded for discovery or notification titles. Broad
`store.session.info` membership is not enough: current create/rename handling
populates it. Mixed handlers such as execution completion and compaction also
update non-transcript state; guard only their transcript work. Do not suppress
metadata fetches until title, parent/subagent identification, and family
discovery have an independent correct path.

### Notification decision

**Preserve server-wide non-streaming observation in the first candidate profile.**
This retains existing execution, permission/form lifecycle, create/rename
metadata, and dialog move/delete events without a second firehose. It also
avoids reconnect's stale-derived-Location gap for permission/forms in this
profile: they are not Location-filtered here.

The prior branch's unapproved Location-scoped behavior is not a safe-default
precedent merely because it is implemented. The user has not accepted losing
cross-project notifications. Nor does a faithful per-Location predicate follow
from checking a Session's current metadata: routed events can have dual move
audiences and stale/missing metadata.

The retained `location` profile remains available to existing callers, but
narrower attention is not the default recommendation. A future explicit
Location/family attention experiment belongs in the TUI experiments registry.
A server-wide attention aggregate becomes justified only when broad residual
events or metadata fetching measure as a remaining bottleneck. We need neither
an aggregate nor its new schemas to gate five event types now.

## 7. Rebased movement: keep the correction, narrow the promise

The [complete move matrix](/.design/bus-smart/research1-move-guarantees.gpt6a.md)
is the source for these rules:

| Path | Meaning |
| --- | --- |
| Source unavailable, exact directory/workspace still match, coordinator inactive | Immediate idle recovery; selected-instance failure counts, not only deleted directory |
| Healthy source, active owner, ownership starts during probe, or placement changes during probe | Durable control admission and advisory wake; return does not mean placement changed |
| Runner consumes steer/queue | Safe-boundary application; queued controls can also run on Location entry before a carried continuation |
| Restart with pending move | Recovery attempt depends on claims and source-instance acquisition; eventual escape from an unusable source is not guaranteed |

Keep [`publishAll([moved])`](/packages/core/src/session/move.ts#L135-L141).
It protects the immediate no-cancellation path's commit-through-notification
against external caller interruption, like cancellation batches and runner
handoffs. Do not change scheduling or broad recovery policy in this feature.

For a healthy active Location-profile subscription continuously following the
Session, awaited routed observation installs its derived destination hold and
admits the move before protected publication returns. Causally dependent later
publications use that coverage and enter the same selected FIFO. This is
**admission ordering**, not remote receipt, a database/observer transaction,
eventual execution, or crash-safe delivery. Unrelated concurrent destination
events have no new total order.

The new profile preserves move-frame ordering but does not need a derived
Location to admit its non-streaming destination events; exact ID following
covers the five streaming types regardless of placement. Do not allocate
derived holds for it solely by analogy. Switching into Location profile needs
fresh requested Locations; it does not inherit imaginary move history.

For retained Location mode, reconnect destroys derived holds. A Session moved
while disconnected may be followed by ID while destination-only events remain
filtered after activation until hydration updates Locations. Keep this limit
documented and tested; do not imply restoration of authoritative placement.

## 8. Verification and evidence-led delivery

### Logical implementation sequence

Each item is an explicit-path conventional `jj commit`, with its tests. This
is a future implementation sequence; this pass commits documentation only.

1. `test(client): pin composed event attachment lifecycle` — real wrapper,
   controlled adapter and connection loop; marker-only shared fallback, EOF,
   cancellation, overflow, zero hidden legacy GET in controlled operation.
2. `fix(client): fence stale event fallback attempts` — targeted cancellation,
   stale-fallback and invalid-target policy changes, split if independent.
3. `test(server): characterize event fanout workloads` — isolated repeatable
   baseline and event-count oracles; do not require model network calls.
4. `fix(client): avoid missing-target transcript writes` — cheap-no-op guard,
   measured separately from wire filtering; preserve all real edits.
5. `feat(protocol): negotiate session streaming interests` — profile, ready
   capability, canonical five-event classifier, bounds/default tests. Run
   client generation from `packages/client`; never edit generated files.
6. `feat(server): scope streaming admission to followed sessions` — same FIFO,
   activation/replacement semantics, both profiles and real Bus tests.
7. `feat(tui): experiment with session scoped streaming` — profile negotiation,
   adoption/flush coverage, diagnostics, explicit experiment with legacy default
   until correctness and CPU gates pass. Preserve reusable experiment machinery.
8. `refactor(server): index streaming event recipients` — only the identified
   high-rate index and cached-key work, benchmarked against scan semantics.
9. `test(tui): verify filtered feed behavior and performance` — completed-state
   convergence, actual multi-process cost, move integration, supported/older
   servers. Graduate the experiment only after evidence supports it.

Protocol and Server can land adjacently on the branch; do not deploy advertised
capabilities before the server implements their semantics. The current branch's
unconditional Location opt-in must not be mistaken for the intended legacy
default outside this experiment.

### Required correctness matrix

- Five gated types × own/foreign Session × same/different directory/workspace
  × both profiles; no duplicate global/multi-Location delivery.
- All other public types—including RPC—retain new-profile broad delivery;
  internal `session.usage.recorded` remains excluded. Unknown future public
  events pass until deliberately classified.
- Empty interests, pending ready-only subscription, first activation,
  coalesced replacement, grace expiry, profile changes, late PUT and overflow.
- New local prompt, restored tabs, hidden family, newly created child streaming
  before metadata arrives, open-mid-part, close/reopen, compaction failure,
  tool failure, and reconnect during an in-flight snapshot.
- Real Bus + ControlledEventFeed + immediate and runner move application;
  immediately publish destination permission/form and Session suffix without
  a client PUT. Active-deferral tests must reach actual completion, not stop
  at inbox admission. Include existing-directory/unavailable-instance recovery.
- Mixed legacy/controlled/Location-profile readers; one slow shared reader,
  another fast reader; fallback to older upstream and older draft0 servers.

### Performance matrix and acceptance

Use source code directly in package-local test/benchmark fixtures with isolated
state/auth and a private server. Do not mutate/restart the elected live server.
Store exploratory scripts under `.test-agent/bus-smart/bench/` with a README;
promote durable runners into package-owned event test domains.

Compare upstream legacy, current draft0 Location mode, legacy plus missing-target
guard, new profile, and indexed new profile. Begin with a small matrix, then
expand to 1/8/32 Sessions and clients, one/four Locations, one/many followed
families, large terminal payloads, mixed client modes and deliberate slow readers.
Use identical deterministic event IDs/payloads and fixed seeds. Separate:

- in-process admission/encoding microbenchmarks;
- actual HTTP/parser/projection workloads with **separate client processes**;
- optional real TUI before/after confirmation once startup is usable.

Record per-process `process.cpuUsage()` deltas, aggregate CPU, wall time,
event-loop p99, RSS, wire bytes, per-class domain arrivals, HTTP hydration counts,
physical GETs, logical retry attempts, PUTs, and server/client overflow counts.
Warm up, repeat, and report spread plus Bun/revision/config/workload identity.
Do not interpret a logical reconnect count as physical connections or overflow.

**Hard correctness gates:** zero unintended suppression/duplication for
continuously followed Sessions; ordered suffixes during healthy lifetimes;
canonical completed-state convergence on adoption/reconnect; exact expected
profile delivery counts; legacy compatibility. Slow-reader failure is expected
in its deliberate stress case, not a correctness failure of the fast reader.

**Deterministic reduction gate:** in new mode, zero five-type arrivals for
unfollowed Sessions after installation/grace, including same-Location traffic.
For 32 equal-rate Sessions and one followed Session, streaming arrivals should
be exactly 1/32 of broad delivery in the steady interval. This says nothing
about total event/byte/CPU percentage.

**Performance decision gate:** require a repeatable aggregate CPU improvement
and lower foreign streaming event/byte volume on the representative many-client
workload, without a material foreground latency or server CPU regression.
Report absolute deltas and run variation. If the machine's pain is dominated
by non-streaming payloads, broad hydration, or unrelated work, this profile
has not solved it; use the measurements to choose the next seam. Do not report
“90% CPU improvement” by substituting an event-count formula for evidence.

Indexing cannot make a broadcast O(1): delivering to `M` real recipients costs
at least O(M). Test sparse-interest scaling with disjoint follows, not a
same-Location all-match workload that inherently needs all deliveries.

### Commands for implementation follow-up

- `packages/client`: `bun run generate` after public contract changes;
  `bun test test/shared-events.test.ts test/solid-controlled-event-feed.test.ts
  test/promise.test.ts test/effect.test.ts`; `bun typecheck`.
- `packages/server`: `bun test test/event-feed.test.ts
  test/controlled-event-feed.test.ts test/controlled-event-feed-http.test.ts`;
  `bun typecheck`.
- `packages/core`: focused Bus/SessionMove/runner tests; `bun typecheck`.
- `packages/protocol`: `bun test test/event.test.ts`; `bun run generate` and
  `bun run check:generated` for the OpenAPI mirror; `bun typecheck`.
- `packages/tui`: interest/app-lifecycle/tab/notification fixtures and
  `bun typecheck`. Client connection browser-gated tests must actually execute;
  a server-condition run that skips them is not integration verification.

No runtime tests or generation are necessary for this documentation-only pass.

## 9. Design axes and alternatives

| Axis | Chosen | Deferred / rejected, with reason |
| --- | --- | --- |
| Placement of selection | Existing Server feed using authoritative Bus identity | Content-aware proxy duplicates routing/lifetime knowledge and adds a process; offloading CPU is not removing it |
| Reduction unit | Explicit five-type Session streaming gate | Whole transcript/detail tiers need more consumer/hydration proof; Location-only cannot solve co-location |
| Non-streaming scope | Server-wide initially | Location/family narrowing is a product behavior choice; no notification loss assumed |
| Event contract | Existing payloads, one optional profile and ready capability | New summary events/aggregate deferred until residual cost is measured |
| Client retry | Existing connection owner; shared fallback is one logical attachment | Raw fallback only for a demonstrated physical-isolation need; universal shared-interest manager premature |
| TUI policy | All open/visible known families | Visible-only/retention-driven tiers risk hidden-child state and frequent adoption |
| Server indexes | Exact-Session streaming index; cache keys | Full Location reverse indexes only after measurement; complexity is not free |
| Transport lifetime | Volatile selected FIFO | Durable replay/snapshot cursor protocol is a separate architectural undertaking |

The earlier full Location design remains useful for clients intentionally
requesting that observation scope. The new recommendation is not that it was
wasted: its activation, replacement, generation and Bus seams make this
smaller fidelity policy possible without starting over.

## 10. Cross-references and synthesis corrections

- [Client ownership research](/.design/bus-smart/research1-client-ownership.gpt6a.md)
  provides the strongest correction to the initiating concern: no competing
  reconnect loops, and sharing is per instance. Its bounded-sharing alternative
  is retained as future work, not promoted into the first slice.
- [Move guarantees research](/.design/bus-smart/research1-move-guarantees.gpt6a.md)
  separates request admission, protected publication, execution recovery and
  reconnect coverage. Use it over the provisional GX move wording for limits.
- [Filtering-cost research](/.design/bus-smart/research1-filtering-cost.glm53.md)
  identifies the same-Location gap and five-event lever. Its nanosecond/
  microsecond estimates are not adopted, O(N) is linear rather than
  “superlinear,” RPC is public in the current Protocol, and its constant-time
  all-recipient and 90%-CPU acceptance claims are replaced above.
- [TUI interest research](/.design/bus-smart/research1-interest-policy.glm53.md)
  grounds family/notification requirements. Its broader detail taxonomy is not
  a ready-to-ship filter: several handlers have mixed responsibilities and
  durable full-value events matter. Its “Location safe default” is rejected as
  conflating implemented branch behavior with approved user behavior. The
  existing devtools panel already exposes mode/error at
  [`devtools-bar.tsx:303-310`](/packages/tui/src/component/devtools-bar.tsx#L303-L310).
- [Earlier patch-carry review](/.design/bus-smart/review0.gpt56s.md)
  supplies the useful projection/measurement counterargument; the initial
  missing-target edit guard is intentionally narrower than its proposed
  unknown-Session policy.
- [draft0](/.design/bus-smart/draft0.gpt56s.md) remains the detailed baseline for
  unchanged full-replacement and selected-FIFO contracts. This draft supersedes
  its default TUI scope, event-type-filter non-goal, and overly broad movement
  descriptions; it does not revive the older revisioned control protocol.
- [Verification0](/.design/bus-smart/verification0.gpt56s.md) and
  [port0](/.design/bus-smart/port0.glm53h.md) are historical test records, not
  performance evidence or release approval for draft1.
