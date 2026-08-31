---
type: Research
title: Barriered Location-union SSE handoff
description: A carryable event-feed interface using one steady-state SSE for a union of Locations and a paired barrier when that union grows.
resource: /design/bus-smart/research-union-handoff0
tags: [server, events, sse, location, tui, ordering, downstream-patch]
status: draft
generated: { by: "agent:gpt-5.6-sol#xhigh", at: 2026-08-31 }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: original-design
    resource: /design/bus-smart
    title: bus-smart location-scoped event feed
  - id: downstream-review
    resource: /design/bus-smart/review0
    title: bus-smart downstream-patch assessment
  - id: bus
    resource: /packages/core/src/bus.ts
    title: Bus routing and durable log implementation
  - id: event-feed
    resource: /packages/server/src/event-feed.ts
    title: EventFeed fan-out and bounded subscriber queues
  - id: event-handler
    resource: /packages/server/src/handlers/event.ts
    title: Public SSE handler
  - id: client-connection
    resource: /packages/client/src/solid/connection.ts
    title: Solid SSE connection and reconnect loop
  - id: client-data
    resource: /packages/client/src/solid/data.ts
    title: Client event projection and bootstrap reads
  - id: bus-routing-tests
    resource: /packages/core/test/bus-session-routing.test.ts
    title: Session Location routing behavior
---

# Barriered Location-union SSE handoff

## Conclusion

The full TUI should use one steady-state SSE subscribed to the union of
Locations represented by its visible route and open tabs. Interest should grow
monotonically during a connection lifetime. Growth briefly overlaps the old and
replacement streams, with a server-inserted paired barrier defining the exact
handoff cut.

This design can provide a lossless, duplicate-free handoff for Locations the
old stream already covered. It cannot recover events that occurred before a
new Location was registered or while every stream was disconnected. Those
limits follow from the event endpoint's explicitly volatile contract and the
absence of a retained feed cursor.

For a carryable downstream patch, encode the interest as a private request
header. Existing generated clients already permit arbitrary request headers,
so this avoids changing Protocol, regenerated SDK surfaces, and unrelated
`event.subscribe` call sites.

## Constraints in the current implementation

