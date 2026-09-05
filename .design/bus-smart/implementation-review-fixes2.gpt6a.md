---
type: ImplementationReport
title: Bus-smart second-review corrections and transcript audit
description: Persistent repair obligations, bounded trailing scheduling, and a Core-to-Client mutation audit.
resource: /.design/bus-smart/implementation-review-fixes2.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
stale_after: 2026-10-05
sources:
  - resource: /.design/bus-smart/code-review2-spec.gpt6a.md
  - resource: /.design/bus-smart/code-review2-standards.gpt6a.md
  - resource: /packages/core/src/session/message-updater.ts
  - resource: /packages/core/src/session/projector.ts
  - resource: /packages/core/src/session/transfer.ts
  - resource: /packages/client/src/solid/data.ts
---

# Second-review corrections

## Baseline and reproduced failures

Clean reviewer checkpoint `42ae8a07` (working change `ypkpqpkx / e22c4222`). Both
review2 documents and their scratch reproductions read in full. No child agents,
live-service operations, history rewriting, or experiment graduation authorized.
The external server restart interrupted no edits: the working copy remained clean.

From Client, `bun test --conditions=browser ../../.test-agent/bus-smart/spec-review2-gpt6a/reproduction.test.ts`
reproduced **2 failures**: Skill activation leaves an empty complete transcript;
terminal-first/enqueue-last leaves a completed failed assistant's ephemeral suffix.
These already-minimized, source-diagnosed repros are the feedback loop; no additional
speculative diagnosis or architectural investigation is needed.

## Canonical mutation audit — recorded before classifier edits

