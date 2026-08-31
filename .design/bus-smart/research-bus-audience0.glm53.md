---
type: Research
title: Bus publication-time audience seam
description: How Bus should expose publication-time event routing to a server-facing observer; verified internals, semantics matrix, interface candidates, and the move-ordering trace.
resource: /design/bus-smart/research-bus-audience0
tags: [core, bus, events, routing, server, sse, location]
status: draft
generated: { by: "agent:glm-5.3-max", at: 2026-08-31 }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: bus
    resource: /packages/core/src/bus.ts
    title: Bus publication, routing snapshots, and Session routing
  - id: routing-oracle
    resource: /packages/core/test/bus-session-routing.test.ts
    title: Bus Session routing behavioral oracle
  - id: event-schema
    resource: /packages/schema/src/event.ts
    title: Event envelope and definition constructors
  - id: session-events
    resource: /packages/schema/src/session-event.ts
    title: SessionEvent definitions and the All union
  - id: event-feed
    resource: /packages/server/src/event-feed.ts
    title: EventFeed bounded subscriber queues
  - id: session-move
    resource: /packages/core/src/session.ts
    title: Session move admission and the immediate move path
  - id: runner-llm
    resource: /packages/core/src/session/runner/llm.ts
    title: Runner safe-boundary move publication
  - id: execution
    resource: /packages/core/src/session/execution.ts
    title: Session execution drain recursion across moves
  - id: controlled-draft
    resource: /design/bus-smart/controlled-draft0
    title: Controlled SSE event feed draft
  - id: review
    resource: /design/bus-smart/review0
    title: bus-smart downstream-patch assessment
  - id: sequencing-research
    resource: /design/bus-smart/research-event-sequencing0
    title: Event sequencing requirements for scoped SSE feeds
---

# Bus publication-time audience seam

## Situation

The controlled-SSE design needs the server to filter events per subscriber by
Location and exact Session interest, without the server re-deriving routing
semantics from payloads. The [controlled draft](/.design/bus-smart/controlled-draft0.gpt56s.md)
"Bus audience" section sketches an `EventAudience`-carrying routed observer and
claims an inline ordering guarantee around `session.moved`. This note
pressure-tests that sketch against the actual Bus code in this worktree,
catalogs the semantics any seam must preserve, and compares four interface
shapes. It is a non-authoritative "what if" exploration with concrete anchors;
every line number below was verified in this worktree.

## 1. Current routing internals

### 1.1 Instance state

