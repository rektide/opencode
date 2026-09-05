---
type: DesignReview
title: bus-smart draft1 contract review
description: Server/core routing review of the negotiated session-streaming profile — correctness of the five-type gate and capability negotiation, index and CPU claims, minimality, and the broad non-streaming tradeoff, with concessions on the corrected filtering-cost claims.
resource: /.design/bus-smart/review1-contract
tags: [server, core, events, bus, performance, review]
status: draft
generated: { by: "agent:glm-5.3-max", at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-12-05
sources:
  - id: reviewed-design
    resource: /.design/bus-smart/draft1.gpt6a.md
    title: Bus-smart draft1 — scope streaming, preserve observation
  - id: filtering-cost
    resource: /.design/bus-smart/research1-filtering-cost.glm53.md
    title: GX filtering-cost and routing-performance analysis
  - id: controlled-feed
    resource: /packages/server/src/controlled-event-feed.ts
    title: ControlledEventFeed implementation
  - id: rpc
    resource: /packages/core/src/rpc.ts
    title: RPC event emission
---

# bus-smart draft1 contract review

## Verdict

The negotiated-profile design is sound and near-minimal for a reversible opt-in:
one optional enum, a ready capability list, a five-type classifier checked
before the ordinary arms, an exact-Session index for exactly those types, and
everything else unchanged. The classifier ordering (gated types can never be
rescued by a Location or global arm) is the right shape, the capability
negotiation closes the real old-server hazard, and the delivery model
`C × (F·D + B)` is honest arithmetic kept separate from CPU claims. Two
acceptance/spec gaps should be fixed before implementation; everything else
below is non-blocking refinement.

## Blocking findings

### B1. The deterministic zero-arrival gate has no defined measurement window

"Zero five-type arrivals for unfollowed Sessions after installation/grace"
needs a test-operational definition of *after*, or it will false-fail on
legitimate drain tails and tempt an implementer to "fix" it by flushing
queues. Specify: the measurement interval opens at
`max(activation PUT acknowledgement, removal-grace expiry)` and closes at
test end; queued frames admitted under an older target that drain inside the
interval count as the documented bounded overdelivery
([draft1 §4](/.design/bus-smart/draft1.gpt6a.md)), not as violations. The
1/32 ratio check should use the same steady interval. Without this, the
strongest acceptance criterion in the design is ambiguous at exactly the
boundary it exists to police.

### B2. The broad arm's rate safety must be a measured gate, and `rpc.*` is the unbounded member

`session-streaming` admits every public non-gated event machine-wide. Most of
`B` is schema-owned and rate-bounded per step (verified:
`session.step.streamed` is published once per provider body — durable,
[step.ts:139](/packages/core/src/session/runner/step.ts#L139),
[session-event.ts:322-329](/packages/schema/src/session-event.ts#L322-L329)
— so the five-type list is not missing a hidden per-chunk family). But
`rpc.*` events are public per
[`isOpenCodeEvent`](/packages/protocol/src/groups/event.ts#L133-L134),
plugin-defined with no schema-bound rate, and carry an explicit envelope
Location today ([rpc.ts:99-106](/packages/core/src/rpc.ts#L99-L106)) — meaning
the new profile makes them *broader than the draft0 location profile*, not
just broader than nothing. A chatty RPC emitter would silently negate the
profile's win and regress versus this branch's existing mode.

Require the characterization commit (sequence item 3) to report per-family
`B` counts **and bytes**, explicitly including `rpc.*`, as a graduation gate
for the TUI experiment — not merely as metrics in the final matrix. This is a
gate-on-measurement, not a design change; the design itself needs no new
mechanism for it.

## Non-blocking findings

### N1. Corrections to my filtering-cost research — conceded, with one addition

- **RPC:** I wrongly grouped `rpc.*` with internal-only events;
  `isOpenCodeEvent` admits them
  ([protocol/groups/event.ts:133-134](/packages/protocol/src/groups/event.ts#L133-L134)).
  Conceded. Addition: rpc events are envelope-Location-routed at publication
  ([rpc.ts:99-106](/packages/core/src/rpc.ts#L99-L106)), which makes B2's
  broadening consequence concrete rather than hypothetical.
- **"Superlinear" → linear:** correct; per-event admission is linear in `N`
  with a constant inflated by redundant key stringification. The fixable
  claims (hoist keys; index the gated path) survive unchanged.
- **Constant-time all-recipient → O(M) floor:** correct; my AC3's
  "µs/event within a small constant of C=1" was wrong for all-match
  workloads. Restated gate: admission overhead per *non-matching* subscriber
  goes to ~0 after indexing; delivery cost is `c0 + c1·M` by necessity;
  sparse-interest (disjoint follows) workloads measure the overhead, all-match
  workloads measure the floor. Draft1's formulation is the right one.
- **90% CPU → deterministic 1/32 ratio:** endorsed. My AC4 carried an
  estimate caveat, but a CPU-percentage acceptance criterion invites
  evidence-free claims; the arrival-ratio gate plus a separate CPU decision
  gate is the better instrument. My §4 leverage conclusion (same-Location gap)
  is what draft1 builds on and stands.

### N2. Prefer a zero-recipient pre-check before adopting in-permit lazy encode

Draft1's conditional option — synchronous lazy encode inside the non-yielding
admission section — buys strictness (no activation/skip race at all) at the
cost of serializing every large-payload stringify behind the admission
semaphore, directly lowering the per-event ceiling draft1 elsewhere worries
about (PUT latency under large payloads). The existing implementation already
skips encoding when `activeCount === 0` outside the permit
([controlled-event-feed.ts:129](/packages/server/src/controlled-event-feed.ts#L129)),
accepting a benign activation race. Generalizing that same shape — peek the
potentially-interested population (index size for gated types; active counts
per profile otherwise) and skip encode at zero — preserves draft0's
encode-outside-permit rule and the existing race semantics while capturing
most of the saving (foreign-session gated events are exactly the zero-recipient
case). Record the pre-check-vs-in-permit decision before the server admission
commit; either choice is correct, but they have different failure modes and
the draft currently names only one.

### N3. Fallback-to-legacy on missing capability regresses CPU versus draft0 servers

When ready lacks `session-streaming`, the client joins shared legacy — the
global firehose. On a draft0-era server this is *worse* CPU than the location
mode the branch already ships. The choice is defensible (refuses an
unintended Location profile; notification safety) and right for the
experiment phase, but the rollout note should say plainly: new client +
old controlled server = no filtering at all. A future
"advertised-but-location" middle path can reclaim it without reopening the
product decision.

### N4. Streaming profile leaves dead state and dead wire data

`locations` in the interest body is unused under `session-streaming`
(acceptable for shape stability; keep normalize bounds applied — they are,
same code path). Derived-Location bookkeeping
([controlled-event-feed.ts:148-153](/packages/server/src/controlled-event-feed.ts#L148-L153))
is inert in the streaming profile since neither the gated arm nor the broad
arm consults it; draft1 correctly declines to allocate new holds, and the
implementation notes should also say the *existing* bookkeeping is
location-profile-only so nobody "cleans it up" into a behavior change.

### N5. Queue pressure rises versus the location profile

The streaming profile admits machine-wide `B` into every subscriber queue;
on multi-Location machines the overflow threshold is lower than draft0's
location mode (which filtered foreign-Location `B`). Overflow failing one
subscriber is unchanged and explicit, but the deliberate slow-reader stress
case must run *in streaming mode*, and overflow counts belong in the
graduation report, not just the matrix.

### N6. Make the D/B split and hydration counts first-class outputs

The profile's ceiling is `D`'s share of total event *and byte* volume; the
most likely residual hotspot after the gate ships is foreign
`session.created` → unconditional client HTTP sync
([data.ts:605-623](/packages/client/src/solid/data.ts#L605-L623)), which
subagent-heavy workloads trigger at machine scale. Draft1 already lists
"HTTP hydration counts" among metrics and defers metadata suppression with
reasons — endorse both, and elevate the D/B event-and-byte share to a
reported headline so "the gate worked but the pain moved" is visible at a
glance.

### N7. Negotiation details

- Ready capability list absent versus empty should be specified as
  equivalent ("only the location contract is known") so decoders cannot
  distinguish a pre-feature server from an advertising one that supports
  nothing new.
- The old-server PUT hazard draft1 defends against is real:
  interest bodies decode through
  [`handlers/event.ts:57-90`](/packages/server/src/handlers/event.ts#L57-L90),
  and lenient decoding of an unknown `profile` field would silently apply the
  location predicate. Gating the field on the ready list is the correct and
  necessary defense; keep the "never interpret 204 as capability evidence"
  rule verbatim in tests.

### N8. Minimality and capability assessment — positive

- Smaller alternatives (silently switching the predicate, or keying off
  `store.session.info`) are correctly rejected: the first breaks
  older-server safety, the second conflates metadata presence with transcript
  interest (dual-audience moves and stale metadata make it unsound).
- Larger ones (type-filter language, summary projections, proxy) are
  correctly deferred; the proxy rejection matches my own — it moves CPU
  without removing it and presumes clustering that does not exist.
- Draft1's derived-key **count** refinement (removing one Session's hold must
  not erase another's coverage) fixes a real aliasing bug my research1's
  "derived key Set" suggestion would have had with two Sessions deriving to
  one Location. Good catch; adopt it as stated.
- The five-type list itself checks out against the schema: all five are
  ephemeral `SessionEvent.All` members whose `Base` guarantees `sessionID`,
  so the Bus-classified identity requirement is satisfiable as specified, and
  unknown future public types fail *safe* (broad overdelivery, never
  suppression).

## Verification pointers

Beyond draft1's own matrix, the two blocking items translate to: (1) an
acceptance-test definition fixing the steady interval for the zero-arrival and
1/32 checks; (2) a per-family rate/byte table including `rpc.*` attached to
the characterization commit and referenced by the graduation decision. Both
are documentation/test obligations, not architecture changes.

## Cross-references

- [draft1](/.design/bus-smart/draft1.gpt6a.md) — the reviewed proposal; §3
  (profile and classifier), §4 (hot path), §8 (gates) carry the items above.
- [My filtering-cost research](/.design/bus-smart/research1-filtering-cost.glm53.md)
  — source of the conceded claims; its §4 leverage analysis and §6 staging
  remain the supporting evidence for this direction.
- [draft0](/.design/bus-smart/draft0.gpt56s.md) — baseline for the
  encode-outside-permit rule N2 defends and the replacement/activation
  contracts draft1 retains.