Audit boundary: all **43** members of generated `SessionEventDurable`, the exhaustive
[Core message updater](/packages/core/src/session/message-updater.ts#L63-L453), the
[projector registrations](/packages/core/src/session/projector.ts#L433-L768), and
[Client handlers](/packages/client/src/solid/data.ts#L580-L1136) at the checkpoint.
Line references in this audit describe that baseline. Classification is about
**explicitly observed** transcripts; discovery alone must not register ownership.

Categories:

- **None**: no canonical transcript mutation; no transcript version/repair work.
- **Direct/update**: live projection plus version fence for an overlapping GET;
  does not create an independent authoritative duty just for ongoing activity.
- **Direct/settled**: live projection plus version fence; if a read is incomplete
  or overlapping, retain an authoritative duty until a successful reconciliation.
- **Authoritative**: live handling is absent, cannot reconstruct irreducible state,
  or failure can retain ephemeral content. Always oblige a canonical read for an
  explicitly observed cache, including an already-complete one.
- **Revoke**: discard read ownership rather than refetch deleted state.

| Durable events (all `session.`) | Core / projector effect | Client baseline and required category |
| --- | --- | --- |
| `created` | Normally empty; [import commit inserts rows](/packages/core/src/session/transfer.ts#L89-L114) with this event | Metadata-only handler. **Authoritative** for already-observed IDs; never register foreign creates. Creation POST gate still applies. |
| `forked` | [Copies settled canonical history](/packages/core/src/session/projector.ts#L182-L220) into a new aggregate | No live transcript handler. **Authoritative** only if target explicitly observed; normal first adoption still reads once. |
| `deleted` | [Deletes Session/cascaded rows](/packages/core/src/session/projector.ts#L541-L543) | `removeSession`; **revoke** and cancel scheduled work. |
| `viewed`, `renamed`, `usage.recorded` | Updater no-op; projector changes Session metadata/totals only | **None**; existing metadata hydration remains separate. |
| `execution.started` | Updater no-op | Status-only; **none**. |
| `revert.staged`, `revert.cleared` | [Changes boundary metadata, not stored messages](/packages/core/src/session/projector.ts#L699-L720) | Read-model visibility only; **none**. |
| `inbox.delivery.changed` | Pending delivery policy only | Direct pending edit; **none** for canonical transcript, still dirties pending GET. |
| `agent.selected` | [Append selection with previous agent and metadata](/packages/core/src/session/message-updater.ts#L75-L88) | Live row uses cached previous agent and omits metadata. **Authoritative**; selection is infrequent and canonical previous may be unavailable locally. |
| `model.selected` | [Append selection with previous model and metadata](/packages/core/src/session/message-updater.ts#L89-L102) | Existing live placeholder + canonical point GET. **Direct/settled**, keeping that upstream point-read behavior; overlapping initial snapshot is fenced. |
| `moved` | [Append previous/destination Location row](/packages/core/src/session/message-updater.ts#L103-L117) | Only inserts when Session info exists, omits metadata. **Authoritative** for observed transcript, including metadata-not-hydrated case. |
| `instructions.updated` | [Append System row iff `text !== undefined`](/packages/core/src/session/message-updater.ts#L129-L141) | Matching live insertion. **Direct/settled** with text (including empty text), **none** without text. |
| `synthetic` | [Append full synthetic row](/packages/core/src/session/message-updater.ts#L142-L153) | Matching live insertion; **direct/settled**. |
| `skill.activated` | [Append full Skill row](/packages/core/src/session/message-updater.ts#L154-L166) | Missing handler/classifier. **Authoritative**; [resume:false permits no later terminal](/packages/core/src/session/session.ts#L232-L253). |
| `inbox.enqueued`, `inbox.cancelled` | Pending rows only, not canonical messages | Local visible admission/retraction changes snapshot merge state. **Direct/update** fence preserves pending/outbox; must not consume an outstanding terminal obligation. |
| `inbox.delivered` | [Consumes inbox and inserts user/synthetic message atomically](/packages/core/src/session/projector.ts#L591-L622) | Reorders only an already-known local input; cannot reconstruct unknown input payload. **Authoritative** for observed transcript. Move/compaction deliveries may add no row; event lacks item type, so no speculative cache is added to distinguish them. |
| `shell.started` | [Append shell row with metadata](/packages/core/src/session/message-updater.ts#L167-L180) | Matching live insertion; **direct/update**. |
| `shell.ended` | [Set status, exit, output, completion](/packages/core/src/session/message-updater.ts#L181-L194) | Matching live update; **direct/settled**. |
| `step.started` | [Create/reset owned assistant; complete previous active row](/packages/core/src/session/message-updater.ts#L195-L236) | Matching live update; **direct/update**. |
| `step.streamed`, `retry.scheduled` | Set streamed time / retry state | Matching live edits; **direct/update**. |
| `step.ended` | [Completion, usage, provider state and terminal snapshot/files](/packages/core/src/session/message-updater.ts#L242-L252) | Live handler omits `snapshot.files`. **Direct/settled**, with a targeted snapshot-field mirror correction; do not wait for `message.content.updated`. |
| `step.failed` | [Failure fields and terminal snapshot/files](/packages/core/src/session/message-updater.ts#L253-L267) | Live suffix can remain non-durable. **Authoritative**, preserving duty across later ordinary updates and unsuccessful reads. |
| `text.started`, `reasoning.started`, `tool.input.started`, `tool.called` | Append/reset part or tool state | Matching live edits on loaded assistants; **direct/update**. Missing old off-window targets do not justify eagerly loading all history. |
| `text.ended` | [Replace text **and state**](/packages/core/src/session/message-updater.ts#L273-L281) | Live handler omits state. **Direct/settled**, with targeted state mirror correction. |
| `reasoning.ended`, `tool.input.ended`, `tool.success`, `tool.failed` | [Self-contained part/tool settlement](/packages/core/src/session/message-updater.ts#L297-L381) | Live edits carry settlement fields; **direct/settled**. No assumption of a later content-replacement event. |
| `message.content.updated` | [Replace owned assistant content](/packages/core/src/session/message-updater.ts#L68-L73) | Matching live replacement; **direct/settled**. [Explicit update API](/packages/core/src/session/session.ts#L66-L85), not an unconditional completion notification. |
| `compaction.started` | [Append running row; projector also consumes pending control](/packages/core/src/session/message-updater.ts#L392-L404) | Live row omits metadata; add the direct metadata field. **Direct/update** plus existing pending fencing. |
| `compaction.ended` | [Update running row or append completed fallback row](/packages/core/src/session/message-updater.ts#L405-L434) | Live fallback omits metadata; add direct field. **Direct/settled**; existing running-row metadata retained. |
| `compaction.failed` | [Replace failed row, without ephemeral summary](/packages/core/src/session/message-updater.ts#L435-L449) | **Authoritative**, even if live failure status looks complete. |
| `execution.succeeded`, `execution.failed`, `execution.interrupted` | [Clear active retry; projector updates idle metadata](/packages/core/src/session/projector.ts#L402-L431) | **Authoritative** terminal recovery for incomplete histories/ephemeral residues; shutdown does not discard outstanding duty. |
| `revert.committed` | [Delete canonical suffix and affected pending inbox rows](/packages/core/src/session/projector.ts#L721-L755) | Existing immediate truncation uses public IDs, not Core sequence. **Authoritative** for final observed transcript; retain pending dirty fence. No new public cursor or reverse index. |

Non-durable text/reasoning/tool-input/compaction deltas and tool progress are live
only and remain outside durable version/repair classification. `usage.updated`,
permissions/forms, worktree resolution and catalogs do not mutate canonical
transcripts. Import/migration initialization is not arbitrary snapshot replay;
only the existing observed-Session read path is used.

### Derived test matrix / carry guard

1. Promote terminal-first/update-last and Skill-during-GET reproductions. Also
   activate Skill after a complete read, with no execution terminal.
2. Exhaustively type the classifier over generated `SessionEventDurable`; an
   upstream durable union addition must fail Client typecheck until categorized.
   No runtime Core/Protocol dependency or generic event registry is needed.
3. Exercise the newly authoritative groups in pending and complete observed
   caches, plus a foreign event with no read owner. Unknown delivered input,
   imported/forked rows and Location without hydrated metadata use canonical HTTP.
4. For direct handlers with demonstrated omitted fields, compare event-built row
   fields against the canonical fixture **without emitting content replacement or
   another terminal**: text state, Step snapshot files, compaction metadata.
5. Keep metadata/no-text instructions excluded and existing direct projection,
   pagination/outbox, creation and eviction/deletion tests green.

## Obligation and scheduling design

An issued GET is not reconciliation. Retain the existing `repair` flag until a
scan with the current mutation version successfully publishes canonical state,
or ownership is revoked. Keep two scans per caller job. After an unsuccessful
job with an outstanding duty, schedule one trailing timer per observed Session:
initial 10 ms, doubling after each unsuccessful job up to 1,000 ms. New events
coalesce without resetting or bypassing that timer. HTTP failure retains duty and
backs off too. Explicit user reads can preempt the timer; automatic event traffic
cannot. At most one repair job or one timer is owned per Session.

This small local timer is needed by the reproduced terminal-first/update-last
case: there may be **no subsequent event** to start another read. It is not a
service watcher, replay framework or provider restart. Quiescent successful reads
clear duty and reset backoff; continued activity/failures have bounded rate, not a
false lifetime request bound. Disconnect suspends timers but retains duty for
reconnect; creation still gates GETs. Evict/delete/dispose cancel timers and fence
late responses. Exact executed bounds and costs will be recorded with results.

## Implementation and verification record

Audit completed before classifier edits; the initial audit checkpoint is `322e7d52`.

### Obligation correction execution

- Promoted the terminal-first/update-last fixture into Client tests: it failed
  waiting for the fourth read; a flood fixture also showed the old event path
  bypassing backoff (five reads instead of three before the first delay).
- Persistent `repair` now clears only at unchanged-version publication. One
  `timer` and one `delay` on the existing entry replace immediate follow-up jobs;
  `refreshTranscript` prevents automatic refreshes from bypassing a scheduled job.
- The original job still stops after two scans. The admission repro takes
  **four GETs total**: initial, two superseded, one trailing canonical read. The
  pending admit-only input remains in the local overlay.
- A sustained real-inbox mutation fixture plus 50 terminal notifications verifies
  two scans per job and trailing gaps of at least 10/20/40 ms (2 ms assertion
  tolerance), then quiet-state reconciliation at the next 80 ms opportunity.
  It performs **ten GETs total** (initial + four two-scan jobs + final success).
- Evict/delete/dispose revoke scheduled work. HTTP-failure retention and slow-read
  joining, plus disconnect/reconnect suspension, are separately exercised.
- Commit `7f170abc`: Client browser transcript suite **38 pass** and typecheck
  passed. The earlier audit checkpoint remains `322e7d52`.

### Audit-derived classifier and direct projection correction

- The first matrix run had **12 failing cases**, including both Skill timings,
  population/delivery/selection/placement gaps, canonical revert ordering, omitted
  terminal fields, and running compaction metadata. Its other ten cases passed.
- `transcriptMutation` now accepts generated `SessionEventDurable` and ends with
  a `satisfies never` exhaustiveness check. All 43 durable members have explicit
  categories. The unrelated durable `worktree.resolved` event is excluded at the
  boundary; it does not change the canonical transcript.
- Added `repair` classification only for the audited authoritative cases; their
  already-complete observed caches now rehydrate. Existing direct settlement and
  ordinary update distinctions stay separate from metadata. No foreign event
  allocates an observation entry.
- Direct mirroring adds text provider state (including clearing it), Step-end
  snapshot files, and compaction metadata. Those cases do not incur a new HTTP
  read when already complete; a held stale snapshot is still superseded. Tests
  never fabricate a later content-replacement event to make completion correct.
- Canonical assertions use direct field equality, not the known failing Solid
  proxy `toMatchObject` assertion shape. Final mutation matrix **24 pass**;
  combined transcript/mutation suites **62 pass**, Client typecheck passed.
- Both preserved reviewer scratch suites independently pass: **5 pass, 0 fail**.
- Classifier/direct-projection commit: `a572c653`.

### Bounded ownership refinement

A held failing GET plus 100 terminal notifications exposed **101 retained error
observers** despite one HTTP request. The regression failed before correction.
Automatic refresh now returns when an entry already owns a pending job as well as
when it owns a timer. Events still set the persistent duty, but retain no additional
Promise callbacks. Explicit callers may join the returned job normally. This
closes the pending-work bound, not just the transport request-rate bound.
Commit `d06d098e`; the flood/slow-read/backoff tests and Client typecheck pass.

### Delivery category refinement after integration tests

The initial audit correctly identified **unknown** delivery payloads as requiring
canonical reads, but its unconditional delivery category also fetched known inputs
whose direct promotion was already complete. A regression proved the extra GET;
the existing TUI queued-promotion fixture exposed the same behavior. Delivery now
uses **direct/settled for a known non-outbox row**, and **authoritative for unknown
or still-optimistic input**. The classifier receives that single fact from the
existing message index/outbox; no delivery cache or registry was added. Overlapping
or already-incomplete direct promotion still establishes duty, and never clears
an outstanding one. This refinement supersedes the audit table's unconditional
delivery row. Mutation tests **25 pass** and Client typecheck passed.
Commit: `75210e5c`.

### TUI fixture fidelity

The focused integration suite initially found two footer failures and a known-input
promotion failure. The latter motivated the production direct-delivery refinement
above. The footer fixture emitted committed revert but still served the reverted
suffix from its canonical endpoint, so newly required authoritative reads correctly
rediscovered it. The fixture now removes that suffix before emitting the event.
Both existing retained-history/deleted-history footer oracles remain unchanged.
An intermediate fixture-only flag naming collision was corrected before the green
rerun. No TUI runtime or adoption seam changed. The full focused suite passes.

### Real HTTP/Core canonical check

The existing source-direct fixture was rerun with its private HTTP listener,
in-memory database, real Bus/Session projectors, generated controlled wrapper,
and native SSE cancellation. Baseline failure overlap still takes **3 page GETs +
2 boundary lookups**. A new optional `TRAILING_REPAIR=true` mode captures scan two,
performs actual `Session.prompt({ sessionID, resume: false, delivery: "queue", ... })`,
waits for the admit-only event, and releases the stale response. With no later
transcript/terminal event, it takes **4 page GETs + 3 boundary lookups** and reaches
the actual Core canonical failed assistant (empty text), retaining one pending
input separately. Both modes exit successfully.

The first trailing scratch attempt called the public Session service using the
lower-level handle's two-argument signature; that fixture error was corrected to
the existing object-shaped API. No Core change was necessary. Raw traces and
commands are in [review-fixes2](/.test-agent/bus-smart/review-fixes2/README.md), notably
[baseline](/.test-agent/bus-smart/review-fixes2/snapshot-http.log) and
[trailing canonical repair](/.test-agent/bus-smart/review-fixes2/trailing-http-final.log).

## Cross-references

- [Spec recheck](/.design/bus-smart/code-review2-spec.gpt6a.md): two new reproductions.
- [Standards recheck](/.design/bus-smart/code-review2-standards.gpt6a.md): creation
  and TUI adoption closed; classifier maintenance identified as a carry obligation.
- [First correction report](/.design/bus-smart/implementation-review-fixes1.gpt6a.md):
  retained history contract and prior verification. This round corrects its claim
  that a consumed per-scan flag preserves every terminal obligation.
