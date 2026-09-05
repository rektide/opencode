---
type: Research
title: Rebased move paths and the controlled-feed guarantee
description: Current idle recovery, deferred movement, publication ordering, and restart/reconnect limits after session-aware instance selection.
resource: /.design/bus-smart/research1-move-guarantees.gpt6a.md
tags: [bus-smart, session, move, routing, ordering, recovery]
status: draft
generated: { by: "agent:openai/gpt-6-astra#xhigh", at: 2026-09-05 }
researched_by: "agent:zai-coding-plan/glm-5.3#max"
verified: { by: unassigned, at: never }
stale_after: 2026-12-01
sources:
  - id: normative-draft
    resource: /.design/bus-smart/draft0.gpt56s.md
    title: Controlled event feed directional draft
  - id: sequencing
    resource: /.design/bus-smart/research-event-sequencing0.gpt56s.md
    title: Event sequencing requirements for scoped SSE feeds
  - id: move
    resource: /packages/core/src/session/move.ts
    title: SessionMove source probe and immediate/deferred selection
  - id: bus
    resource: /packages/core/src/bus.ts
    title: Publication, routing, and inline observation
  - id: feed
    resource: /packages/server/src/controlled-event-feed.ts
    title: ControlledEventFeed admission and derived Locations
  - id: instance-selection
    resource: https://github.com/anomalyco/opencode/commit/3e9b009642ba396fd0cef405a591942497b66b32
    title: "Session-aware instance selection (#46442)"
  - id: idle-recovery
    resource: https://github.com/anomalyco/opencode/commit/ac874a6e90a2e7c4c5ee310e05c7a23eb2ee094f
    title: "Recover idle moves through the selected instance (#46955)"
---

# Rebased move paths and the controlled-feed guarantee

**Authorship:** GX (GLM 5.3 max) gathered the source and upstream evidence in
this session. GPT-6 Astra synthesized it after the requested rescue, checking
only missing references. This is not an independent second research opinion.
No other agent's same-wave report was read. No runtime code was changed, no
tests were run, and no live service was accessed.

## Findings for draft1

1. **Keep the existing one-line `publishAll([moved])` correction.** The rebased
   `SessionMove` has a broader immediate-recovery predicate, but upstream still
   leaves that branch's no-cancellation publication interruptible after commit.
   Our correction puts it under the same commit-through-notify protection as
   the cancellation batch and runner handoff.
2. **Rename the branch “idle unavailable-source recovery,” not just
   “missing-directory recovery.”** It covers failure to initialize the
   Session's selected source instance, provided the probed Location still
   matches and local execution is still idle.
3. **A successful `Session.move()` is not generally a completed move.** The
   immediate branch commits placement before returning; the ordinary branch
   admits a durable control and wakes execution. The controlled feed follows
   the eventual `session.moved`, not the request, inbox admission, or wake.
4. **The transport guarantee is a live publish-return handoff, not a durable
   delivery guarantee.** Awaited Bus observation lets the feed install the
   destination and enqueue the move before publication returns. It does not
   guarantee that a client consumed the frame, that a deferred move progresses,
   or that process death cannot intervene between commit and notification.
5. **Restart and reconnect have different gaps.** Execution recovery selects
   the stored placement before acquiring a runner; a pending move cannot by
   itself bypass an uninitializable source. A new feed starts with no derived
   Locations; exact Session following survives a stale client Location, but
   Location-owned destination events can remain uncovered until interests
   catch up. Neither is fixed by the one-line publication correction.

## Scope and upstream comparison

