---
type: Research
title: Server/Core/Protocol implementation research for draft1
description: Concrete lean code shape for the session-streaming profile — admission dispatch, precheck linearization derived rigorously, index lifecycle invariants, protocol surface, staged cost/benefit, test seams, and commit order.
resource: /.design/bus-smart/implementation-research1-server
tags: [server, protocol, core, events, implementation, performance]
status: draft
generated: { by: "agent:glm-5.3-max", at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-12-05
sources:
  - id: design
    resource: /.design/bus-smart/draft1.gpt6a.md
    title: Bus-smart draft1
  - id: contract-review
    resource: /.design/bus-smart/review1-contract.glm53.md
    title: draft1 contract review (this author)
  - id: observation-review
    resource: /.design/bus-smart/review1-observation.glm53.md
    title: draft1 observation semantics review
  - id: filtering-cost
    resource: /.design/bus-smart/research1-filtering-cost.glm53.md
    title: filtering-cost analysis (this author)
  - id: controlled-feed
    resource: /packages/server/src/controlled-event-feed.ts
    title: current implementation
  - id: protocol-event
    resource: /packages/protocol/src/groups/event.ts
    title: event group contract
---

# Server/Core/Protocol implementation research for draft1

## Scope

Implementation shape for [draft1](/.design/bus-smart/draft1.gpt6a.md) §3-4 as
constrained by my [contract review](/.design/bus-smart/review1-contract.glm53.md)
(B1/B2) and the [observation review](/.design/bus-smart/review1-observation.glm53.md)
(F1-F7, none of which change server shape). No production edits here; this is
the blueprint for commits. Core needs **zero changes** — `observeRouted`,
guard-gated `sessionID` ([bus.ts:230-240](/packages/core/src/bus.ts#L230-L240)),
and the move `publishAll` fix already exist; that is a minimality win worth
keeping explicit.

## Shape verdict

Keep the single 296-line `controlled-event-feed.ts` and its two-operation
`Interface`. Everything new fits inside `make()` plus a Protocol field and a
classifier constant; no file splits, no new services, no Bus surface.

| Unit | Keep | Add | Delete/replace |
| --- | --- | --- | --- |
| `Subscriber` | id, queue, active, requested | `profile: "location" \| "session-streaming"` | — |
| `InterestSet` | sessions Set, locations Map (key-addressed already, [L256](/packages/server/src/controlled-event-feed.ts#L256)) | profile discriminator | — |
| `derivedLocations` | per location-profile subscribers | `derivedKeyCounts: Map<string, number>` | `covers()`'s per-call stringify scan |
| admission | semaphore + non-yielding `critical()` | gated/broad dispatch, session index | `matches()` as sole entry |
| `publish()` | internal-event guard, encode-try, overflow logging | gated precheck | — |
| `subscribe`/`replaceInterests` | flow, bounds, activation cut | profile normalization, index diff | — |
| handlers/event.ts | readInterest, NoContent, response() | nothing (profile rides the body) | — |
| Protocol | EventInterest, EventFeedReady, endpoints | optional `profile`, optional ready `profiles`, `StreamingEventTypes` | — |
| Bus (Core) | everything | nothing | nothing |

## Linearization of the precheck (deriving, not asserting)

My review N2 called the zero-recipient precheck "the same race class" as the
existing `activeCount === 0` fast path
([L129](/packages/server/src/controlled-event-feed.ts#L129)). That is true
only under two conditions; derive them.

**Model.** All shared state (`activeCount`, subscriber records, index) is
plain JS mutated only inside synchronous extents: each `critical()` body, the
activation section, and the prologue of `publish()` before its first yield.
On a single-threaded loop, synchronous extents are totally ordered; a publish
linearizes at (A) if it early-returns at its fast-path read, else at its
admission section (C). Activation/replacement linearizes at its critical
section (CA). The 204 is sent strictly after CA; a client-acknowledged PUT
therefore precedes any publish the client's subsequent actions cause.

**Existing fast path.** (A) reads `activeCount === 0` in one synchronous
extent and returns. If CA activates between (A) and a would-be (C), the
publish linearized at (A) — before the cut — so "publisher before the cut
sees no subscriber" holds. Sound because zero active subscribers means *no
possible recipient under any arm*.

**Gated precheck (P).** For one of the five types, (P) must decide "no active
subscriber could match this event under any arm" and return, linearizing at
(P). Arms for a gated event: streaming-profile session followers of the
audience `sessionID`; location-profile subscribers (their location arm —
including derived holds — and their own exact-session arm). Therefore:

- **Condition 1 (complete arms).** (P) may skip only when
  `sessionIndex.get(id)` is empty **and** `locationProfileCount === 0`.
  Checking only the index is a real suppression bug: a location-profile
  subscriber already active and matching before the publish started would be
  skipped while (C) would have admitted it — no valid linearization exists
  for that outcome. This is the sharp edge my review glossed.
- **Condition 2 (single extent).** Both reads and the return decision happen
  in one synchronous extent (no logging, no yield between). State this as a
  code invariant with a comment; do not rely on Effect scheduling internals.

With both conditions, (P) is exactly the (A) construction relativized to one
event's recipient set: concurrent CA that installs a matching subscriber
after (P) makes the publish "before the cut," which is legal; a publish
*started after* an acknowledged PUT always observes post-CA state at (P) and
never skips. The TUI's flush-gated causal chains (prompt creation, and the
adoption fix in observation-review F3) rely precisely on that
ack-precedes-publish ordering.

**Contrast with in-permit lazy encode** (draft1's alternative): encode inside
(C) after selection has no race at all, but serializes every large-payload
`JSON.stringify` behind the admission permit, lowering the per-event ceiling
and PUT latency headroom. **Decision: precheck first** (it degenerates to
today's (A) for broad events: any active streaming subscriber matches
broadly, so (P) reduces to `activeCount === 0`); keep lazy encode in reserve
for the residual waste class — events that pass (P), encode, then admit
nobody because interests churned between (P) and (C). That class is bounded
by PUT rate, not event rate.

## Admission dispatch

One switch on `gated = StreamingEventTypes.has(event.type)`, then inside
`critical()`:

- **gated**: iterate `sessionIndex.get(sessionID) ?? []` offering to each
  (streaming followers); if `locationProfileCount > 0`, additionally scan
  `subscribers` for location-profile subscribers and run the existing
  location matcher (with session arm). In the experiment steady state
  (`locationProfileCount === 0`) the gated path never scans the registry —
  cost is O(followers of that session).
- **not gated**: scan `subscribers` once; streaming-profile subscribers are
  offered unconditionally (broad), location-profile subscribers run the
  location matcher. O(N) with N real recipients — the floor draft1 admits.

Move/delete derived bookkeeping
([L148-153](/packages/server/src/controlled-event-feed.ts#L148-L153)) runs
**only for location-profile subscribers**: under streaming profile no arm
consults derived holds (gated arm is session-only; broad arm is unconditional),
so the existing lines gain a profile predicate — and nothing else. Document
that the existing bookkeeping is location-profile-only so nobody later
"cleans it up" into a behavior change (review N4).

## Session index lifecycle invariants

`sessionIndex: Map<SessionID, Set<Subscriber>>`, mutated only inside
`critical()`:

- **I1 (membership):** `s ∈ index[x] ⟺ s.active ∧ s.profile = streaming ∧ x ∈ s.requested.sessions`, holding between critical sections.
- **I2 (atomic pairing):** every section that changes either side (activation, replacement diff, profile switch, removal) updates the index in the same section. Replacement diffs old/new session sets — O(|old|+|new|) at PUT rate, no scan.
- **I3 (removal totality):** `remove(s)` (unsubscribe, overflow, `fail()`) deletes every index membership. Overflow fires *during* gated iteration over `index[x]`; deleting the current element during Set iteration is well-defined JS — pin it with a test, since `offer()` → overflow → `remove()` is the one mutation reachable mid-iteration.
- **Oracle:** a test-only `deriveIndex(subscribers)` asserts I1 after every operation kind (activation, replacement, profile switch, overflow, unsubscribe, fail). This is draft1's "independent expected routing table," implemented as a test helper, never production code.

## Location-profile matcher cleanup

Bundle with the profile commit since the matcher is touched anyway:

- Hoist audience keys: compute `locationKey(ref)` once per audience ref before
  the subscriber loop (today it re-stringifies per subscriber per ref,
  [L275-286](/packages/server/src/controlled-event-feed.ts#L275-L286)).
- Replace the derived scan with `derivedKeyCounts: Map<string, number>`;
  `covers()` becomes two Map lookups. Deleting a derived entry decrements;
  zero removes the key. This is draft1 §4.1's aliasing fix (two sessions
  deriving to one location must not drop coverage on one unfollow) — my
  research's plain key-Set had exactly that bug.

## Protocol surface

In [`groups/event.ts`](/packages/protocol/src/groups/event.ts):

- `EventInterest` gains `profile: Schema.optional(Literals("location", "session-streaming"))`. Wire-optional; absent ⇒ location (compat with existing controlled consumers). **Strict on unknown values** (400 via existing decode → `InvalidRequestError` path in [handlers/event.ts:84-88](/packages/server/src/handlers/event.ts#L84-L88)): lenient-ignore of a bad enum would silently misroute — the mirror of the old-server hazard, defended server-side this time.
- `EventFeedReady.data` gains `profiles: Schema.optional(Array(...))`; absent ≡ empty ≡ location-only (review N7). Server emits a module-level constant list at registration; capabilities are static, not per-subscriber.
- **Classifier placement:** `export const StreamingEventTypes: ReadonlySet<string> = new Set([SessionEvent.Text.Delta.type, SessionEvent.Reasoning.Delta.type, SessionEvent.Tool.Input.Delta.type, SessionEvent.Tool.Progress.type, SessionEvent.Compaction.Delta.type])`. Protocol → Schema is a legal dependency edge (file already imports four schema modules), so referencing the canonical definitions prevents string drift with zero runtime cost (a Set.has). Do **not** put it in Schema (transport policy, not domain) and do **not** import Core/Server from Client — Client may import Protocol, which is all the diagnostics need.

## Staging — what earns its cost, when

| Step | Earns it? | Basis |
| --- | --- | --- |
| a. Profile + dispatch + matcher cleanup | yes, first | Unblocks every client-side saving; matcher cleanup is touched anyway; no new state beyond `profile` |
| b. Session index + invariants | yes, second | The gated scan is already cheap per non-matching subscriber (Set.has + profile check, tens of ns est.), so the index matters at large C or mixed fleets — but the **precheck depends on it**, and the precheck is where server encode waste dies |
| c. Precheck on the index | yes, third | With followers spread over S sessions, ~(S−F)/S of gated events have zero recipients but still encode today once *any* streaming subscriber exists — the dominant server-side waste in the target workload |
| d. In-permit lazy encode | reserve only | Fixes only the PUT-churn race class; costs serialization of large stringifies |
| e. Location reverse index | defer | Location-profile population is the compat tail; measure first (draft1 §4.3) |
| f. Encode unification across feeds | defer | Coexistence double-encode is once per event, bounded; review N6/B2 measurements decide |

Land (a) with a naive gated scan (correct, client savings immediate), then
(b), then (c) — each independently testable and revertible. This refines
draft1's commit 6/8 split with the (b)→(c) dependency made explicit.

## Test seams and commands

Seams (all existing; no new harness):

- `make(observe, {capacity, encode, createID})` injection for unit-level admission/index/precheck tests in `packages/server/test/controlled-event-feed.test.ts` — linearization cases: (i) publish concurrent with activating PUT never delivers pre-activation (linearizes at (P)/(A)); (ii) publish started after acknowledged PUT always delivers; (iii) gated event + active location-profile subscriber is never skipped (Condition 1 guard — the suppression-bug pin); (iv) I3 overflow-during-indexed-iteration.
- `controlled-event-feed-http.test.ts`: ready advertises `profiles`; PUT with explicit `location` still accepted; unknown profile string ⇒ 400; absent field ⇒ location (old client).
- `packages/protocol/test/event.test.ts`: the five `StreamingEventTypes` are `SessionEvent.All` members whose schema carries `sessionID` (draft1's required pin; observation-review F1 confirms the set is exactly the streaming-ephemeral family); interest round-trip with/without profile; ready absent ≡ empty. **Also pin decode behavior for unknown excess fields on `EventInterest`** (see unknowns).
- Characterization bench (draft1 commit 3) precedes (a) for honest baselines; per-family rates/bytes incl. `rpc.*` is my review's B2 gate.

Commands (per package, per AGENTS): server — `bun test test/controlled-event-feed.test.ts test/controlled-event-feed-http.test.ts test/event-feed.test.ts`, `bun typecheck`; protocol — `bun test test/event.test.ts`, `bun run generate`, `bun run check:generated`, `bun typecheck`; client — `bun run generate` after the protocol change (generated surfaces only, no hand edits); core — unchanged, routine regression only.

## Commit dependency order (server/core/protocol slice)

0. `fix(tui): restore legacy default behind experiment` — observation-review F5; outside my slice but must precede graduation; listed for ordering only.
1. `test(server): characterize event fanout workloads` — baseline rates/bytes (B2 gate feeds this).
2. `feat(protocol): negotiate session streaming interests` — profile field, ready `profiles`, `StreamingEventTypes`, tests, client generation + OpenAPI mirror check.
3. `feat(server): scope streaming admission to followed sessions` — profile normalization, gated/broad dispatch, location-profile-only derived bookkeeping, matcher hoist + derived counts, ready advertisement; linearization tests (i)-(iii).
4. `refactor(server): index streaming event recipients` — index + I1-I3 + oracle + overflow-iteration test.
5. `perf(server): skip encoding recipientless streaming events` — precheck (Conditions 1-2 as commented invariants), plus bench delta.

Each is explicit-path conventional `jj commit` with its tests; 2 → 3 → 4 → 5 are strictly dependent; 1 precedes 3 for measurement honesty.

## Known unknowns (flag early)

- **D/B rates and byte split unmeasured** — including how much of `B` is `message.content.updated` full-content writes (observation-review F2 shows foreign transcripts keep building; if durable writes dominate client CPU, steps (a)-(c) still help server/wire but the client ceiling belongs to the deferred transcript-interest guard).
- **`rpc.*` emission rates are plugin-defined** and unbounded ([rpc.ts:99-106](/packages/core/src/rpc.ts#L99-L106) publishes with envelope location) — the B2 characterization must quantify before graduation.
- **Effect Schema v4 excess-property decode default** (ignore vs error) on `EventInterest` is asserted plausible, not verified — the protocol test pins whichever behavior is real and we choose strictness deliberately.
- **Set-iteration-during-removal** is well-defined JS but untested in this codebase's Effect Queue paths — I3's test exists to retire that doubt.
- Estimate flags: "tens of ns" per skipped subscriber and the (S−F)/S encode-waste fraction are arithmetic from stated assumptions, not measurements; step (c)'s bench replaces them.

## Cross-references

- [draft1](/.design/bus-smart/draft1.gpt6a.md) §3-4 — the contract this shapes; §8's commit 5/6/8 map to my 2/3+4/5.
- [My contract review](/.design/bus-smart/review1-contract.glm53.md) — B1 (gate window) lands in commit 3's tests; B2 (rates gate) in commit 1; N2 becomes the linearization section above, now with Condition 1's suppression edge made explicit.
- [Observation review](/.design/bus-smart/review1-observation.glm53.md) — F1 validates the classifier set; F3/F5 are client/TUI-side ordering constraints my commit order respects.
- [My filtering-cost research](/.design/bus-smart/research1-filtering-cost.glm53.md) — residual-cost inventory that steps (a)-(c) retire in sequence.
