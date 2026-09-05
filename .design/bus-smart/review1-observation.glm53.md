---
type: DesignReview
title: draft1 observation semantics review — adoption, children, retention, notifications
description: Source-checked review of draft1.gpt6a.md's session-streaming profile against the TUI policy/consumer facts; concrete rollout blockers with smallest fixes, and which guarantees are achievable now versus pending.
resource: /design/bus-smart/review1-observation
tags: [events, tui, review, draft1, adoption, notifications, projection]
status: draft
generated: { by: "agent:glm-5.3#max", at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-12-05
sources:
  - id: draft1
    resource: /.design/bus-smart/draft1.gpt6a.md
    title: Bus-smart draft1 — scope streaming, preserve observation
  - id: interest-policy
    resource: /.design/bus-smart/research1-interest-policy.glm53.md
    title: TUI interest policy and attention consumers
  - id: session-event-schema
    resource: /packages/schema/src/session-event.ts
    title: Session event durability split
  - id: data-projection
    resource: /packages/client/src/solid/data.ts
    title: Solid projection handlers and message.sync
  - id: session-route
    resource: /packages/tui/src/routes/session/index.tsx
    title: Session route admission and hydration
  - id: controlled-feed-client
    resource: /packages/client/src/solid/controlled-event-feed.ts
    title: Controlled feed controller and fallback
  - id: message-updater
    resource: /packages/core/src/session/message-updater.ts
    title: Server durable message projection
---

# draft1 observation semantics review

> Subsequent correction: the [client implementation assessment](/.design/bus-smart/implementation-research1-client.gpt6a.md)
> retracts F4's unconditional convergence claim, locates actual visible/hidden
> transcript reads beyond F3's metadata gate, and corrects the retention bound.
> Read [implementation1](/.design/bus-smart/implementation1.gpt6a.md) for the
> reconciled plan. The original review below is preserved as research history.

## Verdict

[draft1](/.design/bus-smart/draft1.gpt6a.md) is implementable as scoped. The
five-event gate matches the schema's durability split exactly, the no-loss
notification default is coherent, and the adoption convergence criterion is
**satisfiable with existing mechanisms** once two small ordering fixes land.
Three concrete rollout blockers exist; each has a smallest fix inside draft1's
own commit list. The most consequential correction is expectation-setting, not
architecture: under the new profile, **foreign sessions still accumulate full
transcript rows and completed content in every client's store**, because the
events that build transcripts are durable and ungated — the profile removes
exactly the ephemeral delta stream and nothing else client-side.

## Findings

### F1 — The five-type classifier is exactly the streaming-ephemeral set (confirms §3)

The durability table at
[session-event.ts:370-596](/packages/schema/src/session-event.ts#L370-L596):
`Text.Delta` (382), `Reasoning.Delta` (421), `Tool.Input.Delta` (465),
`Tool.Progress` (498), `Compaction.Delta` (573) are ephemeral; every
started/ended/called/success/failed counterpart is durable.
`Usage.Updated` (147) is the only other ephemeral session event and is
correctly ungated. The allowlist is not arbitrary — it is "the ephemeral
events whose canonical value returns in a durable terminal event." Draft1's
schema test ("each gated event supplies Bus Session identity") is the right
pin. **Achievable now.**

### F2 — Foreign transcripts still build under the new profile (calibrates §2/§6)

Verified handler behavior for ungated durable events on a foreign session:

- `session.step.started` (durable) appends a real assistant row via
  `message.update`'s `draft[sessionID] ??= []` + append
  ([data.ts:818-850](/packages/client/src/solid/data.ts#L818-L850));
- `session.compaction.started` inserts a row (991-1003);
  `session.inbox.*` materialize user/synthetic transcript rows (721-760);
- `session.message.content.updated` (durable, ungated) writes the **full
  completed content array** into those rows wherever message state exists
  ([data.ts:808-817](/packages/client/src/solid/data.ts#L808-L817) — note it
  already has an array-presence guard);
- `step.streamed/ended` then write into the rows `step.started` created.

Consequences, as calibration for the performance gate and commit 4:

1. The projection saving is exactly the delta fraction. Row creation,
   completed-content writes, and retention churn (limit 3,
   [session-tabs.tsx:142-148](/packages/tui/src/context/session-tabs.tsx#L142-L148))
   continue per foreign session. Draft1's `B` term already says this; make it
   concrete in the acceptance copy: `B` includes a full durable transcript
   for every server session in every client.
2. The proposed `editAssistant` missing-target guard (§6, commit 4) does
   **not** touch the steady-state foreign cost: the targets exist, created by
   ungated durable events. Its real coverage is retention-evicted rows,
   pre-attach stragglers, and snapshot races — worth shipping as hygiene, but
   commit 4's measured payoff should be characterized as transient/race
   savings, not the foreign flood. The steady-state remainder is exactly the
   deferred transcript-interest guard's territory. Smallest clarification:
   one paragraph in §6; no code change beyond what draft1 already lists.

**Achievable now** (clarification); the durable-write remainder is **pending**
the measured guard decision.

### F3 — Adoption lacks a flush gate today (blocker; one-line-class fix)

The session route's admission effect hydrates immediately on connect with no
interest barrier
([session/index.tsx:332-341](/packages/tui/src/routes/session/index.tsx#L332-L341)):
`data.session.sync(sessionID, { children: true })` (and permission/form syncs)
race the reactive `eventInterest` update → PUT → install. Under the gated
profile this creates a **guaranteed** missing-fragment window: fragments
published between snapshot-read and interest-install are neither in the
snapshot nor delivered. The prompt-create path already solved this pattern
with `interest.flush()` before first execution; adoption needs the same:
await `client.interest.flush()` before the `data.session.sync` call in that
effect. Effect-ordering note: `EventInterestProvider`'s effect is created
before the route's (outer provider), so synchronous `setDesired` has run when
the route effect observes the new route — but pin it with a test rather than
relying on creation order. **Achievable now**; belongs in commit 7's
adoption/flush coverage (draft1 §8 already lists "adoption/flush coverage" —
this names the seam).

### F4 — Convergence criterion is satisfiable; the missing analysis was durability (resolves §6's conditional block)

Draft1 blocks rollout unless "current snapshots plus terminal handling" meet
canonical completed-state convergence. The schema settles it:

- The server read model folds **durable** events only
  ([message-updater.ts:20](/packages/core/src/session/message-updater.ts#L20));
  deltas are ephemeral, so `message.list` never contains partial streamed
  text — an in-progress part's row is present (durable `*.started`) with its
  canonical-so-far content only.
- Client `message.sync` replaces rows via `reconcile`, preserving only local
  outbox/admitted rows
  ([data.ts:1549-1568](/packages/client/src/solid/data.ts#L1549-L1568)). A
  pre-snapshot local skeleton row is clobbered by an equivalent canonical
  row — no duplication, since assistant rows are never treated as local-only.
- Post-follow deltas append onto the snapshot row's part (created by durable
  `text.started`, already in the fetched row); mid-part display may jump, and
  the durable terminal event (`text.ended` assigns full text, `step.failed`/
  `tool.failed`/`compaction.failed` set terminal state) converges the
  completed transcript. Clobbered in-window deltas are recovered by the same
  full-value terminal events.

So: adoption = flush → snapshot → live yields **correct completed state
always** and possibly-jumpy live display mid-part — exactly draft1's stated
contract. Required fixtures (all achievable now): open-mid-part adoption,
aborted-part failure (no `*.ended`, `step.failed` path), reconnect during
in-flight snapshot, compaction failure. If any fixture shows a completed
transcript diverging from the durable read model, that is the specific seam
to repair, per draft1.

### F5 — The branch's default violates draft1's own notification default (blocker; ship the experiment gate first)

Draft1's default is server-wide observation (no loss). But the current tree
wires the controlled Location profile **unconditionally**
([client.tsx:24-41](/packages/tui/src/context/client.tsx#L24-L41),
`subscribe: interest.subscribe`), which suppresses cross-project
notifications today — the unapproved behavior draft1 §8 says not to mistake
for the default. Smallest fix: gate that wiring behind a `config.experimental`
key registered in the TUI experiments registry (`dialog-experiments.tsx`, per
package AGENTS), defaulting to `api.event.subscribe`; mode remains observable
([devtools-bar.tsx:304-306](/packages/tui/src/component/devtools-bar.tsx#L304-L306)).
Make this commit 0, before any protocol/server work, so the branch stops
carrying an unapproved default while draft1 is built. **Achievable now.**

### F6 — Profile-missing fallback needs a distinct trigger (small, in commit 5/7 scope)

`subscribe()` currently falls back only on pre-ready 404
([controlled-event-feed.ts:161-174](/packages/client/src/solid/controlled-event-feed.ts#L161-L174)).
"Aware ready without the required profile" is a second, post-first-frame
condition that must route into the same cleanup-and-join-SharedEvents path
with its own reason (mode/state distinction, one log line), without treating
it as a determinate PUT rejection. **Achievable now** alongside negotiation.

### F7 — `flush()` contract notes (clarification)

`flush()` resolves on install acknowledgment and is a legacy-mode no-op
([controlled-event-feed.ts:267-272](/packages/client/src/solid/controlled-event-feed.ts#L267-L272))
— correct for adoption (broad delivery needs no gate) and for the prompt gate.
Draft1's "not a queue-drained acknowledgment" wording already covers this;
add "resolves immediately when desired equals installed" so adoption tests
don't await phantom PUTs. **Clarification only.**

## Semantics scorecard

| Area | draft1 position | Verdict |
| --- | --- | --- |
| Adoption | flush → authoritative reads → live; no replay claim | Sound; F3 names the missing gate, F4 proves convergence |
| Midstream-open | post-follow fragments until canonical terminal value | Sound; jumpiness is display-only (F4); fixtures required |
| New child | live interest, not recursion; window before family resolution + PUT | Sound; ungated durable events already build the child's skeleton rows, so discovery and badges work through the window; child streaming starts at next PUT |
| Retention | do not couple fidelity to the LRU | Sound; note retention keeps churning foreign rows under the new profile (F2) — expected, not a leak |
| Notifications | server-wide non-streaming default; no loss assumed | Coherent and the safer direction; the branch default contradicts it today (F5). My earlier "Location safe default" recommendation is fairly superseded — draft1's no-loss default plus the experiments-registry path preserves user choice without shipping unapproved loss |
| Location profile | retained as named compatibility mode | Sound; reconnect derived-hold gap for permission/forms stays documented (draft1 §7) |

## Achievable now vs pending

**Now:** F1 classifier + schema tests; F3 flush gate; F4 fixtures; F5
experiment gate restoring legacy default; F6 fallback trigger; F7 wording;
the deterministic reduction gate (zero five-type arrivals for unfollowed
sessions) is fully testable with existing seams.

**Pending (deliberately):** steady-state foreign durable-write reduction
(transcript-interest guard, needs the explicit-read/retention vs
discovery-metadata distinction draft1 §6 requires); aggregate CPU evidence
(includes quantifying how much of `B` is `message.content.updated` full-content
writes); Location reverse indexes; attention narrowing beyond the experiment;
any replay/watermark machinery.

## Not blockers (owned elsewhere)

SharedEvents composition and connection fencing (client-ownership research),
the move matrix and `publishAll` retention (move-guarantees research), server
indexing mechanics (filtering-cost research). One cross-note: draft1 §5's
"join shared legacy" fallback inherits the in-process firehose; under the
experiment-gated default this is identical to legacy behavior, so no new
surface — but keep the "zero hidden legacy GET in controlled operation"
assertion in commit 1.

## Cross-references

- [draft1](/.design/bus-smart/draft1.gpt6a.md) — reviewed; F2 calibrates §2/§6,
  F3/F4 resolve §6's conditional block, F5 enforces §8's default.
- [Interest policy research](/.design/bus-smart/research1-interest-policy.glm53.md) —
  consumer inventory underlying the scorecard; its R2 (explicit attention
  predicate behind an experiment) survives unchanged inside draft1's
  experiment framing, its "Location safe default" is superseded as above.
- [review0](/.design/bus-smart/review0.gpt56s.md) — its projection-guard
  recommendation splits cleanly: missing-target guard now (commit 4, narrow),
  transcript-interest guard pending measurement (F2).
