---
type: ImplementationPlan
title: Bus-smart draft1 implementation — keep the seams, reduce repeated work
description: Source-reviewed implementation choices, bounded state ownership, file-level changes, tests, and commit dependencies for the Session-streaming design.
resource: /.design/bus-smart/implementation1.gpt6a.md
tags: [events, implementation, architecture, client, server, tui, performance]
status: draft
generated: { by: "openai/gpt-6-astra#high", at: 2026-09-05 }
stale_after: 2026-10-05
sources:
  - resource: /.design/bus-smart/draft1.gpt6a.md
    title: Revised architecture and delivery contracts
  - resource: /.design/bus-smart/implementation-research1-server.glm53.md
    title: GX Server/Core/Protocol implementation assessment
  - resource: /.design/bus-smart/implementation-research1-client.gpt6a.md
    title: GX research and Astra Client/TUI implementation assessment
  - resource: /.design/bus-smart/review1-contract.glm53.md
    title: GX contract review
  - resource: /.design/bus-smart/review1-observation.glm53.md
    title: GX observation review, with later corrections
---

# Bus-smart draft1 implementation — keep the seams, reduce repeated work

## 1. Assessment

**The existing implementation is a usable foundation, not something to replace.**
Server admission is concentrated behind two operations; Client already separates
interest orchestration from reconnection; the TUI has one declarative policy.
The rebased move correction remains small and appropriate. There is no reason
to rebuild those pieces as a proxy or a universal event manager.

The highest-leverage implementation change is the five-type recipient rule.
The highest-risk implementation work is on the client: preserving rejection
identity through cancellation, synchronizing product policy with real transcript
reads, and preventing stale snapshots from overwriting terminal state. Passing
module tests separately is not sufficient evidence for those compositions.

This assessment follows two completed research/review waves and a completed
implementation wave, never more than two agents in flight in the latter waves.
GX produced the server assessment; Astra recovered the client assessment after
GX rate limits, crediting the earlier research. The parent checked the current
controller, connection, policy, transcript read and retention code directly.
**No runtime changes, benchmarks, tests, generation or live-service operations
were performed.** Proposed fixes below still require their acceptance tests.

### Implement now versus earn later

| Work | Decision | Why |
| --- | --- | --- |
| Five-type profile + capability negotiation | First functional slice | Directly removes foreign same-Location streaming before queue/parser work |
| Controller profile identity, fencing and cleanup | Required | Existing single active slot and fallbacks must agree about ownership |
| Experiment/default and adoption barrier | Required before user rollout | Current branch enables Location scoping unconditionally; actual message reads need the installed policy |
| Snapshot/terminal repair | Correctness prerequisite for graduation | Concrete stale-response overwrite and partial-failure counterexamples |
| Exact Session recipient index | Separate measured commit after correct scan | Removes visits to unrelated focused clients; keeps matcher tests as oracle |
| Desired/target equality fast path | Small useful controller cleanup | Avoids repeated Maps/Sets/store/timer work on equivalent declarative inputs |
| Missing-assistant fast path | Small standalone optimization | Saves only absent-target edits; does not stop foreign durable-row creation |
| Zero-recipient encode precheck | After index, measured separately | Can remove constant encode cost when the entire client population has no recipient |
| Derived Location key-count cache | Defer | Adds second mutable representation for a compatibility path not used by the focused profile |
| Full Location reverse indexes / cross-feed encode unification | Defer | More invalidation/failure bookkeeping; no measurement yet establishes need |
| Full transcript-residency filtering | Defer, but keep visible in results | Could remove durable-row work; requires a real observation policy, not metadata presence |

## 2. Concrete module and file map

