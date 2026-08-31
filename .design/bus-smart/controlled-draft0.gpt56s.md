---
type: Design
title: Controlled SSE event feed
description: Focused design for one scoped SSE with client interest commands, server-derived move coverage, and explicit transport control frames.
resource: /design/bus-smart/controlled-draft0
tags: [server, events, tui, sse, location, sequencing, effect, downstream-patch]
status: draft
generated: { by: "agent:gpt-5.6-sol#xhigh", at: 2026-08-31 }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: controlled-research
    resource: /design/bus-smart/research-controlled-sse0
    title: Controlled SSE subscriptions for changing Location interest
  - id: sequencing-research
    resource: /design/bus-smart/research-event-sequencing0
    title: Event sequencing requirements for scoped SSE feeds
  - id: bus
    resource: /packages/core/src/bus.ts
    title: Bus publication and Session routing
  - id: event-feed
    resource: /packages/server/src/event-feed.ts
    title: EventFeed bounded subscriber queues
  - id: session-move
    resource: /packages/core/src/session.ts
    title: Session move admission
  - id: effect-semaphore
    resource: https://github.com/Effect-TS/effect-smol/blob/main/packages/effect/src/Semaphore.ts
    title: Effect v4 Semaphore
---

# Controlled SSE event feed

## Decision

The full TUI should use one controlled SSE carrying:

- global events exactly once;
- events routed to any requested Location;
- events and Location coverage needed to follow explicitly tracked Sessions
  across moves.

The client changes requested interests with revisioned batch commands. EventFeed
may add a temporary derived interest when a followed Session moves. Every
requested or derived change is reported in the same SSE as a transport-local
control frame. Domain events and control frames share one bounded queue and one
admission order.

This retains the main advantage of the existing transport: one logical
selected-event FIFO. It removes the global firehose without requiring the Solid
projection to merge independent TCP streams.

## Current behavior

### SSE filtering today