- [`EventFeed`](/packages/server/src/event-feed.ts#L39-L79) encodes each public
  event once and fans it into one bounded queue per subscriber. Queue overflow
  fails only the lagging subscriber.
- [`EventFeed.layer`](/packages/server/src/event-feed.ts#L83-L88) observes the
  Bus's global `listen` callback, while Location filtering currently exists
  only inside [`Bus.subscribe`](/packages/core/src/bus.ts#L726-L762).
- Session event payloads intentionally omit their routing Location. The Bus
  retains an immutable per-event route snapshot in a `WeakMap`
  ([`bus.ts`](/packages/core/src/bus.ts#L204-L260)); routing tests assert that
  serialized public Session events remain Location-free
  ([`bus-session-routing.test.ts`](/packages/core/test/bus-session-routing.test.ts#L140-L173)).
- The SSE wire currently emits only `data:` frames
  ([`event-feed.ts`](/packages/server/src/event-feed.ts#L29-L31)). The generated
  parser reads only `data:` and discards SSE `id:` fields and comments
  ([`generated/client.ts`](/packages/client/src/promise/generated/client.ts#L342-L397)).
- Every physical stream begins with `server.connected`
  ([`handlers/event.ts`](/packages/server/src/handlers/event.ts#L12-L24)). The
  client projects that event into broad hydration
  ([`data.ts`](/packages/client/src/solid/data.ts#L526-L556)), so replacement
  streams must not look like reconnects to downstream consumers.
- Reconnect invalidates every cached read
  ([`data.ts`](/packages/client/src/solid/data.ts#L1980-L1983)). Reopening a
  stream for each route change would exchange the global firehose for repeated
  invalidation and hydration.

## Recommended interfaces

### Routed Bus observation

Do not export a general `deliversTo(event, ref)` predicate. Such a predicate is
valid only for the exact payload object while its instance-local route snapshot
is still available. Instead, expose the route together with the event at the
observation boundary:

```ts
export type DeliveryScope =
  | { readonly type: "global" }
  | {
      readonly type: "locations"
      readonly locations: readonly Location.Ref[]
    }

export type RoutedSubscriber = (
  event: Event.Payload,
  scope: DeliveryScope,
) => Effect.Effect<void>

export interface Interface {
  readonly listenRouted: (
    listener: RoutedSubscriber,
  ) => Effect.Effect<Unsubscribe>
}
```

The Bus derives the scope while notifying the listener:

```ts
const refs = routes.get(event)
const scope =
  refs !== undefined
    ? { type: "locations" as const, locations: refs }
    : event.location
      ? { type: "locations" as const, locations: [event.location] }
      : { type: "global" as const }
```

An empty Location array is distinct from global delivery: it means that an
unresolved Session event reaches no scoped subscriber. Matching remains exact
on both directory and workspace, as in the current Bus filter
([`bus.ts`](/packages/core/src/bus.ts#L733-L740)). Existing `listen` remains for
compatibility.

### EventFeed interest

```ts
export interface Interest {
  readonly clientID: string
  readonly subscriptionID: string
  readonly replaces?: string
  readonly locations: readonly Location.Ref[]
  readonly followSessions: readonly SessionID[]
}

export interface Opened {
  readonly stream: Stream.Stream<string, EventFeed.Error>
  readonly handoff: "initial" | "paired" | "unpaired"
}

export interface Interface {
  readonly subscribe: (
    interest?: Interest,
  ) => Effect.Effect<Opened, InvalidInterestError, Scope.Scope>
}
```

Absent interest retains the existing global subscription. For scoped
subscribers, EventFeed delivers global events and events whose routed Location
set intersects the requested union. It selects recipients before encoding,
then encodes the normal event once for all recipients.

### Client connection

```ts
export interface EventInterest {
  readonly locations: readonly LocationRef[]
  readonly sessions?: readonly string[]
}

export type ClientConnectionOptions = {
  readonly initialInterest?: EventInterest
  readonly reconnect?: (signal: AbortSignal) => Promise<OpenCodeClient>
  readonly onEvent: (event: OpenCodeEvent) => void
  // Existing options remain.
}

export interface ClientConnection {
  readonly status: () => ClientConnectionStatus
  readonly attempt: () => number
  readonly error: () => string | undefined
  readonly growInterest: (interest: EventInterest) => Promise<void>
}
```

`growInterest` unions new Locations and followed Session IDs into the desired
set and serializes replacements. Removing interest is deliberately deferred:
conservative retention avoids reopening streams during tab churn and avoids
having to define when cached state stops being live.

## Private wire protocol

Use a versioned ASCII request header:

```http
X-OpenCode-Event-Interest: <percent-encoded JSON>
```

Decoded value:

```json
{
  "v": 1,
  "clientID": "random-client-id",
  "subscriptionID": "random-subscription-id",
  "replaces": "previous-subscription-id",
  "locations": [
    {
      "directory": "/project",
      "workspaceID": "wrk_example"
    }
  ],
  "followSessions": ["ses_example"]
}
```

`replaces` is absent on initial connection and reconnect. An absent header is
legacy global mode. A malformed explicit header must return `400`; silently
falling back to global would unexpectedly broaden delivery.

The generated Promise client already accepts arbitrary headers through
`RequestOptions` ([`generated/client.ts`](/packages/client/src/promise/generated/client.ts#L264-L309)),
while the current method remains
`event.subscribe(requestOptions?)`
([`generated/client.ts`](/packages/client/src/promise/generated/client.ts#L1597-L1602)).
This avoids the generated signature churn caused by adding typed endpoint
input.

### Control frames

Use the existing optional `server.connected.metadata` field for private
transport control. Normal event payloads remain unchanged. The connection
layer intercepts these frames before forwarding events to the data layer.

Replacement readiness:

```json
{
  "id": "evt_example",
  "type": "server.connected",
  "metadata": {
    "opencode.event-feed": {
      "v": 1,
      "kind": "ready",
      "subscriptionID": "new",
      "replaces": "old",
      "handoff": "paired"
    }
  },
  "data": {}
}
```

Paired queue barrier:

```json
{
  "id": "evt_example",
  "type": "server.connected",
  "metadata": {
    "opencode.event-feed": {
      "v": 1,
      "kind": "barrier",
      "subscriptionID": "new",
      "replaces": "old"
    }
  },
  "data": {}
}
```

The Protocol already permits arbitrary metadata on `server.connected`
([`groups/event.ts`](/packages/protocol/src/groups/event.ts#L8-L25)). The
initial or true reconnect readiness frame is forwarded once as the ordinary
`server.connected` event. Handoff readiness and barrier frames are transport
control only and must not trigger hydration.

## Paired-barrier protocol

Opening replacement subscription `new`, which names active subscription `old`
in `replaces`, performs one synchronous EventFeed critical section:

1. Find `old` by `clientID` and `subscriptionID`.
2. Register `new` with the expanded Location union.
3. Offer the same barrier to `old.queue`.
4. Offer the same barrier to `new.queue`.
5. Return `paired` only if both barrier offers succeeded.

No ordinary event fan-out may interleave between registration and either
barrier offer. The current queue mutation and fan-out use synchronous
`Queue.offerUnsafe` operations
([`event-feed.ts`](/packages/server/src/event-feed.ts#L48-L68)), so the critical
section can remain local to EventFeed.

The old-side barrier is essential. A new-side readiness marker proves only
that the replacement was registered. An event published before registration
may still be buffered in the old network stream; closing old at new readiness
would discard that unseen prefix. Seeing the paired barrier on old proves that
the old reader drained through the same server-side cut.

The resulting partition is:

```text
old:  ... events before cut ... | barrier | discarded suffix
new:                            | barrier | accepted suffix ...
```

No event can fall between replacement registration and the barriers. This
removes both the overlap duplication window and the old-backlog loss window
without assigning a cursor to every public event.

## Client state machine

| State | Behavior |
| --- | --- |
| `stable(old)` | Apply ordinary events from old. |
| `opening(old,new)` | Keep old authoritative; consume new without projecting it. |
| `old-cut` | Old barrier observed; buffer later old events. |
| `new-cut` | New barrier observed; buffer later new events. |
| `commit` | After both barriers, discard the old suffix, publish the new suffix in order, install new, and abort old. |
| `rollback` | If new fails while old survives, discard the new buffer, publish the buffered old suffix, and continue old. |
| `uncertain` | If old fails before its barrier, prefix completion is unknowable; reconnect and bootstrap. |
| `reconnecting` | Open one stream for the latest desired union; publish one real `server.connected`. |

Interest growth does not change the externally visible connection status.
Only loss of the authoritative stream enters `reconnecting`.

The existing 10 ms client batch can remain
([`connection.ts`](/packages/client/src/solid/connection.ts#L40-L61)). Old
events are appended before the old barrier is processed, and the replacement
suffix is appended only after both barriers, preserving the feed-observed
partition in the pending batch.

If the new stream fails after the old barrier but before commit, the client
continues consuming and buffering the old suffix until it either rolls back or
establishes another replacement. Client buffers need a finite bound; exceeding
it is an uncertain handoff and requires normal reconnect/bootstrap behavior.

## Bootstrap

For a persisted tab or externally selected Session whose Location is not yet
known:

1. Fetch `session.get(sessionID)` to discover Location A.
2. Grow interest with Location A and `followSessions: [sessionID]`.
3. Wait for the paired handoff.
4. Fetch the Session again.
5. If it now reports Location B, grow again and repeat.
6. Hydrate messages, pending inputs, permissions, forms, and Location state.

The second read closes the ownership-discovery race. A move before A was
covered is visible in the second read; a move after A was covered is handled by
the move-follow bridge below.

The current tab prefetch already first resolves Session metadata and then
derives the represented Locations
([`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L276-L320)).
It can call `growInterest` between those stages without moving connection
ownership below `SessionTabsProvider`.

### Snapshot limitation

Current HTTP snapshots do not return an EventFeed or durable aggregate
watermark. Therefore no generic ordering can make snapshot plus live events
exact:

- Fetching before subscription leaves a loss window.
- Subscribing before fetching lets an older HTTP response overwrite a newer
  live projection.
- Buffering during the fetch can replay an event already reflected in the
  snapshot.
- Text, reasoning, and tool-input deltas append non-idempotently
  ([`data.ts`](/packages/client/src/solid/data.ts#L851-L899),
  [`data.ts`](/packages/client/src/solid/data.ts#L960-L984)).
- Message cursors paginate by message ID; they are not event watermarks
  ([`handlers/message.ts`](/packages/server/src/handlers/message.ts#L11-L25)).

Durable ending events carry complete values for text, reasoning, and tool
input, so eventual terminal state can repair missed transient fragments
([`session-event.ts`](/packages/schema/src/session-event.ts#L369-L482)). Exact
rendering of every ephemeral fragment during bootstrap cannot be promised.

## Move-follow bridge

`session.moved` reaches both source and destination subscribers, but later
Session events use only the destination
([`bus.ts`](/packages/core/src/bus.ts#L241-L249)). A client-only handoff begins
too late to prevent a destination gap: execution can resume at the destination
immediately after the move
([`runner/llm.ts`](/packages/core/src/session/runner/llm.ts#L81-L100),
[`execution.ts`](/packages/core/src/session/execution.ts#L88-L103)).

EventFeed should bridge only Sessions explicitly listed in `followSessions`.
When a matching subscriber accepts `session.moved`, it adds the destination to
that subscriber's effective Location set before enqueueing the move:

```ts
if (
  subscriber.followSessions.has(event.data.sessionID) &&
  accepts(subscriber, scope)
) {
  subscriber.locations.add(locationKey(event.data.location))
}
```

Subsequent destination events then continue through the old stream while the
client reifies the expanded union with a normal paired handoff. The Bus routing
tests already verify dual-owner move delivery and post-move destination routing
([`bus-session-routing.test.ts`](/packages/core/test/bus-session-routing.test.ts#L70-L91))
and preserve the same semantics in move batches
([`bus-session-routing.test.ts`](/packages/core/test/bus-session-routing.test.ts#L252-L269)).

Do not follow every Session moving from an interested Location. A Location
feed sees unrelated Sessions too; automatically following all of them would
cause unbounded accidental scope growth. For a TUI-initiated move, pre-growing
the known destination before the move request is an additional safeguard.

## Barrier, cursor, and replay alternatives

| Mechanism | Result |
| --- | --- |
| Overlap only | New is live before old closes, but old network backlog can still be lost. |
| Event-ID deduplication | Can remove equality duplicates, but IDs do not define publication order or a cut. Producers may provide IDs through `PublishOptions` ([`bus.ts`](/packages/core/src/bus.ts#L91-L98)). |
| New-side readiness | Proves replacement registration, not old-prefix delivery. |
| Paired barrier | Defines an exact old-prefix/new-suffix cut while both streams remain healthy. |
| Cursor without retention | Detects or deduplicates a gap but cannot recover it. |
| Cursor plus replay ring | Can recover short gaps within one server epoch, but requires retained frames, retained routing snapshots, cursor-aware wire parsing, and an explicit expired-cursor result. |
| Durable Session sequence | Replays ordered durable facts for one Session, but does not cover ephemeral, Location, or global events. |

Event IDs are normally time-ascending at creation
([`identifier.ts`](/packages/schema/src/identifier.ts#L14-L29)), but they may be
created before publication, supplied by callers, or published concurrently.
They are suitable for identity, not a global feed cursor.

The existing experimental Session log has a valid replay-to-live watermark
([`bus.ts`](/packages/core/src/bus.ts#L828-L870),
[`groups/session.ts`](/packages/protocol/src/groups/session.ts#L646-L663)). It
could later repair durable per-Session gaps, but it cannot make the one SSE
feed exact for ephemeral or non-Session events.

## Guarantees

With a healthy old stream, healthy replacement stream, and successful paired
barrier:

- Events for the previous Location union hand off without loss.
- Ordinary events are not duplicated across the old/new partition.
- Feed-observed ordering is preserved across the partition.
- Global events use the same cut and are not duplicated.
- Events for newly added Locations are covered from replacement registration
  onward.
- Followed Session moves remain continuously covered through the bridge.
- Legacy subscriptions remain global and receive no handoff control frames.

These are feed-observed ordering guarantees, not a new global causal order.
Durable sequencing is per aggregate
([`bus.ts`](/packages/core/src/bus.ts#L149-L160)); different aggregates share no
durable sequence.

## Limitations

With the current volatile feed, the design cannot guarantee:

- Recovery of events for a new Location that occurred before replacement
  registration.
- Recovery of any event while all streams were disconnected.
- Replay of ephemeral deltas after reconnect, overflow, server restart, or
  process death.
- Exact snapshot/live reconciliation without snapshot watermarks.
- Destination continuity for a moved Session not listed in `followSessions`.
- Delivery after a subscriber exceeds the bounded queue capacity
  ([`event-feed.ts`](/packages/server/src/event-feed.ts#L8-L13),
  [`event-feed.ts`](/packages/server/src/event-feed.ts#L64-L68)).
- Preservation of current streams after an encoding failure, which currently
  fails all subscribers
  ([`event-feed.ts`](/packages/server/src/event-feed.ts#L41-L60)).

Reconnect must use the latest desired union, publish one real
`server.connected`, and let current active UI owners rehydrate. A feed cursor
without retained events would not strengthen this guarantee.

## Carry surface

The downstream patch can remain localized:

| Area | Change |
| --- | --- |
| [`packages/core/src/bus.ts`](/packages/core/src/bus.ts) | Add routed observation without exposing the route `WeakMap`. |
| [`packages/core/test/bus-session-routing.test.ts`](/packages/core/test/bus-session-routing.test.ts) | Assert explicit scopes for creation, moves, forks, batches, deletion, and replay. |
| [`packages/server/src/event-feed.ts`](/packages/server/src/event-feed.ts) | Store union interests, filter recipients, pair subscriptions, insert barriers, and bridge followed moves. |
| [`packages/server/src/handlers/event.ts`](/packages/server/src/handlers/event.ts) | Parse the private header and emit readiness metadata. |
| [`packages/server/test/event-feed.test.ts`](/packages/server/test/event-feed.test.ts) | Cover union routing, atomic barriers, rollback, overflow, and move following. |
| [`packages/client/src/solid/connection.ts`](/packages/client/src/solid/connection.ts) | Add monotone interest and the two-reader handoff state machine. |
| TUI client and tab contexts | Supply initial Location, derive tab Locations, pin Session IDs, and pre-grow known moves. |

This intentionally avoids `packages/protocol`, generated clients, and the CLI,
ACP, and mini stream call sites affected by typed endpoint input. The principal
cost is monotone scope growth: a very long-lived TUI that visits many Locations
will gradually broaden its feed. Shrinking should be a separate design with an
explicit cache-liveness policy.

## Cross-references

- [Original bus-smart design](/.design/bus-smart/bus-smart.glm53.md) establishes
  the global-firehose diagnosis, Bus ownership of routing, and the benefits of
  filtering before EventFeed queue admission. This note replaces its
  single-Location TUI subscription with a Location union.
- [Downstream-patch assessment](/.design/bus-smart/review0.gpt56s.md) identifies
  multi-Location tabs, provider-tree constraints, generated-client churn, and
  bootstrap as blockers for the original proposal. The private header,
  `SessionTabsProvider` interest updates, and paired handoff directly address
  those constraints.
- [`Bus Session routing tests`](/packages/core/test/bus-session-routing.test.ts)
  remain the behavioral oracle for route scopes, especially dual-owner moves,
  slow subscribers, forks, batches, and replay.
- [`EventFeed tests`](/packages/server/test/event-feed.test.ts) define the
  encode-once, bounded-queue, public-event, and per-subscriber failure behavior
  that the union feed should preserve.
- [`Session log protocol`](/packages/protocol/src/groups/session.ts#L646-L663)
  is the existing durable recovery mechanism for one aggregate. It is useful
  future work but does not replace the volatile union feed.
