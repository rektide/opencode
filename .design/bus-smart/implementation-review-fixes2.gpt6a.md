---
type: ImplementationReport
title: Bus-smart repair obligations and canonical mutation audit
description: Second recheck corrections, complete Core-to-Client event audit, scheduling invariants, and verification.
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

# Second independent-recheck corrections

## Baseline and scope

Clean baseline `42ae8a07`, after standards recheck `f50acee2`. Both reviews and the
new isolated reproductions were read in full. Independently running review2's
scratch suite reproduced **two failures**: absent Skill row and retained ephemeral
text after terminal-first/update-last hydration. The review already minimized and
identified these causes; no speculative diagnosis or instrumentation is needed.

No children or live elected service. Keep Core, Protocol, Server, SharedEvents,
TUI adoption and the default-off gate unchanged. Changes stay in the existing
Client read owner and direct event handlers, with package regressions. Earlier
reviews/reports remain historical; parent owns the next independent recheck.

## Pre-edit canonical mutation audit

This audit was written **before changing the classifier**. Sources below refer to
the baseline. `SessionMessageUpdater.update` exhaustively handles the 43 durable
Session event types; the projector also performs inbox delivery, fork and revert
mutations outside that updater. Import writes rows alongside `session.created`.

- [Updater](/packages/core/src/session/message-updater.ts#L63-L453): every durable
  branch, including terminal snapshot fields at [22–28](/packages/core/src/session/message-updater.ts#L22-L28).
- [Projector](/packages/core/src/session/projector.ts#L433-L756): actual registered
  handlers; [fork](/packages/core/src/session/projector.ts#L106-L225),
  [delivery](/packages/core/src/session/projector.ts#L591-L621), and
  [revert](/packages/core/src/session/projector.ts#L721-L755) bypass the updater.
- [Import](/packages/core/src/session/transfer.ts#L89-L125): inserts messages in
  the Created publication transaction, not as later message-content events.
- [Client handlers](/packages/client/src/solid/data.ts#L580-L1121): current live
  projections. [Session.skill](/packages/core/src/session/session.ts#L232-L253)
  allows `resume: false`; [message-content replacement](/packages/core/src/session/session.ts#L76)
  is an explicit operation, **not** an automatic event at every completion.

### Categories and complete event table

**None** means no canonical message mutation (pending/metadata can still change).
**Direct** means update already-loaded live state and fence overlapping GETs; a
superseded read cannot overwrite that update. **Repair** means an explicitly
observed cache needs an authoritative read even if previously complete. Foreign
events never create an observation owner. A direct settlement received during an
incomplete read also establishes an outstanding repair obligation. A deletion
instead revokes ownership and cancels scheduled work.

All names below have the `session.` prefix. `U` denotes updater line references;
`P` projector; `C` Client baseline handlers. Grouping is exhaustive, not a wildcard
that marks every durable event dirty.

| Event(s) | Canonical effect and current Client evidence | Needed category / decision |
| --- | --- | --- |
| `created` | U66 no row; import transaction can insert rows; C626 discovery only | Repair **only for an already observed ID**, gated by local creation; no foreign enrollment |
| `forked` | U120 no-op but P106–225 copies settled rows into the new aggregate; no C row handler | Repair for an already observed fork target, never the parent |
| `deleted` | P541 deletes aggregate/cascades; C634 removes cache | Lifecycle revocation, not a GET |
| `viewed`, `renamed`, `usage.recorded` | U67/74/118 no-op; P566–589 metadata only | None |
| `revert.staged`, `revert.cleared` | U450–451 no-op; P699–719 only view boundary | None; UI still responds to its metadata |
| `execution.started` | U125 no-op; C1003 busy status | None |
| `inbox.delivery.changed` | U124 no-op; P646 pending mode only; C755 updates pending | None for transcript; pending-read fence remains |
| `inbox.enqueued`, `inbox.cancelled` | P623–645 pending only; C758–778 admits/retracts local transcript overlays | Direct overlay fence, no new canonical-repair duty alone |
| `inbox.delivered` | P591–621 inserts canonical user/synthetic row; C739 can only reorder an already known admission | Repair; delivery can be last activity and the admission may not be cached |
| `agent.selected` | U75–88 appends previous-agent/metadata; C644 guesses previous, omits metadata | Repair rather than trust a metadata-dependent guess |
| `model.selected` | U89–102 appends previous-model/metadata; C657 does a canonical point lookup | Direct settlement plus existing point lookup; overlap still needs transcript repair |
| `moved` | U103–117 appends previous placement/metadata; C692 requires cached Session info | Repair; missing metadata must not suppress a canonical row |
| `instructions.updated` | U129–141 and C779–792 append System only if `data.text` exists | Direct settlement when text exists; None otherwise |
| `synthetic` | U142–153 and C793–802 append the event-derived row | Direct settlement |
| `skill.activated` | U154–166 appends Skill; no C handler/classification | Repair, including idle `resume: false` activation |
| `shell.started` | U167–180 / C803–815 append shell including background metadata | Direct mutation |
| `shell.ended` | U181–194 / C816–825 update loaded shell output/status | Direct settlement |
| `step.started`, `step.streamed` | U195–241 / C833–871 append/reset assistant and streamed time | Direct mutation |
| `step.ended` | U242–252 + U22–28 set terminal fields including snapshot files; C872 omits files | Direct settlement **after mirroring the missing snapshot fields** |
| `step.failed` | U253–267 completes error but no durable ephemeral suffix; C884 retains live fragments | Repair regardless of prior completeness |
| `text.started` | U268–272 / C898–902 append empty part | Direct mutation |
| `text.ended` | U273–281 sets text **and provider state**; C908 omits state | Direct settlement **after mirroring provider state** |
| `reasoning.started`, `reasoning.ended` | U359–382 / C976–997 mirror text/state/times | Direct mutation / settlement respectively |
| `tool.input.started`, `tool.called` | U282–296,303–319 / C913–923,934–941 update loaded tool | Direct mutation |
| `tool.input.ended`, `tool.success`, `tool.failed` | U297–302,320–358 / C929–933,947–975 self-contained loaded-tool terminal projection | Direct settlement; no progress-history inference |
| `retry.scheduled` | U383–391 / C998–1002 sets retry state | Direct mutation |
| `execution.succeeded`, `execution.failed`, `execution.interrupted` | U126–128 clear retry; C1019–1032 likewise, but cannot remove uncommitted fragments | Repair, including shutdown interruption |
| `compaction.started` | U392–404 appends running row and P consumes control; C1006 omits event metadata | Direct mutation **after mirroring metadata**; pending fence remains |
| `compaction.ended` | U405–434 completes or appends row; C1069 omits metadata on append | Direct settlement **after mirroring append metadata** |
| `compaction.failed` | U435–449 canonical failure replaces partial running summary; C1097 mirrors failure | Repair, including absent input/partial-summary recovery |
| `revert.committed` | P721–755 deletes by private sequence plus pending suffix; C1046 truncates local IDs | Repair for authoritative history; retain direct immediate view update and pending fence |

Non-durable text/reasoning/tool-input/compaction deltas and tool progress mutate
only live projections, not the canonical transcript; they neither fence snapshots
nor create repair duties. UsageUpdated, Worktree.Resolved, permission/form, RPC and
Location/catalog events do not change canonical messages. Reconnect is a separate
explicit invalidation, not an invented durable event. Retention/import database
operations are not exposed as a generic replay feed.

### Audit-derived regression matrix

1. Compile-time exhaustiveness against generated `SessionEventDurable`: a newly
   added durable event must be categorized instead of silently falling through.
2. Repair-only rows: pending GET and already-complete observed cache, no later
   terminal; Skill is the reproduced mandatory case. Cover uncached admission
   delivery and lifecycle population (import/fork) without enrolling foreign IDs.
3. Direct handler omissions: assert actual provider state, snapshot files and
   compaction metadata, not merely visible text; pair with a held stale GET.
4. Metadata controls: viewed/renamed/usage and textless instruction changes do
   not trigger transcript reads or invalidate a held canonical response.
5. Obligation: terminal in scan one, ordinary admission in scan two, no later
   event; sustained started/enqueued/settlement mutations; failed HTTP; explicit
   eviction/delete/disposal and reconnect suspension. Original sync settles after
   its budget even while trailing repair remains due.

## Obligation and scheduling design

Keep the existing boolean duty and version fence: a GET **attempt** never clears
the duty. Only a successful authoritative reconciliation at its unchanged captured
version fulfills it. Mutations during an attempt supersede the result, not the
duty. No durable replay/epoch framework or separate service is needed.

Keep at most two scans per original job and one active job per observed Session.
An unsatisfied duty after completion/error gets one trailing timer, initially
10 ms, doubling to a 1,000 ms cap. New events coalesce without resetting/backdating
the timer or bypassing it. Slow requests have no timer racing them. A successful
reconciliation resets the delay. Explicit user reads may pull scheduled work
forward; event-driven refreshes cannot. Disconnect suspends timers but retains
duties; reconnect/creation-gate release can resume them. Evict/delete/dispose cancel
timers and revoke old request identity. This is positive-delay backoff, not an
immediate recursive chain of two-scan jobs or a debounce that never fires while
events keep arriving.

Implementation, exact executed bounds/costs, and finding-to-commit mapping follow
in subsequent sections as corrections are verified.

## Cross-references

- [Spec recheck](/.design/bus-smart/code-review2-spec.gpt6a.md): the two reproduced
  blockers and original canonical-state oracles.
- [Standards recheck](/.design/bus-smart/code-review2-standards.gpt6a.md): closed
  creation/adoption findings and the classifier's upstream maintenance obligation.
- [Previous correction report](/.design/bus-smart/implementation-review-fixes1.gpt6a.md):
  history-boundary behavior and old scheduling claims; this report supersedes
  attempt-start consumption of repair obligations, not its measured history costs.