The current `/api/event` endpoint supports **no filtering**. It takes no input
([`event.ts`](/packages/protocol/src/groups/event.ts#L28-L45)), and EventFeed
observes the global deprecated `bus.listen` callback
([`event-feed.ts`](/packages/server/src/event-feed.ts#L71-L88)). Every public
event enters every subscriber queue.

Location filtering exists only inside in-process `Bus.subscribe()`. Its match
is exact on both:

- `directory`;
- optional `workspaceID`.

An absent ambient Location gets the unfiltered all-events stream. A present
Location gets global events plus events matching that exact Ref
([`bus.ts`](/packages/core/src/bus.ts#L726-L762)).

The controlled feed should preserve that equality. Workspace filtering is
nearly free once EventFeed receives Bus's audience, and omitting it would merge
implicit-local and explicit-workspace placements that Bus currently keeps
distinct.

### Move admission today

`POST /api/session/:sessionID/move` is public
([`session.ts`](/packages/protocol/src/groups/session.ts#L323-L336)). It can be
called by the TUI, app/desktop, generated SDK, or a plugin host. The app and TUI
already call it independently
([`session-workspace-menu.tsx`](/packages/app/src/session/timeline/session-workspace-menu.tsx#L52-L78),
[`move.tsx`](/packages/tui/src/component/prompt/move.tsx#L105-L123)), and the
plugin Promise adapter exposes it
([`adapter.ts`](/packages/plugin/src/promise/adapter.ts#L400-L412)). "External"
therefore means external to one observing TUI, not external to OpenCode.

The request also does not normally commit placement synchronously. `Session.move`
validates the destination, then admits a durable move inbox item and wakes
execution ([`session.ts`](/packages/core/src/session.ts#L461-L515)). The runner
closes model transport and publishes the move at a later safe boundary
([`llm.ts`](/packages/core/src/session/runner/llm.ts#L63-L100)). A queued move can
wait behind current work; `delivery: "queue"` asks it to wait rather than steer
at the next safe boundary.

For the common initiating-TUI path, the client can prepare destination interest
before calling `session.move` and retain it until the move event arrives. That
is a useful fast path. It is not the full invariant because another client can
initiate the move, and the server or SSE can restart between admission and the
later move boundary.

## Transport contract

Keep legacy `GET /api/event` unchanged. Add a separate experimental controlled
surface so old generated clients never receive transport control frames:

```text
GET   /api/experimental/event
PATCH /api/experimental/event/subscriptions/:subscriptionID/interests
```

The GET accepts the launch Location as initial interest using the existing
Location query shape. The TUI already resolves that Location before mounting
providers. The controlled method is new, so its `(input, requestOptions)` shape
does not alter existing `event.subscribe(requestOptions?)` call sites.

The first two frames are:

1. `event-feed.ready`, containing subscription identity and initial interest;
2. the existing domain `server.connected`, forwarded once to ordinary event
   consumers.

Later `event-feed.*` frames are intercepted by `createClientConnection` and do
not enter the global emitter or Solid data projection.

### Feed item schema

```ts
export type FeedItem = OpenCodeEvent | FeedControl

export type FeedControl =
  | {
      readonly type: "event-feed.ready"
      readonly data: SubscriptionSnapshot
    }
  | {
      readonly type: "event-feed.command.applied"
      readonly data: {
        readonly commandID: string
        readonly requestedRevision: number
        readonly effectiveRevision: number
        readonly requestedChanges: InterestChanges
        readonly effectiveChanges: InterestChanges
      }
    }
  | {
      readonly type: "event-feed.effective.changed"
      readonly data: {
        readonly effectiveRevision: number
        readonly effectiveChanges: InterestChanges
        readonly reason: EffectiveChangeReason
      }
    }
```

```ts
export interface SubscriptionSnapshot {
  readonly subscriptionID: string
  readonly controlToken: string
  readonly requestedRevision: number
  readonly effectiveRevision: number
  readonly requested: InterestInput
  readonly effective: InterestInput
}
```

`controlToken` is returned only in the ready frame and must be supplied in an
`x-opencode-event-control-token` header on PATCH. Normal server authentication
still applies. Overflow fails the queue; it cannot reliably enqueue a final
control frame into a queue that is already full. Server restart similarly
appears as connection loss, not a message from the old process.

These are Protocol transport contracts, not Bus events and not members of the
public Event manifest. Named SSE `event: control` fields may be emitted for
diagnostics, but the tagged JSON payload is authoritative because the current
generated SSE parser consumes only `data:`
([`generated/client.ts`](/packages/client/src/promise/generated/client.ts#L342-L397)).

## Interest model

Requested and effective interest are deliberately separate.

```ts
export interface InterestSet {
  readonly locations: ReadonlySet<LocationKey>
  readonly sessions: ReadonlySet<SessionID>
}

export interface SubscriberInterest {
  readonly requestedRevision: number
  readonly effectiveRevision: number
  readonly requested: InterestSet
  readonly derivedLocations: ReadonlyMap<SessionID, Location.Ref>
}
```

`requested` is controlled by the client. `derivedLocations` is controlled by
EventFeed and exists only to preserve coverage while a requested Session moves.

Effective Location interest is:

```text
requested.locations union derivedLocations.values()
```

A controlled subscriber accepts:

- every global audience;
- a routed event whose Location audience intersects effective Locations;
- a Session event whose Session ID is in `requested.sessions`.

The exact Session match keeps an open tab's core Session events flowing even if
its Location changes. The derived destination Location also covers immediately
following Location-owned permission, form, catalog, and other events while the
TUI updates its requested set.

## Client commands

The normal interface is batched add/remove, not full replacement:

```ts
export type InterestCommand =
  | {
      readonly type: "patch"
      readonly commandID: string
      readonly expectedRevision: number
      readonly add?: InterestInput
      readonly remove?: InterestInput
    }
  | {
      readonly type: "replace"
      readonly commandID: string
      readonly expectedRevision: number
      readonly interest: InterestInput
    }

export interface InterestInput {
  readonly locations?: readonly Location.Ref[]
  readonly sessions?: readonly SessionID[]
}
```

Patch semantics are set semantics:

- adding an existing interest is an idempotent no-op;
- removing an absent interest is an idempotent no-op;
- one command applies all adds and removals atomically;
- contradictory add/remove of the same key is invalid;
- `commandID` makes an exact retry return the original result;
- `expectedRevision` rejects a stale divergent command.

Revision and retry rules are exact:

- command ID lookup happens first;
- reuse with the same canonical command returns its cached result;
- reuse with different command content fails as a command-ID conflict;
- every unseen command requires `expectedRevision === requestedRevision`;
- a semantic no-op is acknowledged and cached without incrementing either
  revision;
- `requestedRevision` increments only when the canonical requested set changes;
- `effectiveRevision` increments only when the recipient predicate changes,
  including exact Session membership as well as effective Locations.

Control frames report `requestedChanges` and `effectiveChanges` separately. A
destination Location moving from derived to requested coverage changes the
requested set but not the effective recipient predicate.

`replace` is retained for initial restoration after reconnect, explicit
resynchronization after a revision conflict, and tests. It is not the normal
tab/route update path.

The client maintains its desired set locally. Concurrent UI changes coalesce
into one patch against the last applied requested revision. On conflict it may
read the latest snapshot or use one `replace` with its canonical desired set.

## Atomic admission order

EventFeed serializes these operations through the same critical section:

- Bus event recipient selection and queue admission;
- subscriber registration and removal;
- interest command application and applied-frame admission;
- server-derived move coverage and effective-change admission.

For a client command, the critical section:

1. validates subscription, token, command ID, and requested revision;
2. computes the next requested and effective sets;
3. enqueues `event-feed.command.applied`;
4. installs the new state;
5. caches the canonical command and result;
6. returns the command result.

Events already queued before the control frame used old interest. Events queued
after it use new interest. The HTTP response may race ahead of the SSE frame,
so the client advances its applied revision only when it consumes the control
frame.

For a followed Session move, the critical section handles each matching
subscriber before queueing the domain move:

1. add or update `derivedLocations[sessionID]` to the destination;
2. enqueue `event-feed.effective.changed` if effective coverage changed;
3. enqueue `session.moved`;
4. allow later destination events to use the expanded effective set.

The TUI therefore learns that its physical SSE coverage changed before it sees
the domain move that causes route/tab state to change. It can patch-add the
destination to requested Locations and later remove a now-unused source. Once
the destination is requested, EventFeed removes the redundant derived entry
without reducing effective coverage. If the Session is unfollowed, its derived
entry is removed.

This is move sequencing, not delayed best-effort repair.

There is one immediate move path as well as the usual queued path. If the source
directory has disappeared, `Session.move` cancels pending moves and publishes
`session.moved` directly during the request
([`session.ts`](/packages/core/src/session.ts#L491-L504)). Routed EventFeed
admission must cover both immediate and runner-applied moves.

## Bus audience

Bus should expose a publication-time routed observation:

```ts
export type EventAudience =
  | { readonly type: "global" }
  | {
      readonly type: "locations"
      readonly refs: readonly Location.Ref[]
      readonly sessionID?: SessionID
    }

export type RoutedSubscriber = (
  event: Event.Payload,
  audience: EventAudience,
) => Effect.Effect<void>
```

For Session events, `sessionID` comes from the same private Session-event guard
that creates route snapshots. EventFeed does not infer Session ownership from
arbitrary payloads. `refs: []` remains a routed event with no Location audience,
not a global event.

This seam gives EventFeed enough information to match both Location and exact
Session interest while Bus remains the sole owner of fork, move, cold-owner,
and workspace routing semantics.

The routed observer runs inline after route snapshots are installed and before
legacy listeners and PubSub publication. Bus awaits it. Therefore move-derived
coverage is installed before `bus.publish(session.moved)` completes and before
the runner can resume causally post-move Session execution. This does not impose
a new total order on unrelated concurrent publications at the destination.

### Location identity

`Location.Ref` objects cannot be used directly as Set keys. Canonicalize them
with a collision-free scalar key, matching the client data layer's existing
shape:

```ts
type LocationKey = string

const locationKey = (ref: Location.Ref): LocationKey =>
  JSON.stringify([ref.directory, ref.workspaceID ?? null])
```

Use this key for deduplication, equality, add/remove contradiction checks, and
audience matching. `workspaceID: undefined` remains distinct from every
explicit workspace. The wire Ref field is `workspaceID`; the existing deep
query spelling remains `location[workspace]`.

## Effect v4 module shape

The smallest carryable implementation should retain EventFeed's existing
single-process mutable registry and unsafe queue offers, but put every ordering
operation behind one Effect v4 `Semaphore`.

```ts
type Subscriber = {
  readonly id: SubscriptionID
  readonly token: Redacted.Redacted<string>
  readonly queue: Queue.Queue<string, EventFeed.Error>
  interest: SubscriberInterest
  readonly commands: Map<string, AppliedCommand>
}

const subscribers = new Map<SubscriptionID, Subscriber>()
const admission = yield* Semaphore.make(1)

const serialized = <A>(run: () => A) =>
  admission.withPermit(Effect.sync(run))
```

Why `Semaphore` rather than `SynchronizedRef`:

- the critical section mutates a registry and several subscriber records;
- it also performs ordered `Queue.offerUnsafe` and queue failure;
- wrapping the entire registry in immutable copies would add allocation without
  improving the ownership model;
- EventFeed already owns the registry exclusively inside one process.

Effect v4 `Semaphore.withPermit` releases on every exit, but the wrapped effect
is interruptible. One `Effect.sync` makes validation, frame encoding,
`Queue.offerUnsafe`, state installation, command caching, and registry mutation
one non-yielding operation. On a failed offer, remove and fail the subscriber;
do not install state or cache success. Never await network, database, or queue
backpressure while holding the permit.

Subscriber queues retain the existing encoded-string representation. Domain
events are rendered once per publication after recipient selection; targeted
control frames are rendered for their one subscriber.

Subscriber acquisition remains scoped:

```ts
Effect.acquireRelease(
  Queue.dropping<string, EventFeed.Error>(capacity).pipe(
    Effect.flatMap((queue) => serialized(() => register(queue))),
  ),
  (subscriber) =>
    serialized(() => unregister(subscriber)).pipe(
      Effect.andThen(Queue.shutdown(subscriber.queue)),
    ),
)
```

Queue overflow inside the critical section removes and fails only that
subscriber, preserving today's contract. `Schema.TaggedError` types cover
invalid control, missing subscription, token mismatch, revision conflict, and
overflow. The HTTP handler stays thin: decode command, read auth, call
`EventFeed.control`, and return its revision result.

An actor-style coordinator using a command `Queue` plus `Deferred` replies could
also serialize publication and control. It adds a fiber hop and shutdown/reply
failure modes to every event. The semaphore is the smaller downstream patch and
matches the current module's direct fan-out implementation.

## Client ownership

`createClientConnection` owns transport frames, subscription identity,
requested/effective revisions, command serialization, and reconnect restore.
It exposes a narrow interface:

```ts
export interface EventInterestControl {
  readonly snapshot: Accessor<SubscriptionSnapshot | undefined>
  readonly patch: (input: {
    readonly add?: InterestInput
    readonly remove?: InterestInput
  }) => Promise<void>
  readonly replace: (interest: InterestInput) => Promise<void>
}
```

`SessionTabsProvider` owns the desired product interests because it knows the
active route, current Location, open tabs, and resolved Session metadata. It
patches:

- Location add before a Home/Session route begins relying on that Location;
- Session add while an active/open tab needs uninterrupted Session events;
- destination add before this TUI admits a move;
- Session remove when the tab closes;
- Location remove only when no route, tab, optimistic creation, or derived move
  still requires it.

At startup, begin with the already-resolved launch Location. As soon as
persisted tab state mounts, patch-add its known Session IDs before resolving
their Locations; exact Session interest does not need Location metadata. Then
resolve each Session, patch-add its Location, and hydrate it. This avoids a
temporary all-events mode while still giving restored tabs a direct coverage
path.

The `/cd` command is another initiating-TUI move path and follows the same
prepare-before-admit rule
([`prompt/index.tsx`](/packages/tui/src/component/prompt/index.tsx#L275-L315)).

`createClientConnection` reports server-derived control frames in its snapshot,
but it does not invent product interests. This separates transport state from
tab policy.

## Reconnect and compatibility

A stream failure destroys the server-side subscription. The client keeps its
desired set, obtains a new controlled stream identity, and uses `replace` once
to restore that set. Existing broad hydration repairs events missed under the
volatile disconnect contract. Normal interest changes do not reconnect and do
not emit domain `server.connected`.

Legacy `/api/event` and all existing clients remain unchanged. The new
experimental endpoints add generated files but do not alter the signature of
the existing subscribe method or its CLI/ACP call sites. If carrying generated
output becomes intolerable, the downstream branch can temporarily implement
the same contracts with private headers and a hand-written control callback;
the module interfaces and tests should remain identical so that adaptation can
later be deleted.

## Carry boundary

Keep the downstream patch in five reviewable layers:

1. **Core:** add publication-time `EventAudience` and focused Bus routing
   tests. Do not change event payload schemas.
2. **Server:** deepen EventFeed with the serialized subscriber registry,
   requested/derived interest state, control commands, and move coverage.
3. **Protocol/client generation:** add only the new experimental controlled GET
   and PATCH methods plus transport control schemas. Leave legacy
   `event.subscribe` untouched. Regenerate this layer mechanically after an
   upstream rebase.
4. **Client connection:** add a controlled connection adapter beside the legacy
   path. Keep frame interception and command revisions out of Solid data.
5. **TUI:** publish route/tab interests and prepare this TUI's moves. Avoid
   changing unrelated components or the desktop/app until they opt in.

This concentrates behavioral conflicts in `bus.ts`, `event-feed.ts`, and
`connection.ts`. Generated churn is unavoidable for the clean public
experimental surface, but it is isolated from existing call signatures and
ordinary CLI/ACP event consumers.

## Invariants

1. One controlled subscriber has one bounded FIFO queue.
2. Every admitted domain event is delivered at most once to that subscriber.
3. Global events are admitted exactly once regardless of Location count.
4. Requested interest changes only through acknowledged client commands.
5. Derived interest changes only through server-observed routing transitions.
6. Every effective-interest change is announced in the queue before events
   that depend on it.
7. A followed Session remains covered across a move before destination
   execution can publish its suffix.
8. Workspace identity participates in every Location equality check.
9. An empty routed audience never becomes global.
10. No interest change emits a domain connection boundary.

## Verification focus

- Patch add/remove and replace produce the same canonical requested set.
- Repeated command IDs are idempotent; stale revisions fail without mutation.
- Reusing a command ID with different canonical content fails.
- Semantic no-op commands are acknowledged without incrementing revisions.
- The HTTP response overtaking its applied SSE frame does not advance client
  state early.
- A TUI-prepared move has destination interest before admission.
- A move from app, plugin, or another TUI installs derived coverage before the
  observing TUI receives `session.moved`.
- A move still pending after reconnect is covered by restored Session follow;
  a move executed during disconnection is repaired by reconnect hydration under
  the existing volatile contract.
- Permission/form events immediately after a move remain covered through the
  derived destination Location.
- Removing the last Session follow releases derived coverage without removing
  independently requested Location coverage.
- Directory-equal but workspace-distinct events remain isolated.
- Queue overflow fails one subscriber and makes subsequent control return
  not-found/closed.
- Ready and `server.connected` are enqueued during serialized registration,
  before any ordinary event for that subscriber. The controlled handler does
  not prepend them outside EventFeed.
- Legacy unscoped behavior and wire frames are unchanged.

## Open questions

- Should the controlled endpoint remain experimental until the control-frame
  vocabulary and revision rules stabilize?
- Should command idempotency retain only a bounded recent window or all command
  IDs for the subscription lifetime?
- Should exact Session interest admit only native Session events, or also
  permission/form events carrying that Session ID? This draft uses derived
  Location coverage for the latter to keep routing taxonomy Bus-owned.
- Should launch-only startup remain the rule, or is a short all-events bootstrap
  ever justified? This draft recommends launch Location plus immediate persisted
  Session IDs, without all-events mode.
- Should the TUI delay `session.move` only until destination interest is
  applied, or also until destination Location metadata hydration completes?

## Cross-references

- [Controlled-SSE research](/.design/bus-smart/research-controlled-sse0.gpt56s.md)
  compares attached, prepared, and WebSocket control planes.
- [Event sequencing research](/.design/bus-smart/research-event-sequencing0.gpt56s.md)
  identifies the current projection's FIFO, deduplication, and move guarantees.
- [Location-stream alternatives](/.design/bus-smart/location-streams0.gpt56s.md)
  compare dedicated global/per-Location streams and union handoff.
- [Durable Streams alternative](/.design/bus-smart/research-durable-streams0.gpt56s.md)
  records the larger fixed per-Session replay architecture.