The normative baseline is [draft0's ordering section](/.design/bus-smart/draft0.gpt56s.md#L789-L816),
particularly destination coverage before causally later publication and the
explicit no-replay reconnect contract. The motivating rebase is recorded in
[port0](/.design/bus-smart/port0.glm53h.md#L22-L39).

GX inspected the local archive first, at
`/home/rektide/archive/anomalyco/opencode` (`~/a/a/opencode`), using the archive's
`origin/v2` ref at `2960c61f9c5c86f23059d9da73e632951650edc7` (#47464).
**The archive's checked-out HEAD was older; it was not the comparison base.**

The inspected upstream changes were:

- [anomalyco/opencode #46442, `3e9b009642`](https://github.com/anomalyco/opencode/commit/3e9b009642ba396fd0cef405a591942497b66b32):
  introduce Session-aware instance selection. The **current**
  [`Instance.Service` contract](/packages/core/src/instance/service.ts#L10-L19)
  exposes `provide(session)` and is an unbound global service. Do not copy the
  original commit's additional methods or default-layer shape into a current
  design description.
- [anomalyco/opencode #46955, `ac874a6e90`](https://github.com/anomalyco/opencode/commit/ac874a6e90a2e7c4c5ee310e05c7a23eb2ee094f):
  extract `SessionMove`, probe the selected source instance outside the inbox
  lock, and revalidate placement plus execution state before direct recovery.

GX's diff against that `origin/v2` showed **exactly one changed line in
`session/move.ts`**: [`L140`](/packages/core/src/session/move.ts#L140) uses
`bus.publishAll([moved])` rather than upstream's `bus.publish(...moved)`.
`session-move.test.ts` adds the two routed-observation interruption tests;
the rest of that file matched upstream. The old bus-smart workspace was not
needed for this comparison.

## 1. Admission and immediate-recovery path matrix

### Facts: destination first, then a source probe, then revalidation

[`resolveDestination`](/packages/core/src/session/move.ts#L74-L101) resolves a
relative target against the initial Session Location, validates the directory,
resolves project/subpath, and initializes the destination Location context.
This happens **before** source probing or inbox mutation. Destination startup
can therefore precede the move event; the feed does not promise to retain
destination initialization events that occur before the handoff.

[`sourceUnavailable`](/packages/core/src/session/move.ts#L103-L111) means:

1. If `execution.isActive(session.id)`, return `false`: do not bypass an owner.
2. If the source is not a directory, return `true` without acquiring its instance.
3. Otherwise acquire `SessionRunner.Service` through `instances.provide(session)`.
   Successful acquisition means available; a non-interruption cause means
   unavailable; a cause containing interruption propagates.

This probe is outside `SessionInbox.serialized`, so inbox cancellation need
not wait for source initialization. Inside the lock, direct recovery requires
all four predicates at [`move.ts:127-134`](/packages/core/src/session/move.ts#L127-L134):

```text
source probe reported unavailable
AND latest.directory == probed.directory
AND latest.workspaceID == probed.workspaceID
AND local execution is still inactive
```

“Idle” here means absence of coordinator ownership, not merely absence of a
model request. Ownership spans initialization, interruption cleanup, and
terminal settlement ([`execution.ts:18-35`](/packages/core/src/session/execution.ts#L18-L35),
[`run-coordinator.ts:88-117`](/packages/core/src/session/run-coordinator.ts#L88-L117)).

| Request situation | Result | Ordering and evidence |
| --- | --- | --- |
| Unknown Session; missing, non-directory, or unavailable destination | Reject before admitting a move | [`move.ts:68-101`](/packages/core/src/session/move.ts#L68-L101); unavailable-destination test at [`session-move.test.ts:450-468`](/packages/core/test/session-move.test.ts#L450-L468) |
| Source probe is interrupted, including caller interruption | Neither immediate move nor new move inbox item | [`move.ts:103-123`](/packages/core/src/session/move.ts#L103-L123); both interruption cases at [`test:342-362`](/packages/core/test/session-move.test.ts#L342-L362) |
| Source unavailable, same probed placement, still idle; no pending move rows | Immediate `publishAll([Moved])`, then advisory wake | [`move.ts:135-152`](/packages/core/src/session/move.ts#L135-L152); no InboxEnqueued/Delivered pair for this new request |
| Same recovery condition, with pending move rows | Cancel **all pending move controls**, queue or steer, then publish Moved in one batch | [`moveIDs`](/packages/core/src/session/inbox.ts#L397-L405) selects only type `move`; [`move.ts:135-141`](/packages/core/src/session/move.ts#L135-L141) batches cancellations before Moved; non-move input remains pending |
| Healthy selected source, locally idle | Admit a move control and wake the coordinator | [`move.ts:143-152`](/packages/core/src/session/move.ts#L143-L152); idle is not enough for the immediate branch |
| Locally active, even if source directory disappeared | Admit and defer to the runner; no out-of-band placement change | [`sourceUnavailable:104`](/packages/core/src/session/move.ts#L104), [`test:514-547`](/packages/core/test/session-move.test.ts#L514-L547) |
| Execution starts while source probe is suspended | In-lock active recheck refuses recovery; admit and wake | [`test:364-386`](/packages/core/test/session-move.test.ts#L364-L386) explicitly holds instance acquisition while real coordinator ownership exists |
| Directory **or workspace** changes during probe | Refuse stale direct recovery; admit the already-resolved destination as an ordinary control | [`test:409-448`](/packages/core/test/session-move.test.ts#L409-L448); the target is not re-resolved against the changed source |

Two consequences should be explicit in draft1:

- **Immediate recovery ignores the request's scheduling delay.** A request
  marked `delivery: "queue"` can still recover immediately when the source
  cannot host a runner. The selected-instance tests intentionally demonstrate
  this while preserving an earlier queued non-move item
  ([`session-move.test.ts:260-339`](/packages/core/test/session-move.test.ts#L260-L339)).
- **Placement-match rejection is safe deferral, not successful recovery.** It
  preserves the newer placement and adds a durable control. Whether that
  control can run depends on the selected instance at the newer placement.

## 2. Runner control and destination-suffix matrix

Deferred admission publishes `session.inbox.enqueued` through ordinary single
`bus.publish` ([`inbox.ts:169-202`](/packages/core/src/session/inbox.ts#L169-L202)).
The request then calls `execution.wake`; the coordinator starts an owner or
rings its existing doorbell, **without waiting for the drain**
([`run-coordinator.ts:82-106`](/packages/core/src/session/run-coordinator.ts#L82-L106),
[`L131-140`](/packages/core/src/session/run-coordinator.ts#L131-L140)).

| Runner situation | Eligibility / applied sequence | Consequence |
| --- | --- | --- |
| Ongoing logical Step, move steered | Eligible at a safe boundary, not by moving underneath active tools | `advanceToStep` consults steers when continuing and not entering a Location ([`llm.ts:67-79`](/packages/core/src/session/runner/llm.ts#L67-L79)) |
| Ongoing continuation, move queued | Normally waits for an idle or Location-entry boundary | Queued input is not ordinary mid-Step steering; [`inbox.ts:407-424`](/packages/core/src/session/inbox.ts#L407-L424) |
| Idle boundary | Steers first; otherwise first queued item | Queued prompts before a queued move can delay it; selection is ordered, not “take any pending move” |
| Entry into destination with a carried continuation | Queued controls can run before the next model call, as well as steers | `entering` permits `"input"` control selection; chained steer→steer and steer→queue moves preserve step allowance ([`session-runner.test.ts:1317-1359`](/packages/core/test/session-runner.test.ts#L1317-L1359)) |
| Pending steered compaction versus move | Compaction priority does not cross the earlier steered move | [`inbox.ts:533-549`](/packages/core/src/session/inbox.ts#L533-L549); no reordering controls across a Location change |
| Apply a selected move | Under the inbox lock: close model transport, then `publishAll([InboxDelivered, Moved])` | [`llm.ts:85-97`](/packages/core/src/session/runner/llm.ts#L85-L97); inbox consumption and placement commit are atomic |
| Finish source drain | Return `DrainResult.Moved`, carrying the logical step if continuing | [`llm.ts:98-103`](/packages/core/src/session/runner/llm.ts#L98-L103); execution recursively reloads `SessionStore` and uses `instances.provide(session)` for destination drain ([`execution.ts:82-104`](/packages/core/src/session/execution.ts#L82-L104)) |
| Publish destination suffix | Normal unlocated Session events now route through the new owner; destination-bound work publishes with destination context | The runner cannot begin its destination drain until the move batch returns. Explicitly envelope-pinned events retain Bus's existing envelope rules, not a universal override to destination |

Cancellation and delivery-mode changes share the same inbox mutex as control
selection ([`inbox.ts:230-260`](/packages/core/src/session/inbox.ts#L230-L260),
[`L451-456`](/packages/core/src/session/inbox.ts#L451-L456)). The new control is
still mutable while pending; successful admission does not guarantee it will
ever produce a move event.

The `restore(...)` around transport close plus the move batch in
[`llm.ts:85-94`](/packages/core/src/session/runner/llm.ts#L85-L94) does **not**
make `publishAll`'s own protected section interruptible. Cancellation while
closing transport can leave the move pending; cancellation once its batch is
committing cannot cut off that batch's normal notification phase.

## 3. What publish-return actually guarantees

### Facts: the one-line patch still closes the same hole

For single durable `publish`, the transaction and route application are
uninterruptible, but the subsequent `notify` is outside that section
([`bus.ts:345-476`](/packages/core/src/bus.ts#L345-L476),
[`L499-507`](/packages/core/src/bus.ts#L499-L507)). Publisher interruption can
therefore leave committed placement with incomplete or absent volatile
notification. That is the upstream no-cancellation immediate-move defect.

`publishAll` instead holds the same-aggregate mutex and protects **transaction,
route application, durable wakes, and all batch notifications** with
`Effect.uninterruptible`
([`bus.ts:620-711`](/packages/core/src/bus.ts#L620-L711)). It prepares payloads
and waits for the lock before entering that protected work; this is not a
promise that every started call must commit.

All three current SessionMove/runner application shapes now use this path:

```text
idle recovery, no earlier move controls: [Moved]
idle recovery, superseding controls:    [InboxCancelled..., Moved]
runner control delivery:                [InboxDelivered, Moved]
```

Routed observers are awaited before legacy listeners and PubSub publication
([`bus.ts:537-550`](/packages/core/src/bus.ts#L537-L550)). Bus first installs
the committed routing snapshot: a move reaches old and new Location, even
with an envelope Location, and later unlocated Session publications resolve
to the new owner ([`bus.ts:242-290`](/packages/core/src/bus.ts#L242-L290)).
Refs describe recipients; duplicate refs for a same-Location move are not
multiple logical deliveries.

### Facts: feed admission completes inside that awaited observation

For an **active subscription that requests the exact Session**, the feed sets
`derivedLocations[sessionID] = event.data.location` before matching and
offering Moved. This happens under its one admission permit
([`controlled-event-feed.ts:126-160`](/packages/server/src/controlled-event-feed.ts#L126-L160)).
The destination is data, not the last audience ref. Requested Location overlap
does not erase the hold; unfollow does, deletion does, and a later move replaces
it ([`L148-154`](/packages/server/src/controlled-event-feed.ts#L148-L154),
[`L216-219`](/packages/server/src/controlled-event-feed.ts#L216-L219)).

The resulting relation is:

```text
move commit
  → committed routing snapshot
  → awaited feed admission: destination hold + move frame
  → move batch returns
  → destination runner / other await-dependent publisher proceeds
```

This is why an asynchronous Bus stream consumer is not interchangeable with
the inline observer: publication could otherwise return before the derived
destination was installed.

### Recommendation: exact normative wording

> During one healthy, active controlled-subscription lifetime, for a Session
> retained in requested Session interest at the move's admission cut,
> ControlledEventFeed installs the move destination and admits the move frame
> in the same serialized section. Bus awaits that observation before the move
> publication returns. The current SessionMove and runner move publications
> protect commit-through-notify against external interruption of the publisher,
> so such interruption cannot strand committed placement before the normal
> routed-notification phase completes. Publications causally following that
> return use the installed coverage and enter the same selected-event FIFO.

Necessary limits, not optional qualifications:

- **Admission is not receipt.** No acknowledgment says the client parsed or
  projected the move. Overflow or encoding failure terminates the feed rather
  than preserving delivery ([`feed:95-100`](/packages/server/src/controlled-event-feed.ts#L95-L100),
  [`L118-142`](/packages/server/src/controlled-event-feed.ts#L118-L142)).
- **Not a database/observer transaction.** Observer defects are isolated and
  logged, and observer interrupt causes propagate
  ([`bus.ts:524-535`](/packages/core/src/bus.ts#L524-L535)). Protection from
  external caller cancellation is not an absolute promise against observer
  failure, explicit observer interruption, or process death.
- **Not every publisher is serialized.** Same-aggregate durable publication
  is locked through notification. Ephemeral publication is not
  ([`bus.ts:509-512`](/packages/core/src/bus.ts#L509-L512)); unrelated concurrent
  destination Location events may run before the move's feed admission.
  “Causally later” must mean an actual ordering dependency, not merely “the
  Session row already says destination.”
- **Location interest is not Session following.** A source-Location-only
  subscriber can receive the move through its source audience without gaining
  destination coverage. Permission/form events do not acquire exact Session
  classification merely because their payload includes a Session ID
  ([`bus.ts:227-240`](/packages/core/src/bus.ts#L227-L240),
  [`feed:269-282`](/packages/server/src/controlled-event-feed.ts#L269-L282)).
- **Do not extend this to arbitrary direct Bus calls or replay.** A publisher
  that manually invokes single `publish(Moved, ...)` still has single-publish
  semantics; replay notification has its own path
  ([`bus.ts:716-745`](/packages/core/src/bus.ts#L716-L745)).

## 4. Interruption, mismatch, restart, and reconnect limits

The following distinguishes code facts from source-derived consequences that
were not reproduced in this research.

| Boundary | Established mechanics | Consequence / limit |
| --- | --- | --- |
| Caller interrupted before move admission / during source probe | Probe interruption propagates; no new item is created | Existing tests pin this; do not recover from an interruption as though source configuration were broken |
| Caller interrupted after immediate move commit | Our protected batch completes normal routed notification | The following `execution.wake` is **outside** that batch. Placement/notification can finish without the later wake; the fix is not atomic commit-plus-execution scheduling |
| Caller interrupted around deferred admission | InboxEnqueued uses single publish, and wake follows admission | Pending row can survive without its volatile enqueue notification or a completed wake; this is the general inherited admission window, not the immediate-move hole |
| User interrupts active execution | Coordinator accepts interruption without waiting for cleanup, clears prior wakes; user terminal releases claim | Pending controls need not be cancelled. `interrupt(..., { continue: true })` can schedule an eligible control/steer successor; controls behind a queued prompt still wait ([`execution.ts:148-165`](/packages/core/src/session/execution.ts#L148-L165)) |
| Move is admitted during interruption cleanup | Ownership remains active; fresh wake can survive to start a successor | Deferral remains intentional; no direct recovery while the old owner settles ([`run-coordinator.ts:109-161`](/packages/core/src/session/run-coordinator.ts#L109-L161)) |
| Process dies before selected move batch commits | Transaction has not consumed move / changed placement | Pending row can remain; whether startup schedules it depends on recovery eligibility, not on the existence of a feed |
| Process dies after move commit | Placement and, for runner path, inbox consumption are already projected | `Effect.uninterruptible` cannot make commit and volatile notification crash-atomic. On recovery the stored destination is authoritative; there is no move-frame replay promise |
| Shutdown or crash leaves a top-level execution claim | Startup recovery attempts resume with durable attempt accounting | Claim survives shutdown; success/failure/user interruption release it ([`execution.ts:71-81`](/packages/core/src/session/execution.ts#L71-L81), [`L113-141`](/packages/core/src/session/execution.ts#L113-L141)); recovery invokes resume, not SessionMove's unavailable-source recovery |
| Pending move but no claim | Normal top-level sweep selects `time_suspended != null`, not nonempty inboxes | **Code-derived:** absent another recovery wake, an admitted-but-unclaimed idle move is not automatically resumed by this sweep ([`store.ts:190-219`](/packages/core/src/session/store.ts#L190-L219), [`restart.ts:190-229`](/packages/core/src/session/execution/restart.ts#L190-L229)). No claim that every boot path was audited |
| Pending move, retained claim, but source cannot initialize after restart | Execution first reloads stored Session and acquires its selected runner | **Code-derived progress gap:** if source acquisition fails, the pending move control cannot execute to escape that source; execution failure releases the claim. A later explicit move request while idle can run the direct recovery path |
| Probe reported unavailable, but placement changed before lock | Recovery is deliberately refused, even if the new source is also unusable | **Code-derived:** fallback admission is not a retry of availability detection at the new source. Same source-acquisition progress limitation applies if the new placement cannot run |
| Destination becomes unavailable after initial validation | Runner move is not a second destination-health transaction | **Code-derived:** placement may commit and be observed, then destination runner acquisition fails. Publication correctness does not promise execution success |
| SSE disconnect / server restart | New feed subscriber starts pending with an empty `derivedLocations` map | It does not recover old move holds from SessionStore; activation installs only the supplied requested target ([`feed:165-197`](/packages/server/src/controlled-event-feed.ts#L165-L197), [`L199-235`](/packages/server/src/controlled-event-feed.ts#L199-L235)) |

### Restart is claim recovery, not general move recovery

The startup sweep uses [`prepareResume`](/packages/core/src/session/execution/restart.ts#L77-L98)
and [`execution.resume`](/packages/core/src/session/execution/restart.ts#L217-L226).
Execution then calls `instances.provide(session)` before any runner can select
the move ([`execution.ts:88-103`](/packages/core/src/session/execution.ts#L88-L103)).
Thus “a claimed pending move is resumed” means **an attempt is scheduled**; it
must not be documented as guaranteed movement out of a missing/broken source.
Already-acquired active instances and a fresh post-restart acquisition are
different situations.

The carried logical step is transient
([`runner/index.ts:20-25`](/packages/core/src/session/runner/index.ts#L20-L25));
restart uses stored history and recovery instruction rather than persisting
that in-memory handoff value. Recoverable background children have a separate
job path, not the top-level `listSuspended` selection. This report does not
claim to audit that entire job-recovery protocol.

### Reconnect can have a post-activation Location-coverage gap

The client creates a new generation and installs its current transport target
after ready ([`client/controlled-event-feed.ts:148-180`](/packages/client/src/solid/controlled-event-feed.ts#L148-L180)).
“Current target” means current **client knowledge**, not a server-side lookup
of every followed Session's authoritative placement.

If a followed Session moved while disconnected, exact Session matching still
admits subsequent `SessionEvent.All` payloads at the new Location. But its old
derived Location is gone, and no new Moved need occur. Destination-only
permission/form or other Location events can therefore be filtered **even
after activation**, until hydration/interest updates add the destination. A
fresh exact-Session-only subscription has the same limitation without any
disconnection.

This is a code-derived boundary, not a reproduced new regression. Draft0
explicitly rejects replay; do not nevertheless imply that reconnect instantly
reconstitutes destination Location coverage. Hydration can restore current
read models, but is not evidence that every missed transient event is
recoverable. If draft1 wants stronger coverage from reconnect activation, it
needs a separately specified authoritative placement/bootstrap contract; do
not silently expand this patch into one.

## 5. Verification: existing oracles and concrete next tests

### Existing evidence, inspected but not rerun

| Oracle | What it actually pins |
| --- | --- |
| [`session-move.test.ts:202-339`](/packages/core/test/session-move.test.ts#L202-L339) | Healthy/broken/unreadable source behavior; selected-instance authority; immediate recovery despite queue delivery; retention of non-move input |
| [`session-move.test.ts:342-448`](/packages/core/test/session-move.test.ts#L342-L448) | Probe interruption; active-during-probe deferral; missing-source short-circuit; exact directory/workspace mismatch guard |
| [`session-move.test.ts:514-547`](/packages/core/test/session-move.test.ts#L514-L547) | An active missing-source move is **admitted**, not immediately applied. Its runner is held at `Effect.never`; this is not proof of later successful handoff |
| [`session-move.test.ts:549-622`](/packages/core/test/session-move.test.ts#L549-L622) | Both immediate batch shapes finish a gated routed callback despite external caller interruption |
| [`session-runner.test.ts:1285-1359`](/packages/core/test/session-runner.test.ts#L1285-L1359) | Queued idle delivery is atomic; chained controls preserve tool history and step allowance |
| [`session-runner.test.ts:1361-1396`](/packages/core/test/session-runner.test.ts#L1361-L1396) | Runner move batch finishes gated routed observation despite interruption |
| [`session-runner.test.ts:1398-1473`](/packages/core/test/session-runner.test.ts#L1398-L1473) | Queued prompts stay parked during carried continuation; Location entry permits queued control work |
| [`bus.test.ts:582-614`](/packages/core/test/bus.test.ts#L582-L614) | Concurrent same-aggregate durable publish cannot interleave a batch's notifications; this test gates `listen`, not the routed seam |
| [`controlled-event-feed.test.ts:315-364`](/packages/server/test/controlled-event-feed.test.ts#L315-L364) | Synthetic routed input proves derived destination coverage, overlap retention, unfollow release, and deletion release. It is not a real SessionMove/permission/form integration test |
| [`bus-session-routing.test.ts`](/packages/core/test/bus-session-routing.test.ts) | Publication-time dual move audiences, workspace identity, slow subscribers, batch move/delete, rollback, and replay routing |

### Recommendations, ordered by direct relevance

1. **Real handoff-to-feed integration.** Activate with source Location plus
   exact Session, with no destination requested. Exercise real idle recovery
   and runner handoff, then await publication and immediately publish
   destination Location-owned permission/form events plus a Session suffix.
   Assert a single ordered move and suffix without any client interest PUT.
   The current component oracles are complementary; they do not run this full
   chain together.
2. **Rebase-specific completion case.** Extend the unavailable-source routed
   interruption oracle to a broken selected instance with an existing source
   directory. Separately test a genuinely active runner reaching its boundary
   after the source disappears. The existing active-deferral test stops at
   admission, and removed-directory interruption coverage does not name the
   broader #46955 predicate.
3. **Pin reconnect's coverage boundary.** Move while disconnected, reconnect
   with stale Location plus retained Session ID, then publish Session and
   destination Location events. Assert exact-Session receipt and the current
   Location gap, followed by recovery when interest includes destination. This
   prevents documentation from promising more than the implementation.
4. **Separate Core recovery characterization if needed.** A claimed pending
   move with an uninitializable source, and a probe-placement mismatch into an
   uninitializable source, would pin the inferred progress gaps. The searched
   `session-execution.test.ts` contains startup recovery tests but no move
   matches. Existence of equivalent tests elsewhere was not exhaustively
   established. Do not turn these into bus-smart runtime changes by default.

A gated `observeRouted` version of the Bus batch non-interleave test would be
useful but secondary to the real feed integration. Generic single-publish
interruption behavior remains an inherited limitation for inbox admission and
other events; changing it project-wide is outside this report's recommendation.

No new runtime defect in the ported one-liner was demonstrated. The concrete
upstream defect remains the original interrupted immediate notification hole;
the additional findings are **scope/wording corrections, incomplete integration
coverage, and explicitly untested recovery consequences**.

## 6. Draft1 edits recommended to the parent

- Replace stale `session.ts` move references with `session/move.ts` and replace
  “source directory disappeared” as the complete condition with the selected
  source probe + exact placement match + inactive recheck.
- Keep `publishAll([moved])`; leave runner, scheduling, and initiator call sites
  untouched for this correction.
- Use the qualified normative paragraph above. Avoid “every committed move is
  delivered,” “all Session-ID events are globally serialized,” or “return from
  Session.move means movement completed.”
- State that derived following requires exact Session interest at admission,
  persists only within the live subscription, and is not reconstructed on
  reconnect from authoritative placement.
- Keep unavailable-source progress/restart issues distinct from volatile feed
  admission. Decide separately if they deserve Core recovery work.

## Cross-references

- [Draft0](/.design/bus-smart/draft0.gpt56s.md#L224-L249) — the original
  commit-to-notify rationale remains valid; its missing-source description
  and [move carry boundary](/.design/bus-smart/draft0.gpt56s.md#L724-L750) need
  current-path terminology and qualified publish-return wording.
- [Sequencing research](/.design/bus-smart/research-event-sequencing0.gpt56s.md#L202-L257)
  — establishes why an external initiator requires server-side following and
  one FIFO. Draft0 supersedes its earlier client move-preparation proposal;
  this report does not revive that protocol.
- [Port report](/.design/bus-smart/port0.glm53h.md#L26-L39) — identifies the
  extraction and test re-anchoring; the source matrix here explains what the
  new predicate actually means beyond textual merge success.
- [Verification report](/.design/bus-smart/verification0.gpt56s.md#L83-L108)
  — reports 19 SessionMove and 203 runner tests on the rebased tree. Those are
  prior results, not tests rerun here, and do not alone establish the combined
  restart/reconnect/handoff guarantees discussed above.