All routing state is local to the `configured()` layer closure
([`bus.ts`](/packages/core/src/bus.ts#L182-L207)):

| State | Anchor | Role |
| --- | --- | --- |
| `pubsub.live` | [`bus.ts`](/packages/core/src/bus.ts#L194) | Unbounded PubSub feeding untyped `subscribe()` |
| `pubsub.durable` | [`bus.ts`](/packages/core/src/bus.ts#L195) | Per-aggregate wake signals for `log(follow: true)` tailers |
| `pubsub.typed` | [`bus.ts`](/packages/core/src/bus.ts#L196) | Per-event-type PubSub for typed `subscribe(definition)` |
| `listeners` | [`bus.ts`](/packages/core/src/bus.ts#L199) | Deprecated global callback list (`listen`, no filtering) |
| `sessions` | [`bus.ts`](/packages/core/src/bus.ts#L204) | Durable in-memory Session → owner `Location.Ref` map |
| `routes` | [`bus.ts`](/packages/core/src/bus.ts#L207) | `WeakMap<Event.Payload, readonly Location.Ref[]>` keyed by the exact payload object |

The `routes` WeakMap is deliberately hidden: routing facts live apart from the
public event, and the snapshot is retained per payload object so slow
subscribers drain events queued before a move or deletion with the routing that
was current at publication (comment at
[`bus.ts`](/packages/core/src/bus.ts#L205-L206)).

### 1.2 The Session-event guard and `prepareRoutes`

`isSessionEvent` classifies by membership in `SessionEvent.All`
([`bus.ts`](/packages/core/src/bus.ts#L209-L210)); `All` is the tagged union of
durable plus ephemeral SessionEvent definitions
([`session-event.ts`](/packages/schema/src/session-event.ts#L686-L689)).
`prepareRoutes(events)` ([`bus.ts`](/packages/core/src/bus.ts#L212-L261))
computes two things and returns an install closure:

- `updates: Map<SessionID, Location.Ref | undefined>` — ownership deltas
  (create, move, fork, delete);
- `resolved: Map<Event.Payload, readonly Location.Ref[]>` — a route snapshot
  per session event.

Per-case behavior:

- `session.created` — ownership set to `event.data.location`; snapshot is
  `[event.location ?? event.data.location]` (envelope wins)
  ([`bus.ts`](/packages/core/src/bus.ts#L218-L221)). `data.location` is
  required by schema ([`session-event.ts`](/packages/schema/src/session-event.ts#L56)),
  so `created` always routes somewhere.
- Any other session event **with an envelope `event.location`** (except
  `forked`/`moved`): `continue` — **no snapshot is installed**; the event
  routes by envelope location in `local()`'s fallback
  ([`bus.ts`](/packages/core/src/bus.ts#L223-L226)). `session.deleted` with an
  envelope location still deletes ownership
  ([`bus.ts`](/packages/core/src/bus.ts#L224)).
- Otherwise the owner is resolved: for `forked` the **parent** (`parentID`),
  else the event's own session; batch-local `updates` first, then the
  `sessions` map, then a cold **SessionTable DB read** whose result (including
  a miss) is cached into `updates` ([`bus.ts`](/packages/core/src/bus.ts#L227-L240)).
- `session.moved` — ownership set to the destination; snapshot is
  `[oldRef?, destination]` — **dual-owner delivery**, or `[destination]` when
  the old owner is unknown ([`bus.ts`](/packages/core/src/bus.ts#L241-L246)).
- `forked` — the child inherits the parent's ref; snapshot
  `[event.location]`/`[ref]`/`[]` ([`bus.ts`](/packages/core/src/bus.ts#L248-L249)).
- `deleted` (unlocated) and the default case — snapshot `[ref]` or `[]`
  ([`bus.ts`](/packages/core/src/bus.ts#L249-L250)).

The install closure applies `updates` to `sessions` and the snapshots to
`routes`, and is invoked **only after the projection transaction commits** —
"apply only after the projection transaction commits. A failed move must not
redirect events away from the Session's actual location"
([`bus.ts`](/packages/core/src/bus.ts#L252-L260)). This is the rollback
correctness the oracle test pins
([`bus-session-routing.test.ts`](/packages/core/test/bus-session-routing.test.ts#L272-L299)).

### 1.3 Publish paths

| Path | Route snapshot install | `notify()` | Interruptibility at notify |
| --- | --- | --- | --- |
| ephemeral `publish` | `prepareRoutes` → `route()` inline ([`bus.ts`](/packages/core/src/bus.ts#L479-L480)) | [`bus.ts`](/packages/core/src/bus.ts#L481), `isolateListeners: false` | interruptible; listeners run bare |
| durable `publish` | `prepareRoutes` inside the transaction ([`bus.ts`](/packages/core/src/bus.ts#L399)); `committed.route()` after commit ([`bus.ts`](/packages/core/src/bus.ts#L436-L437)) | [`bus.ts`](/packages/core/src/bus.ts#L474), `isolateListeners: true`, inside `durableLocks.withLock` ([`bus.ts`](/packages/core/src/bus.ts#L469-L477)) | notify itself is outside the `Effect.uninterruptible` that wraps the transaction ([`bus.ts`](/packages/core/src/bus.ts#L315)) — a pre-existing commit→notify interruption gap |
| `publishAll` | one `prepareRoutes(queued)` inside the batch transaction ([`bus.ts`](/packages/core/src/bus.ts#L594)); `committed.route()` after ([`bus.ts`](/packages/core/src/bus.ts#L655)) | per event in order, [`bus.ts`](/packages/core/src/bus.ts#L663) | whole lock+notify section is `Effect.uninterruptible` ([`bus.ts`](/packages/core/src/bus.ts#L575-L576)) — strongest guarantee |
| `replay` | via `commitDurableEvent` as above | only when `options.publish` ([`bus.ts`](/packages/core/src/bus.ts#L695-L697)) | interruptible (outside `commitDurableEvent`'s uninterruptible) |
| `log()` reads | **none** — `readAfter` decodes rows directly; log consumers bypass routes and `local()` entirely ([`bus.ts`](/packages/core/src/bus.ts#L764-L806)) | none | n/a |
| `remove` | no event; deletes `sessions` ownership after the DB delete ([`bus.ts`](/packages/core/src/bus.ts#L703-L715), delete at [`bus.ts`](/packages/core/src/bus.ts#L712)) | none | n/a |
| `claim` | none — only flips `owner_id` ([`bus.ts`](/packages/core/src/bus.ts#L717-L724)) | none | n/a |

`publish` resolves the envelope location from `options.global` (explicitly
undefined), `options.location`, then the ambient `Location.Service`
([`bus.ts`](/packages/core/src/bus.ts#L507-L515)); same logic in `publishAll`
([`bus.ts`](/packages/core/src/bus.ts#L545-L550)). This ambient stamping is why
Location-scoped runners publish permission/form events under the session's
current location (see §3).

Durable wakes for `log(follow: true)` tailers happen after `route()` and before
`notify` ([`bus.ts`](/packages/core/src/bus.ts#L438-L442),
[`bus.ts`](/packages/core/src/bus.ts#L656-L662)); they carry no payloads and
never consult routes.

### 1.4 `notify()`, `listen`, and `observe`

`notify(event, isolateListeners)` runs the deprecated `listeners` array, then
the typed PubSub, then `pubsub.live` ([`bus.ts`](/packages/core/src/bus.ts#L494-L505)).
`observe()` wraps a listener in `Effect.suspend` and catches every cause except
interruptions, logging instead of failing the publish
([`bus.ts`](/packages/core/src/bus.ts#L486-L492)). Two failure contracts are
pinned by tests:

- a listener that interrupts **fails the durable publish** even though the
  event committed ([`bus.test.ts`](/packages/core/test/bus.test.ts#L407-L424));
- an ephemeral listener defect **fails the ephemeral publish** (bare listeners,
  [`bus.test.ts`](/packages/core/test/bus.test.ts#L426-L434)).

`listen` production consumers besides EventFeed
([`event-feed.ts`](/packages/server/src/event-feed.ts#L83-L88)): the event
logger ([`event-logger.ts`](/packages/core/src/event-logger.ts#L12)) and
location activity tracking ([`location-activity.ts`](/packages/core/src/location-activity.ts#L29)).
Any seam must leave this surface untouched.

### 1.5 `subscribe()` + `local()`

`subscribe()` returns `local(Stream.fromPubSub(pubsub.live))` for the untyped
form, a typed PubSub stream wrapped in `local()` for one definition, and a
filtered live stream for multiple definitions
([`bus.ts`](/packages/core/src/bus.ts#L748-L762)). `local()` resolves the
ambient `Location.Service` **at stream-run time**; absent ambient → unfiltered;
present → exact equality on `directory` **and** `workspaceID`
([`bus.ts`](/packages/core/src/bus.ts#L726-L746), matcher at
[`bus.ts`](/packages/core/src/bus.ts#L733-L734)). The filter is:

```ts
const refs = routes.get(event)
if (refs) return refs.some(matches)
return !event.location || matches(event.location)
```

([`bus.ts`](/packages/core/src/bus.ts#L736-L740)) — route snapshot first;
envelope fallback; **no snapshot + no location = global**; snapshot `[]` =
routed-but-no-location, filtered out of every scoped stream.

## 2. Semantics matrix the seam must preserve

From [`bus-session-routing.test.ts`](/packages/core/test/bus-session-routing.test.ts):

| Case | Anchor | What the audience seam must reproduce |
| --- | --- | --- |
| Dual-owner moves; same-location move not duplicated | [L70-L92](/packages/core/test/bus-session-routing.test.ts#L70-L92) | `moved` audience = `[old, new]` (or `[new]` when old unknown); a subsequent same-owner move is `[new]` only. Envelope location on `moved` (`moved.location === a`) does not override dual delivery |
| Forks route through the parent before the child exists, across `publish`/`publishAll`/`replay` | [L94-L138](/packages/core/test/bus-session-routing.test.ts#L94-L138) | `forked` audience = parent's ref; child-session events after the fork route to the inherited ref. Replay-with-publish must reach the same audience |
| Envelope location overrides session ownership; unlocated session events strip location from payloads; global parity | [L140-L174](/packages/core/test/bus-session-routing.test.ts#L140-L174) | Explicit `{location: b}` on a session event delivers only to b, not the owner a. `renamed`/`text.delta` carry no `location` on the wire (and never in `log` history) — the audience must be the sole carrier of routing |
| Typed and multi-type subscriptions get identical routing | [L176-L201](/packages/core/test/bus-session-routing.test.ts#L176-L201) | Routing is per-payload, not per-subscription-shape |
| Slow subscribers: pre-move events keep their old snapshots across create/move | [L203-L231](/packages/core/test/bus-session-routing.test.ts#L203-L231) | Audience computed at publication time is immutable for that payload; later ownership changes never rewrite it |
| Cold-owner deletion routes via the DB lookup | [L233-L250](/packages/core/test/bus-session-routing.test.ts#L233-L250) | Audience for a never-seen session resolves through SessionTable inside the publication transaction |
| Batch that moves then deletes mid-batch | [L252-L270](/packages/core/test/bus-session-routing.test.ts#L252-L270) | Per-event snapshots inside one `publishAll` see intra-batch ownership updates: `before`→a, `moved`→[a,b], `after`/`deleted`→b |
| Rollback leaves ownership unchanged | [L272-L299](/packages/core/test/bus-session-routing.test.ts#L272-L299) | No observer may observe an audience for a moved event whose transaction rolled back — audience only exists once the install closure ran |
| Silent replay updates cached ownership; published replay is filtered by routes | [L301-L333](/packages/core/test/bus-session-routing.test.ts#L301-L333) | Replay without publish still mutates `sessions` (affects later audiences); replay with publish produces a real routed audience |

Plus the implicit rule verified in §1.5: **routed-but-no-location (`refs: []`)
is not global** — an unresolved session event must not leak to every scoped
subscriber.

## 3. Event envelope facts

- `PayloadBase` carries `id`, `type`, `created`, `data`, optional `location`
  and `metadata`; only durable payloads add the
  `{aggregateID, seq, version}` envelope
  ([`event.ts`](/packages/schema/src/event.ts#L60-L71)). Constructors:
  `durable` at [`event.ts`](/packages/schema/src/event.ts#L83-L119), `ephemeral`
  at [`event.ts`](/packages/schema/src/event.ts#L121-L143).
- **Global by construction**: any event published with no envelope location and
  no route snapshot — e.g. `global: true` credential events, and any
  non-session publish from a context without ambient location
  ([`bus.ts`](/packages/core/src/bus.ts#L507-L515)).
- **Location'd by construction**: non-session events with an envelope location
  (catalog, agent, shell, form, VCS, MCP, …).
- **Session-routed**: members of `SessionEvent.All` — the `Definitions`
  inventory ([`session-event.ts`](/packages/schema/src/session-event.ts#L621-L670))
  plus ephemeral members folded into `All`
  ([`session-event.ts`](/packages/schema/src/session-event.ts#L686-L689)). Every
  member spreads `Base = { sessionID }`
  ([`session-event.ts`](/packages/schema/src/session-event.ts#L40-L42); e.g.
  `Moved` at [`session-event.ts`](/packages/schema/src/session-event.ts#L92-L99))
  — `bus.ts` already relies on this by reading `event.data.sessionID`
  unconditionally after the guard ([`bus.ts`](/packages/core/src/bus.ts#L216-L217)).
  Internal-only `session.usage.recorded` is excluded from `Definitions` so it
  never reaches the public manifest ([`session-event.ts`](/packages/schema/src/session-event.ts#L672-L676)).
- **`session.status` / deprecated `session.idle`** are separate ephemeral
  definitions outside `SessionEvent.All`
  ([`session-status-event.ts`](/packages/schema/src/session-status-event.ts#L35-L51)):
  despite carrying `sessionID`, Bus treats them as ordinary location/global
  events.
- **Permission/form events carry `sessionID` yet are Location-owned** — the
  draft's claim, verified: `permission.asked`/`replied`
  ([`permission.ts`](/packages/schema/src/permission.ts#L44-L52)) and
  `form.replied`/`form.cancelled`
  ([`form.ts`](/packages/schema/src/form.ts#L160-L162)) are ephemeral non-Session
  events; `Permission.Event.Asked` is published with plain `bus.publish` and no
  explicit location ([`permission.ts`](/packages/core/src/permission.ts#L207-L209)),
  so the envelope location comes from the runner's ambient
  `Location.Service` — i.e. the session's **current** (post-move) location. The
  client projects them session-keyed
  ([`data.ts`](/packages/client/src/solid/data.ts#L1113-L1126)) while routing is
  by envelope location (`form.created` lands in the location-guarded block,
  [`data.ts`](/packages/client/src/solid/data.ts#L1159),
  [`data.ts`](/packages/client/src/solid/data.ts#L1190-L1195)). Exact-Session
  interest therefore cannot cover them through a Bus-owned audience; the
  derived destination Location coverage in the controlled draft is the correct
  mechanism. Claim verified.

## 4. Interface candidates

### (a) `listenRouted` inline observer — recommended

```ts
export type EventAudience =
  | { readonly type: "global" }
  | { readonly type: "locations"; readonly refs: readonly Location.Ref[]; readonly sessionID?: SessionID }

export type RoutedSubscriber = (event: Event.Payload, audience: EventAudience) => Effect.Effect<void>

// Bus.Interface addition; existing members unchanged
readonly listenRouted: (subscriber: RoutedSubscriber) => Effect.Effect<Unsubscribe>
```

**Call sites.** "Awaited inline" is achievable in every notifying path because
all four notify call sites (ephemeral
[`bus.ts`](/packages/core/src/bus.ts#L481), durable single
[`bus.ts`](/packages/core/src/bus.ts#L474), batch
[`bus.ts`](/packages/core/src/bus.ts#L663), replay-with-publish
[`bus.ts`](/packages/core/src/bus.ts#L695-L697)) are ordinary awaited
generators, and each is reached only after its route install closure ran. A
single choke point inside `notify()`, ahead of the legacy listeners loop,
covers all of them:

```ts
function notify(event: Event.Payload, isolateListeners: boolean) {
  return Effect.gen(function* () {
    if (routed.length > 0) {
      const refs = routes.get(event)
      const audience: EventAudience = refs
        ? { type: "locations", refs, sessionID: (event.data as { sessionID?: SessionID }).sessionID }
        : event.location
          ? { type: "locations", refs: [event.location] }
          : { type: "global" }
      yield* Effect.forEach(routed, (l) => observeRouted(event, audience, l), { discard: true })
    }
    // …existing listeners / typed / live publication unchanged
  })
}
```

The audience derivation is exactly `local()`'s filter logic
([`bus.ts`](/packages/core/src/bus.ts#L736-L740)) reified as data, so parity
with `Bus.subscribe()` semantics is by construction: snapshot first, envelope
fallback, `refs: []` stays routed (never global). `sessionID` here is
**snapshot-gated** — present only when a route snapshot exists, i.e. for events
Bus actually session-routed; see §6 for the alternative.

**Failure and interruption.** Recommended contract mirrors `observe()`
([`bus.ts`](/packages/core/src/bus.ts#L486-L492)): non-interrupt causes are
caught and logged (`Effect.logError`) so an admission defect can never fail a
domain publish; interrupts propagate, matching the pinned behavior that a
listener interruption fails the publish even after commit
([`bus.test.ts`](/packages/core/test/bus.test.ts#L407-L424)). This is a
deliberate divergence from the ephemeral bare-listener fail-fast contract
([`bus.test.ts`](/packages/core/test/bus.test.ts#L426-L434)): a feed is
infrastructure, and its overflow policy already lives inside EventFeed
(per-subscriber failure on a full queue,
[`event-feed.ts`](/packages/server/src/event-feed.ts#L64-L68)), not in the
observer's error channel. Queue overflow must fail that subscriber inside the
observer, never the publish.

**Zero-observer cost.** One array-length check per publish when nobody
registered; the WeakMap lookup and audience allocation happen only when at
least one observer exists. Strictly cheaper than today's per-listener
`Effect.forEach` over an empty array is impossible to beat meaningfully — this
is negligible at any realistic rate.

**Batch semantics.** `publishAll` notifies per event in order
([`bus.ts`](/packages/core/src/bus.ts#L663)), so the observer sees
`[InboxDelivered, Moved]` in aggregate order with each event's own snapshot —
required for the move-coverage sequencing in §5.

**Residual risks.** The single durable publish has a pre-existing
interruption window between transaction commit and `notify`
(§1.3): an interrupted publisher can commit and install routes without any
observer or listener running. The move-critical paths do not rely on it (the
runner move uses fully uninterruptible `publishAll`; the immediate path runs
inside an HTTP request), but the seam inherits the window rather than fixing
it — worth documenting, not fixing here.

### (b) Exported `deliversTo(event, ref)` predicate — rejected as a public seam

The predicate would extract `local()`'s filter
([`bus.ts`](/packages/core/src/bus.ts#L736-L740)) behind a boolean. Review0
finding 4 holds and is verified against the source:

- `routes` is an instance-local WeakMap keyed by the **exact payload object**
  ([`bus.ts`](/packages/core/src/bus.ts#L207)). A cloned, decoded, or
  JSON-round-tripped payload has no snapshot; the fallback
  `!event.location || matches(...)` then classifies an unlocated session event
  (true audience `refs: []`) as **global** — the worst possible
  misclassification for a scoped subscriber.
- The contract is temporal and identity-sensitive: valid only between route
  install and payload cloning, for the same object `notify` delivered. That is
  an internal invariant, not an interface.
- It cannot express exact-Session interest at all (pure per-ref boolean), so
  the controlled feed's `sessions` interest set would still need payload
  sniffing — violating the sole-owner constraint.

Fixability: keying by value (`event.id` → refs) breaks because IDs may be
caller-supplied ([`bus.ts`](/packages/core/src/bus.ts#L91-L92)) and replay
recreates payloads from rows ([`bus.ts`](/packages/core/src/bus.ts#L73-L85)),
and it needs eviction. Freezing the routing decision at publication time is
precisely candidates (a)/(d). If an in-place check is ever needed internally,
keep it instance-private as review0 suggests; do not export.

### (c) Per-subscriber scoped `bus.subscribe()` — rejected for the controlled feed

EventFeed would run, per SSE subscriber, one `bus.subscribe()` stream per
interested Location, provided with `Effect.provideService(Location.Service, …)`
— exactly the oracle test's `watch()` pattern
([`bus-session-routing.test.ts`](/packages/core/test/bus-session-routing.test.ts#L50-L59)).

Problems, all structural:

- `local()` matches **one** ambient ref ([`bus.ts`](/packages/core/src/bus.ts#L733-L734));
  a K-location interest union means K streams whose globals must be deduplicated
  and whose cross-stream FIFO the client projection cannot consume — the
  sequencing research already established one logical FIFO as the minimal
  contract.
- No exact-Session concept exists in `local()`; following a session across
  moves would require EventFeed to add/remove location streams reactively,
  reintroducing the unopened-destination gap server-side.
- **Encode-per-subscriber**: today EventFeed renders each public event once
  ([`event-feed.ts`](/packages/server/src/event-feed.ts#L51-L53)) and offers the
  same string to every queue ([`event-feed.ts`](/packages/server/src/event-feed.ts#L64-L68)).
  Per-subscriber Bus streams deliver payload objects on independent fibers;
  encoding becomes per-subscriber unless EventFeed adds an identity-keyed
  encode cache — the same identity sensitivity that sank (b).
- Stream lifecycle churn on every interest patch; `subscribe()` captures the
  ambient location at stream-run time ([`bus.ts`](/packages/core/src/bus.ts#L727-L728)),
  so interest changes mean stream replacement, not mutation.

It remains the right shape for genuinely single-Location in-process consumers
(core code running with ambient location) — just not for a mutable multi-Location,
exact-Session feed.

### (d) Audience computed at publish, carried through the PubSub — viable fallback

Change the internal live channel to carry `{event, audience}` (or add a
parallel routed PubSub published next to `pubsub.live` inside `notify`), and
give EventFeed a consumer of the paired stream. Existing `subscribe()`
consumers see the same payloads via an unwrap in `streamLive()`
([`bus.ts`](/packages/core/src/bus.ts#L762)).

Ordering analysis: `pubsub.live` is FIFO and unbounded, and EventFeed's
admission is serialized, so a moved event is always admitted (and derived
coverage installed) before any destination-suffix event **that EventFeed later
consumes** — the subscriber-visible order is preserved. What is lost relative
to (a) is the stronger publish-return coupling: coverage is installed before
EventFeed *consumes the next item*, not before `bus.publish(...)` returns, so
the draft's invariant "derived coverage is installed before
`bus.publish(session.moved)` completes" no longer holds by construction, only
by queue ordering. Costs: a wrapper allocation and audience computation per
event even with zero controlled subscribers (wrapper shape), or a second
`PubSub.publish` per event plus dual ordering to maintain (parallel shape).
(a) dominates (d) as long as observers are fast, synchronous admission
sections — which is the design intent. Keep (d) in reserve for a future where
Bus must never await observer work inline.

### Comparison

| | (a) inline `listenRouted` | (b) `deliversTo` | (c) scoped `subscribe` | (d) audience in PubSub |
| --- | --- | --- | --- | --- |
| Routing semantics stay Bus-owned | yes (audience as data) | nominally, but leaks identity/timing | yes, but feed re-derives unions/moves | yes |
| Exact-Session interest | yes (`sessionID`) | no | no | yes |
| `refs: []` ≠ global | yes | yes for the live object, silently no for clones | yes | yes |
| Move coverage before publish returns | yes | no (post-hoc query) | no | no (before next consumption) |
| Zero-controlled-subscriber cost | length check | none (unused) | none | wrapper/second publish per event |
| Legacy `listen` / wire impact | none | none | none | internal stream plumbing only |
| EventFeed restructure | swap registration, keep queues | small but unsound | total (streams per subscriber) | swap registration + consumption fiber |
| Encode-once fan-out preserved | yes | yes | no | yes |

## 5. The move-ordering requirement, traced

The draft's claim: the routed observer must run inline after route snapshots
are installed and before `bus.publish(session.moved)` completes, so EventFeed
installs derived destination coverage before the runner can resume post-move
execution. Verified sound on both move paths.

**Immediate path** (`Session.move`, source directory gone):
`Session.move` validates the destination and admits a durable move inbox item
or, when the source directory has disappeared, cancels pending moves and
publishes `session.moved` **directly during the request** —
`bus.publish(...moved)` or `publishAll([cancellations…, moved])` inside
`SessionInbox.serialized` ([`session.ts`](/packages/core/src/session.ts#L491-L504)),
then `execution.wake` after the serialized block
([`session.ts`](/packages/core/src/session.ts#L514)). An inline observer in
`notify` therefore completes — coverage installed — before the serialized block
returns, before `wake`, and before the HTTP response.

**Runner path** (queued move at a safe boundary): `advanceToStep` finds the
next promotable inbox item inside `SessionInbox.serialized`; for a move it
closes model transport and publishes `[InboxDelivered, Moved]` via
`publishAll` ([`runner/llm.ts`](/packages/core/src/session/runner/llm.ts#L81-L90),
transport close at [`runner/llm.ts`](/packages/core/src/session/runner/llm.ts#L84)),
then returns `DrainResult.Moved`
([`runner/llm.ts`](/packages/core/src/session/runner/llm.ts#L98-L99)). Inside
`publishAll`, the order is: transaction commits (the `Moved` projector updates
`SessionTable` to the destination inside the same transaction,
[`projector.ts`](/packages/core/src/session/projector.ts#L464-L479)) →
`committed.route()` installs new ownership and the `[old, new]` snapshot
([`bus.ts`](/packages/core/src/bus.ts#L655)) → per-event `notify`
([`bus.ts`](/packages/core/src/bus.ts#L663)) — all inside
`durableLocks.withLock` + `Effect.uninterruptible`
([`bus.ts`](/packages/core/src/bus.ts#L575-L576)). With the observer inline in
`notify`, coverage is installed **before `publishAll` returns**.

The recursion then re-enters at the destination: `drain` matches
`DrainResult.Moved` and recurses ([`execution.ts`](/packages/core/src/session/execution.ts#L100-L103));
the recursive drain re-reads the session — now at the destination — and
provides `locations.get(session.location)` as the ambient location
([`execution.ts`](/packages/core/src/session/execution.ts#L88-L93)). Every
post-move publication (permission asks, next steps, terminals) is stamped with
that destination envelope location by `publish`
([`bus.ts`](/packages/core/src/bus.ts#L509-L515)) and reaches Bus strictly
after the observer already ran. So the causal suffix is covered by
construction, and this holds even for *concurrent* publishers: any event whose
`notify` runs after the move batch's `notify` is admitted under the already
expanded coverage. An ephemeral delta for the same session can interleave with
the move batch (ephemeral publishes take no aggregate lock,
[`bus.ts`](/packages/core/src/bus.ts#L479-L481)); it snapshots the pre-move
owner and is admitted under old interest — the same order every subscriber
sees today, not a regression.

**Throughput.** Awaiting the observer per publish is one `routes.get` plus a
small allocation plus one sync admission section per registered feed. The
right registration granularity is **one observer per EventFeed** (matching
today's single `bus.listen` registration,
[`event-feed.ts`](/packages/server/src/event-feed.ts#L71)), with EventFeed
fanning out to its own subscriber registry. At 10–30 events/sec/stream and a
handful of concurrent streams, the inline await is microseconds per event —
orders of magnitude below the per-event `PubSub.publish` to the unbounded live
channel that already happens. Fail-slow risk is the only real hazard, and it
is excluded by keeping the observer a non-yielding critical section (the
controlled draft's semaphore design).

## 6. sessionID extraction

Bus knows the session id of a session-routed event exactly where routing
happens: `prepareRoutes` reads `event.data.sessionID` after the
`isSessionEvent` guard ([`bus.ts`](/packages/core/src/bus.ts#L216-L217)). It is
available for **every** member of `SessionEvent.All` at publication time — the
`Base` spread is universal ([`session-event.ts`](/packages/schema/src/session-event.ts#L40-L42))
and production routing already depends on it. Two defensible rules for when
`sessionID` appears in the audience:

1. **Snapshot-gated** (used in §4a): present only when a route snapshot
   exists. Exact-Session interest then matches precisely the events Bus
   session-routes; envelope-overridden session events
   ([`bus.ts`](/packages/core/src/bus.ts#L223-L226)) are Location-owned in the
   audience, exactly matching `local()` parity. Consequence: a followed
   session's explicitly-located publications, and the out-of-band
   `session.status`/`session.idle` events, are covered only through Location
   interest.
2. **Guard-gated**: present whenever `isSessionEvent(event)`, regardless of
   snapshot. Friendlier for open tabs (envelope-pinned session events still
   arrive to session followers), but it admits events Bus routes by envelope —
   a strictly broader recipient set than any `Bus.subscribe()` consumer can
   express today, and a semantic choice Bus would be silently making for the
   server.

Neither rule leaks routing taxonomy into payloads: the audience remains a
Bus-computed fact. The draft's phrase "sessionID comes from the same private
Session-event guard that creates route snapshots" is ambiguous between the two;
this is the sharpest open decision in the seam. Note the `forked` asymmetry
either way: the audience's `sessionID` is the **child** (the event's own
session), while `refs` is the parent's location — a session follower of the
parent does not match on `sessionID`; it matches through the location, which is
correct since the child did not exist when the event was routed.

## 7. Recommendation

Adopt **(a)**: `listenRouted` with a snapshot-gated `sessionID`, observer
called from a single choke point at the top of `notify()`, isolated-fail
(log defects, propagate interrupts), registered once per EventFeed, audience
computed lazily only when observers exist, `refs: []` remaining routed-but-
no-location. Reject (b) as a public surface on verified identity-sensitivity;
reject (c) for the controlled feed on ordering and encode-cost grounds; hold
(d) as the fallback if inline awaiting is ever deemed unacceptable. Legacy
`listen` and the wire stay byte-identical; `event-logger` and
`location-activity` keep their global registrations.

## Open questions

- Snapshot-gated vs guard-gated `sessionID` (§6): should exact-Session interest
  admit only events Bus session-routes, or every `SessionEvent.All` payload
  including envelope-pinned ones? The former is strict `local()` parity; the
  latter serves open tabs better but changes recipient semantics.
- Defect policy asymmetry: the routed observer swallows defects while ephemeral
  legacy listeners stay fail-fast
  ([`bus.test.ts`](/packages/core/test/bus.test.ts#L426-L434)). Is the
  deliberate asymmetry acceptable, or should the observer be fail-fast for
  symmetry at the cost of feed defects failing domain publishes?
- The observer sees internal events excluded from the public manifest (e.g.
  `session.usage.recorded`). EventFeed's `isOpenCodeEvent` check
  ([`event-feed.ts`](/packages/server/src/event-feed.ts#L49)) filters them
  today; should Bus skip the observer for non-public types, or is filtering
  purely the feed's business?
- Should `replay(publish: true)` reach the routed observer identically to live
  publication (it does under (a), via the same `notify`)? The oracle test
  treats published replay as routed delivery; the seam should pin this in
  tests.

## Cross-references

- [Controlled SSE draft](/.design/bus-smart/controlled-draft0.gpt56s.md) — the
  design whose "Bus audience" and "Atomic admission order" sections this note
  verifies and refines.
- [Downstream-patch assessment](/.design/bus-smart/review0.gpt56s.md) — finding
  4's identity-sensitivity critique of `deliversTo`, confirmed here against
  `bus.ts` source.
- [Location streams and controlled subscriptions](/.design/bus-smart/location-streams0.gpt56s.md)
  — the "Shared Bus seam" section sketched the `EventAudience` type this note
  grounds in the actual publish paths.
- [Event sequencing research](/.design/bus-smart/research-event-sequencing0.gpt56s.md)
  — the one-logical-FIFO contract that rejects candidate (c) and motivates the
  inline ordering guarantee traced in §5.
- [Bus Session routing tests](/packages/core/test/bus-session-routing.test.ts)
  — the oracle whose cases any audience implementation must re-pin.