| File/domain | Retain | Change |
| --- | --- | --- |
| [`core/src/bus.ts`](/packages/core/src/bus.ts), [`session/move.ts`](/packages/core/src/session/move.ts) | Routed observation, authoritative Session IDs, existing protected move batch | No new production change for draft1; add composed move tests |
| [`protocol/src/groups/event.ts`](/packages/protocol/src/groups/event.ts) | Endpoints, payload identities, manifest/public guard | Optional requested profile; advertised ready profiles; canonical five-type policy |
| [`server/src/controlled-event-feed.ts`](/packages/server/src/controlled-event-feed.ts) | `make`, `subscribe`, `replaceInterests`, scoped queues and admission semaphore | Profile dispatch, focused Session index, complete cleanup; keep one module |
| [`server/src/handlers/event.ts`](/packages/server/src/handlers/event.ts) | Thin decoding/delegation and bounded HTTP body | Verify new schema/default rejection; no routing policy in handler |
| [`client/src/shared-events.ts`](/packages/client/src/shared-events.ts), Promise/Effect wrappers | Entire upstream sharing behavior, typed error/context bridges | Composition tests; no raw transport accessor or scoped legacy default |
| [`client/src/solid/controlled-event-feed.ts`](/packages/client/src/solid/controlled-event-feed.ts) | One generation, serial PUT drain, grace timer | Normalized profile, cached target, fenced negotiation, typed terminal rejection |
| [`client/src/solid/connection.ts`](/packages/client/src/solid/connection.ts) | One retry/service-resolution/batching owner | Iterator cleanup, event-only restart/wake and optional pause policy |
| [`tui/src/context/client.tsx`](/packages/tui/src/context/client.tsx) | Stable API/emitter/provider position | Experiment-selected source, policy-reader facade, retry wiring |
| [`tui/src/context/event-interest.tsx`](/packages/tui/src/context/event-interest.tsx) | Pure policy selector, declarative updates | Bind one synchronous policy reader; seed direct ID as well as root/family |
| [`tui/src/routes/session/rows.ts`](/packages/tui/src/routes/session/rows.ts), [`context/session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx) | Visible row reduction and hidden-tab prefetch | Run the same interest barrier before actual transcript reads; cancel obsolete work |
| [`client/src/solid/data.ts`](/packages/client/src/solid/data.ts) | Structural/optimistic writes, metadata/family/attention behavior | Narrow no-target edit check; explicit transcript read identity and canonical repair |
| [`tui/src/component/dialog-experiments.tsx`](/packages/tui/src/component/dialog-experiments.tsx) | Permanent experiments framework | One default-off feature entry; never remove the framework |

No new Core service, bus payload fields, Server-to-Client runtime dependency,
or provider-tree rearrangement is needed. Keep tests in their package-owned
event/connection/data/TUI domains, not a root-level generic testing framework.

## 3. Protocol implementation: canonical, but not heavy by accident

Normalize `profile ?? "location"` once at each owning boundary. Use the exact
`"location" | "session-streaming"` strings throughout the wire contract; reject
unknown requested values as 400. Ready's optional `profiles` advertises supported
behavior; absent or empty means no new-profile support. The server emits the
capability only with its implementation, not merely when the schema lands.

Keep one canonical list built from Schema's native Session event definitions.
A private Set plus an exported predicate is sufficient; do not expose a mutable
Set as an extension registry. A compile/test assertion ties its five members
to public ephemeral Session events. New public/RPC types stay broad by default.

Start in the Protocol event domain already used by Server. Do not import the
whole Effect/HttpApi event-group module into the Promise client solely for a
five-string diagnostic lookup. If a second actual runtime caller needs the
classifier, extract one browser-safe domain leaf such as
`packages/protocol/src/event-feed/streaming.ts` and re-export where appropriate.
That leaf references canonical Schema values but not HttpApi or service layers.
Do not create this extra module speculatively or duplicate canonical definitions
inside generated clients.

Use the repository's optional-field schema conventions and regenerate both
Promise and Effect surfaces plus the Protocol OpenAPI mirror. The GX report's
schema snippets are conceptual, not a substitute for current Effect v4 syntax.
Test unknown enum versus unknown excess property independently: capability
negotiation is necessary even if this version's decoder happens to be strict.

## 4. Server implementation: one source of truth, staged indexing

### First implement the correct scan

Add `profile` to the normalized requested interest, **not both** to requested
interest and a separately assignable Subscriber field. The server report suggests
both; that creates unnecessary synchronization state. A subscriber's active bit
and `requested.profile` determine its matching behavior.

Normalize outside admission; commit interest and derived cleanup inside it.
First activation offers connected before marking active/indexing. If that offer
fails, there must be no active membership. Existing active replacements change
no domain framing. Derive/mutate move holds only for Location-profile subscribers;
switching to focused mode discards them. Switching back supplies requested current
Locations, without a new placement lookup promise.

Dispatch named streaming events before the existing global/Location predicate.
The initial implementation may scan active subscribers: focused entries check
exact Session membership; Location entries use today's matcher. Non-streaming
events admit focused entries directly and Location entries by the old matcher.
This commit realizes the wire/client reduction without index maintenance mixed
into the proof of a new predicate.

### Then add the focused index

```text
focusedBySession: Map<SessionID, Set<Subscriber>>
activeLocationCount: number
```

Use the count only if it saves the mixed-profile scan/precheck; avoid additional
overlapping counters otherwise. Between synchronous admission sections:

```text
s in focusedBySession[id]
  iff s is registered and active
      and s.requested.profile == session-streaming
      and id in s.requested.sessions
```

- Pending registration contributes no index membership.
- Replacement compares old and new normalized Session sets; same-profile updates
  can diff membership rather than remove/reinsert everything.
- Profile switch removes old membership and adds new membership atomically.
- `remove` remains the single idempotent cleanup path for unsubscribe/overflow.
  Global encoding failure clears registry, indexes and counts together.
- Delete empty index buckets. Scoped finalizers remain harmless after overflow
  already removed their subscriber.
- Offering to a Set can overflow and remove the current subscriber. Test removal
  of current entries without skipping fast neighbors; do not allocate a full
  snapshot per event merely to avoid thinking about Set iteration.

Focused and Location-profile arms are disjoint, so a universal dedup Set is not
needed for that split. The existing Location matcher already offers once after
testing audience refs. Preserve at-most-once behavior with explicit assertions.

Keep mutable Maps owned inside `make`; do not expose internals solely so tests
can inspect an index. Existing `make(observe, { encode, capacity, createID })`
allows black-box operation sequences and encode/offer outcomes. Use declarative
fixture expectations as the independent oracle. Only add a narrow test inspection
seam if external behavior cannot expose the invariant being tested.

### Encoding optimization: union of recipients, not per-client arithmetic

If `C` clients collectively follow every active Session, **every streaming event
still needs one server encoding**, even if each client receives only its own.
Server no-recipient savings depend on `U`, the union of followed Sessions: under
equal rates and no Location-profile recipients the skip fraction is
`(S - U) / S`, not the per-client `(S - F) / S`. The GX estimate conflated them.
Wire/parsing savings remain real even when `U == S`.

After the index, a no-recipient precheck may return only when:

1. the event is one of the five types;
2. its focused follower bucket is empty; and
3. `activeLocationCount == 0`.

All observations and the return happen in one non-yielding synchronous extent.
This conservative rule never guesses whether existing Location subscribers
match. The skip linearizes at that observation, before any later installation;
non-skipped work still matches under the admission permit. Test a publication
initiated after successful replacement, publication concurrent with activation,
and the counterexample of an empty focused bucket with an active matching
Location subscriber. Do not copy a recipient Set across an await.

Retain encode outside the permit on the ordinary path. In-permit lazy encoding
is an alternative only if it earns measurable savings beyond this precheck;
large payloads would delay every interest update. Neither approach unifies
legacy encoding. Keep the existing error/failure contract visible in tests.

Hoisted Location keys are cheap; derived-key counts are not free. Keep today's
derived map scan initially unless old-profile cost matters. If caching later,
counts or rebuilding the effective union must preserve multiple Sessions holding
one destination. Never equate a single Set.delete with removal of the last owner.

## 5. Client implementation: keep three state owners distinct

| Owner | State it owns | Must not own |
| --- | --- | --- |
| TUI policy | Route/tab/family facts, experiment choice | Subscription IDs, HTTP retries, snapshot reconciliation |
| Feed controller | Desired/held/installed targets, current generation, negotiation, PUT result | Service election, autonomous retry timer, per-reader union policy |
| Connection | Attempt lifecycle, timeout, retry/pause, event-only restart, batching | Product interest computation or arbitrary field validation |

### Normalize and cache the target

Extend the controller's normalized `InterestSet` with profile. `setDesired`
normalizes once, compares against current **desired**, and returns before store
or timer updates on semantic equality. Cache one immutable normalized transport
target derived from desired plus grace-held membership. Rebuild it only when
that membership/profile changes; the PUT drain captures it before awaiting.

Keep one trailing removal timer. Repeated equivalent inputs neither reset grace
nor allocate new unions. Additions are immediate, not debounced. Compare Maps/Sets
without allocating `Array.from(...).every(...)` intermediates. Emit wire arrays
only for an actual PUT or changed diagnostics. The profile is a scalar change,
not a grace-held key; a profile-only update must not be optimized away.

This is targeted cleanup of current
[`transportTarget`/`setDesired`](/packages/client/src/solid/controlled-event-feed.ts#L205-L272),
not a memoization library or another reconciliation engine.

### One generation through controlled and fallback

Do not clear `active` when entering legacy fallback. Keep generation identity,
parent cancellation, chosen transport and fallback reason until that attachment
terminates. Check identity/cancellation after each await, including thrown
pre-ready 404 and unsupported capabilities. Diagnostics do not grant ownership.

Capability fallback requires closing the already-open pending controlled GET
before joining SharedEvents. Use a child abort controller for that GET and
retain the parent attempt signal for fallback; aborting the entire attempt
would also kill its replacement attachment. Abort then close the old iterator.
No raw public fallback accessor and no second shared pool are needed.

Store a determinate failed PUT's original error and attempted target on the
generation. When the resulting SSE abort surfaces as Transport/EOF, rethrow the
control rejection to the connection owner. Otherwise initial 400 pauses while
the same 400 during an established stream silently retries forever. External
cancellation/disposal must not be promoted into a new invalid-target alert.

Flush rules are explicit: current target already installed resolves; intentional
legacy resolves; unchanged known-rejected target rejects; uncertainty waits for
owner recovery; disposal rejects current/future waiters. Optional adoption
cancellation removes its own waiter. Keep one rejected target/error, not a cache
of every failed command. Meaningful target change clears it deliberately.

### Retry pause and event-only restart

Retain the function-shaped `EventStreamAdapter`. Add a narrow optional
connection retry decision (`retry` versus `pause`, existing behavior by default)
and one event-attachment restart/wake operation. Keep state and a wake generation
inside the existing connection loop; waking between error classification and
parking must not be lost.

Pause only for the still-current invalid-interest rejection, not all HTTP 400s.
If desired changed while PUT failed, retry the new target. Do not reconnect a
healthy stream for ordinary interest changes: wake only when paused. Explicit
retry and known server change can re-run managed resolution; no independent
elected-server watcher exists while parked, so do not promise automatic wake
on an otherwise invisible server restart.

This operation must be distinct from current `client.restart`, which restarts
the managed **service**. Config toggles and retry must never restart the user's
server or remount DataProvider. Retain and close the actual iterator in the
connection's `finally`, after aborting it. Preserve the selected event batch's
existing ordering; profile changes do not justify dropping already queued events.

## 6. TUI integration without effect-order assumptions

ConfigProvider already wraps ClientProvider. Use `useConfig()` at client-context
construction; no provider reordering. The experiment defaults off and chooses
legacy versus negotiated focused attachment **at attempt start**. Toggling asks
the connection owner for one event-only restart; API, emitter, DataProvider and
tab state remain stable. Distinguish disabled legacy from capability fallback
in existing devtools. Retain desired interest while disabled.

The barrier must pull policy synchronously, not merely flush whatever the last
reactive effect happened to compute. Bind **one** `readDesired` callback from
EventInterestProvider into a TUI facade in ClientProvider. It remains the single
policy owner. The facade:

1. pulls the registered reader under `untrack`;
2. calls raw `setDesired` synchronously;
3. awaits raw flush in focused operation (intentional legacy is a no-op);
4. lets the reader start only if its route/tab token is still current.

Bind synchronously at provider initialization and unbind by identity. Calling
the focused barrier before binding is a setup error, not success with empty
interest. This one slot bridges the existing provider dependency (tabs outside
interest policy); it is not a registry or a per-tab lease map. Direct `follow(id)`
must seed `id`, its root, and known family, so a selected child cannot disappear
while family metadata is incomplete.

Use this same facade for optimistic first execution, visible message loading in
`routes/session/rows.ts`, and hidden-tab prefetch in `context/session-tabs.tsx`.
Metadata/permission/form reads may run concurrently; they are not the five gated
types. When family metadata is needed first, pull policy again afterward before
the transcript GET. Recheck membership after awaits to avoid obsolete navigation
or background reads applying to a changed tab. Test actual GET ordering, not
just metadata hydration or provider render order.

## 7. Transcript snapshots: a bounded repair, not replay

Two source-derived counterexamples block the earlier unconditional convergence
claim:

```text
GET captures running assistant
  → terminal event makes client row complete
  → old GET resolves and reconciles running row over it
  → no later event repairs it

client follows in middle of a text part
  → receives only suffix fragments
  → step.failed (no full-text replacement)
  → local suffix is not necessarily the durable canonical text
```

Current message sync has no watermark. `createSync` invalidation schedules another
read but does not by itself prohibit the old response from applying. Execution
completion currently refreshes metadata, not transcript history. Compaction
failure ordinarily removes partial summary on both projections, but a stale
snapshot can still resurrect its earlier running shape.

Add local per-**explicitly observed transcript** request identity plus a dirty
marker/version. This state belongs beside `message.sync`, not in EventFeed,
TUI transport, or metadata presence checks. Do not count automatically created
foreign arrays or `session.created`'s `sync.complete` as explicit observation.

- Capture request identity/version at GET start. Relevant observed durable
  transcript mutations, disconnect, eviction and deletion invalidate it.
- Before reconcile, discard superseded results; coalesce one serial follow-up
  read for an interested transcript. No request per event and no invalidation
  for every text/progress fragment.
- After incomplete Step failure/interruption, reconcile explicitly observed
  transcripts from authoritative history even if no request was pending.
  Adjacent terminal triggers coalesce. Adoption after an interest gap forces a
  real read rather than trusting a complete cache key.
- Eviction/delete cancel eligibility and reject late response resurrection.
  Preserve optimistic local admissions, message indexes and already-loaded
  pagination. A first-page repair must not discard older loaded pages casually.
- Network failure remains visible/retryable through existing read behavior;
  do not spin until a snapshot matches a continuously mutating Session.

The precise guarantee is **eventual canonical state for explicitly observed
transcripts after relevant durable activity settles and a fresh read succeeds**.
It does not recover historical live prefixes, prove an exact snapshot-plus-SSE
merge, or repair every unobserved foreign cache. Partial live display can jump;
it must not falsely remain marked as an authoritative completed result.

Implement this as a test-first local repair with the existing data module, not
a broad refactor of all reads. If the required pagination/failure fixtures expose
a larger seam than this outline, leave experiment graduation blocked and isolate
that specific work. No evidence here justifies a new replay transport.

## 8. Logical commits and dependencies

The sequence refines draft1's overview. Each implementation commit owns its
tests and explicit paths; use conventional repo types (`fix`/`refactor`, not
the server report's unsupported `perf`). No squash or push is part of this plan.

| ID | Commit intent / scope | Prerequisite and proof |
| --- | --- | --- |
| V0 | `test(events): characterize fanout and attachment composition` — Server/Client fixtures and isolated benchmark | Pin existing behavior before runtime edits; record D/B rates/bytes, physical GETs and skips |
| C0 | `fix(client): close and fence event attachments` — controller + connection | V0; pre-abort, stale fallback, SharedEvents isolation, EOF, iterator cleanup |
| T0 | `fix(tui): make scoped event delivery an explicit experiment` — config registry + event-only restart seam | C0; default legacy, one attachment per toggle, no provider/service restart; do not advertise focused support yet |
| P0 | `feat(protocol): negotiate session streaming interests` — canonical contract, generated clients/OpenAPI | V0; optional/default/unknown/capability tests; no new capability advertised by unimplemented server |
| S0 | `feat(server): select streaming events by followed session` — naive profile scan | P0; predicate and real move tests, both profiles, active/pending/cleanup/failure behavior |
| C1 | `feat(client): negotiate profile aware event interests` — normalization, target cache, capability fallback | P0 + C0; profile-only/equivalent-target/grace tests; close pending GET before fallback |
| C2 | `fix(client): pause rejected event interest targets` — generation error preservation + connection policy | C1; initial and midstream PUT 400, changed target during error, explicit wake, no resolver storm |
| D0 | `fix(client): avoid absent assistant edit allocations` — one helper + tests | V0; existing-row edits unchanged, zero creation on misses; characterize small scope of saving |
| D1 | `fix(client): reject stale transcript snapshots` — data read identity/dirty repair | V0; deferred read before/after terminal, failure, eviction, optimistic rows, pagination, bounded refetch counts |
| T1 | `feat(tui): adopt focused streaming before transcript reads` — policy facade + real read sites + diagnostics | T0 + S0 + C1 + D1 (C2 before graduation); visible/hidden/direct-child/prompt ordering and cancellation |
| S1 | `refactor(server): index focused session recipients` | S0; equivalent output over transition sequences, overflow during iteration, profile switches |
| S2 | `fix(server): skip recipientless streaming encoding` | S1; complete-arm synchronous precheck and measured zero-union-recipient case |
| V1 | `test(events): record focused feed acceptance` — reproducible report and graduation decision | Functional slice plus D1/C2/T1; compare scan/index/precheck independently, never infer CPU from event ratios |

Server indexing can proceed independently of client read repair after S0; it
must not delay learning whether the predicate itself cuts the workload. Snapshot
and lifecycle correctness cannot be traded away to get a favorable benchmark.
Generalized Location caches/indexes and residency filtering are not hidden
dependencies of V1.

## 9. Verification and completion record

Use the [draft1 matrix](/.design/bus-smart/draft1.gpt6a.md#8-verification-and-evidence-led-delivery),
with these implementation-specific assertions:

- Measured events are a uniquely identified **publication cohort** initiated
  after the installation acknowledgment; after removal, await the grace-driven
  replacement acknowledgment too. Count earlier queued tails separately. Client
  receipt time and grace-timer expiry do not locate server admission.
- Hold target membership constant for the 1/32 streaming ratio. Include broad
  RPC, large completed values and child-creation metadata requests; no assumed
  low-rate bound on the broad arm. Every declared follower gets the source IDs
  in order, not merely the right number of events.
- Compare no-target guard against absent rows and actual foreign-created rows
  separately. Sum client and server CPU; distinct processes are required to
  demonstrate the user's many-client amplification, not just one shared parser.
- Snapshot tests control capture, terminal delivery and response release order
  independently. Assert the row remains canonical with **no later event**, and
  bound fresh read count. Use actual durable projector fixtures where practical.
- Check generated Promise and Effect wrappers, not only hand-made async iterables.
  Run browser-conditioned connection tests with a harness that confirms they
  executed; ordinary server-condition skips cannot count as passing composition.

Commands remain package-local: `bun test` focused files and `bun typecheck` in
Client, Server, Protocol, Core regression and TUI as affected. Protocol changes
require `bun run generate` in `packages/client`, plus Protocol `generate` and
`check:generated`. Never hand-edit generated surfaces. Do not build distribution
artifacts to run development tests or examples.

This documentation pass establishes source-based implementation choices, not
the tests above. The remaining genuine go/no-go items are snapshot/failure
fixtures, lifecycle composition, and measured whole-workload benefit. Nothing
has been deployed, and no accepted-tip symlink is created without acceptance.

## 10. Cross-review: what was useful and what changed

- [Server implementation research](/.design/bus-smart/implementation-research1-server.glm53.md)
  is strongest on index lifecycle and the complete-arm zero-recipient precheck.
  This synthesis removes duplicated profile storage, defers derived-count cache
  state, corrects the per-client versus union encoding fraction, avoids exposing
  internals only for tests, and rejects “touched anyway” as a reason to bundle
  separate optimization state.
- [Client implementation assessment](/.design/bus-smart/implementation-research1-client.gpt6a.md)
  supplies the key actual read sites, provider-safe policy binding, error identity
  path, retention correction, and snapshot counterexamples. Its repair direction
  is adopted as a bounded test-first prerequisite, not a completed convergence
  proof or authorization for a generic lease/replay platform.
- [Contract review](/.design/bus-smart/review1-contract.glm53.md) usefully elevates
  broad RPC/byte rates and cohort definition. Its proposed arrival-time window
  is insufficient without replacement acknowledgment and source cohort IDs.
- [Observation review](/.design/bus-smart/review1-observation.glm53.md) correctly
  identifies durable-row residuals and the need for an experiment; its
  metadata-only flush fix and unconditional convergence assertion are explicitly
  superseded by the later client assessment. Do not implement from it alone.
- [draft1](/.design/bus-smart/draft1.gpt6a.md) states the selected profiles,
  notification choice and volatile move guarantees; this document is its
  implementation companion, not a replacement wire specification.
- [Earlier implementation-plan0](/.design/bus-smart/implementation-plan0.gpt56s.md)
  and [verification0](/.design/bus-smart/verification0.gpt56s.md) describe the
  original branch's closeout. Their test counts are historical evidence, not
  completion of this new plan.
