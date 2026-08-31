---
type: Research
title: Controlled SSE subscriptions for changing Location interest
description: Evaluate control planes that update one live event subscription as a TUI's Location interest set changes.
resource: /design/bus-smart/research-controlled-sse0
tags: [server, events, tui, sse, websocket, sequencing, security, downstream-patch]
status: draft
generated: { by: "agent:gpt-5.6-sol#xhigh", at: 2026-08-31T05:53:17Z }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: initial-design
    resource: /.design/bus-smart/bus-smart.glm53.md
    title: bus-smart location-scoped event feed
  - id: downstream-review
    resource: /.design/bus-smart/review0.gpt56s.md
    title: bus-smart downstream-patch assessment
  - id: stream-alternatives
    resource: /.design/bus-smart/location-streams0.gpt56s.md
    title: bus-smart location streams and controlled subscriptions
  - id: bus
    resource: /packages/core/src/bus.ts
    title: Bus routing and publication
  - id: event-feed
    resource: /packages/server/src/event-feed.ts
    title: EventFeed queue fan-out
  - id: event-handler
    resource: /packages/server/src/handlers/event.ts
    title: SSE event handler
  - id: event-protocol
    resource: /packages/protocol/src/groups/event.ts
    title: Public event endpoint
  - id: client-connection
    resource: /packages/client/src/solid/connection.ts
    title: Solid event connection and reconnect loop
  - id: tui-tabs
    resource: /packages/tui/src/context/session-tabs.tsx
    title: TUI multi-Location tab state
---

# Controlled SSE subscriptions for changing Location interest

## Finding

The full TUI needs one live subscription whose Location interest is mutable. A
static Location is incorrect because the active route and open tabs can span
projects. Reopening SSE whenever interest changes is also incorrect: every new
stream emits `server.connected`, triggers broad hydration, and can invalidate
all cached reads.

The preferred design is therefore:

1. Keep one SSE and its bounded subscriber queue alive.
2. Assign that live subscriber an opaque ID and control token.
3. Replace its complete Location interest set through an authenticated HTTP
   control request.
4. Serialize event admission and interest replacement inside EventFeed.
5. Mark the exact old-interest/new-interest cut in the same SSE queue.
6. Follow tracked Sessions across moves before a client round trip can occur.

This retains SSE for the high-volume server-to-client path and uses HTTP only
for occasional control. WebSocket is cleaner only if the event transport is
expected to gain substantial bidirectional behavior.

## Existing constraints

The current endpoint has no input and is explicitly volatile
([`event.ts`](/packages/protocol/src/groups/event.ts#L28-L45)). The Promise
client opens one GET and parses only SSE `data:` fields; it does not expose
response headers, SSE IDs, named events, or comments
([`generated/client.ts`](/packages/client/src/promise/generated/client.ts#L342-L397)).
SSE therefore cannot carry client-to-server interest updates, and a server
generated subscription ID must either arrive in the first data frame or be
created through a separate request before the GET.

The connection requires `server.connected` as its first frame and opens a fresh
iterator after failure
([`connection.ts`](/packages/client/src/solid/connection.ts#L63-L145)). A
connection-status transition away from connected invalidates every cached read
([`data.ts`](/packages/client/src/solid/data.ts#L1980-L1983)), while each domain
`server.connected` starts broad hydration
([`data.ts`](/packages/client/src/solid/data.ts#L528-L556)). An interest update
must not reconnect or emit another domain connected event.

EventFeed already owns one dropping queue per subscriber, per-subscriber
overflow failure, encode-once fan-out, and scope cleanup
([`event-feed.ts`](/packages/server/src/event-feed.ts#L33-L80)). It is the right
owner for mutable admission state. Bus remains the only owner of event routing:
its publication-time route snapshots cover cold ownership, forks, moves, and
slow subscribers
([`bus.ts`](/packages/core/src/bus.ts#L204-L260)).

## Shared routing seam

Server should not inspect Bus's event-identity `WeakMap` through a public
predicate. Bus should deliver an immutable publication-time audience to one
server-facing observer:

```ts
export type EventAudience =
  | { readonly type: "global" }
  | {
      readonly type: "locations"
      readonly refs: ReadonlyArray<Location.Ref>
    }

export type RoutedSubscriber = (
  event: Event.Payload,
  audience: EventAudience,
) => Effect.Effect<void>

export interface BusInterface {
  readonly listenRouted: (
    subscriber: RoutedSubscriber,
  ) => Effect.Effect<Bus.Unsubscribe>
}
```

`global` means every controlled subscriber receives the event. `locations: []`
means no scoped subscriber receives it. This distinction preserves the current
filter at [`bus.ts`](/packages/core/src/bus.ts#L726-L762): an unresolved Session
event with a known empty route is not a global event.

## Variant A: attached SSE plus control POST

This is the recommended control plane.

### Interfaces

```ts
export type EventInterest =
  | { readonly mode: "all" }
  | {
      readonly mode: "locations"
      readonly locations: ReadonlyArray<Location.Ref>
      readonly followSessions: ReadonlyArray<SessionID>
    }

export interface EventFeedSubscription {
  readonly id: string
  readonly controlToken: string
  readonly revision: number
  readonly stream: Stream.Stream<string, EventFeed.Error>
}

export interface EventFeedInterface {
  readonly subscribe: Effect.Effect<
    EventFeedSubscription,
    never,
    Scope.Scope
  >

  readonly replaceInterest: (input: {
    readonly id: string
    readonly controlToken: string
    readonly revision: number
    readonly interest: EventInterest
  }) => Effect.Effect<
    { readonly revision: number; readonly digest: string },
    SubscriptionNotFound | RevisionConflict | EventFeed.SubscriberOverflowError
  >
}
```

Full replacement is preferable to add/remove commands. It is easy to
normalize, hash, retry idempotently, and restore after reconnect. `mode: "all"`
retains the legacy firehose; `mode: "locations"` always includes global events
plus events whose routed audience intersects the requested or followed
Locations.

### Wire contract

Keep `GET /api/event` input-free. Its current Promise signature remains
`event.subscribe(requestOptions?)`
([`generated/client.ts`](/packages/client/src/promise/generated/client.ts#L1597-L1602)),
so CLI, ACP, mini, and third-party call sites do not shift argument positions.

The first `server.connected` data frame carries capability metadata through its
existing optional `metadata` field:

```json
{
  "id": "evt_connected",
  "type": "server.connected",
  "metadata": {
    "eventSubscription": {
      "protocol": 1,
      "id": "sub_random",
      "controlToken": "secret_random",
      "revision": 0
    }
  },
  "data": {}
}
```

The update uses normal server authentication and a per-stream capability:

```text
POST /api/event/subscriptions/:id/interest
x-opencode-event-control-token: <token>
content-type: application/json
```

```json
{
  "revision": 1,
  "interest": {
    "mode": "locations",
    "locations": [
      { "directory": "/work/a" },
      { "directory": "/work/b", "workspaceID": "wrk_example" }
    ],
    "followSessions": ["ses_visible", "ses_background_tab"]
  }
}
```

An upstream-quality protocol should define a distinct
`server.event.subscription.updated` control frame. `createClientConnection`
intercepts it before `onEvent`; it never reaches the domain projection or
triggers connected hydration.

### Revision and marker ordering

Event publication and interest replacement must pass through one EventFeed
serialization point. A replacement performs this operation:

1. Find the live subscriber and verify its control token.
2. Normalize and bound the interest set.
3. Accept only `current revision + 1`.
4. Return success for an exact retry of the current revision and digest.
5. Enqueue an in-band applied marker as the interest cut.
6. Install the new requested and followed sets without releasing serialization.
7. Return the HTTP response.

Ordinary event selection and queue admission use the same serialization point.
Frames before the marker were admitted under old interest; frames after it are
admitted under new interest. The HTTP response can overtake the SSE marker on
the network, so the client activates a revision only when it observes the
marker. It keeps one control request in flight and coalesces newer desired state
to the latest full replacement.

Already queued events from a removed Location may arrive after the marker.
That bounded overdelivery is safe and preferable to mutating FIFO history.
Client-side ownership guards remain defense in depth.

### Move handoff

A control POST alone leaves a real move gap. Bus sends `session.moved` to both
old and destination Locations, then routes later Session events only to the
destination
([`bus.ts`](/packages/core/src/bus.ts#L241-L250)). The server can publish that
suffix before the client sees the move and updates its Location set.

Controlled subscriptions close the gap with followed Session IDs. Each
subscriber stores:

```ts
{
  requestedLocations: Set<LocationKey>
  followSessions: Set<SessionID>
  followedLocations: Map<SessionID, Location.Ref>
}
```

Before EventFeed queues `session.moved` for a followed Session, it records the
destination in `followedLocations`. Effective interest is requested Locations
plus those server-observed destinations. Later destination events therefore
enter the same queue without waiting for HTTP. A later full replacement removes
a closed tab from `followSessions`, which releases its handoff. The client sends
only stable Session IDs, never a claimed owner, so a stale request cannot move a
Session back to an old Location.

### TUI and reconnect

`SessionTabsProvider` is the natural interest producer. It already has client,
data, route, current Location, tab state, and resolved tab Locations
([`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L53-L65),
[`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L276-L320)). The
requested set includes the current route and all open-tab Locations. The
followed set includes visible and open-tab Session families whose live state
must survive movement.

The subscription starts in `all` mode because ClientProvider is outside the
Location, Data, and tabs providers. Unknown persisted tabs keep it broad while
metadata resolves. `createClientConnection` exposes `replaceInterest`, letting
the inner tabs provider downscope without rearranging the provider tree.

A stream failure destroys the registry entry. The client retains only desired
interest, reconnects through the existing managed-service path, obtains a new
subscription identity, resets revision to zero, and sends the complete latest
set. Stale responses are ignored by connection generation and subscription ID.
This adds no replay claim: events during disconnection remain missed under the
existing volatile contract.

## Variant B: prepared subscription

A prepared subscription moves initial interest before the SSE GET:

```text
POST /api/event/subscriptions
```

```json
{
  "interest": {
    "mode": "locations",
    "locations": [{ "directory": "/work/a" }],
    "followSessions": ["ses_visible"]
  }
}
```

The response contains a subscription ID and short-lived, single-use attachment
ticket. The client then opens `GET /api/event` with the ticket in a private
header or query parameter. Attachment consumes the ticket and creates the
queue. An unused prepared record holds no Bus subscription or event buffer and
expires quickly.

This avoids the brief `all` bootstrap and starts every reconnect with complete
interest. It costs another round trip plus ticket issuance, expiry, consumption,
and attach races. Browser `EventSource` cannot set a ticket header, and the
Effect event API currently exposes neither input nor request options
([`api.ts`](/packages/client/src/effect/api/api.ts#L1576-L1581)). A clean public
version therefore creates more generated surface than attached control.

Do not retain queues across disconnect while waiting for reattachment. That
would add replay, overflow, and resource-lifetime semantics unrelated to this
fix. Reconnect should prepare a fresh subscription.

## Variant C: WebSocket

A WebSocket can carry `interest.replace`, `interest.applied`, and event frames
on one bidirectional channel. It starts paused, accepts a complete initial
interest, enqueues `interest.applied`, and then begins delivery. This provides a
clear client protocol but does not remove EventFeed serialization or followed
Session handling: concurrent Bus publication and socket input still need one
server-side admission order.

Browser WebSockets cannot set Basic headers. The route therefore needs the same
authenticated connect-ticket, Origin validation, one-writer queue, and detach
finalizer used by PTY sockets
([`authorization.ts`](/packages/server/src/middleware/authorization.ts#L50-L55),
[`pty.ts`](/packages/server/src/handlers/pty.ts#L119-L141),
[`pty.ts`](/packages/server/src/handlers/pty.ts#L180-L220)). It also needs a
parallel hand-written client because WebSocket endpoints are not represented by
the normal generated event-stream client.

WebSocket is justified if future work adds acknowledgements, replay cursors, or
frequent client commands. Occasional Location replacements do not justify its
transport, ticket, proxy, and lifecycle carry cost.

## Security and race requirements

| Risk | Required behavior |
| --- | --- |
| Reordered or retried controls | Full replacement, monotonic revision, and digest-based idempotent retry |
| Response after reconnect | New random subscription ID per stream and client generation guard |
| Cross-client mutation | Normal Basic authentication plus an unguessable control token kept out of URLs and logs |
| Cross-origin browser request | JSON and custom header requiring preflight; enforce configured Origin policy |
| Arbitrary Location request | Treat scoping as performance, not authorization; authenticated clients already have the all feed |
| Resource exhaustion | Cap request bytes, normalized Location count, followed Sessions, and control rate |
| Close during control | Atomically remove the registry entry in the stream scope finalizer; return not-found or closed |
| Overflow during replacement | Fail the stream and do not report an active revision whose marker was not queued |
| Removed Location tail | Allow bounded overdelivery from frames already in FIFO |
| Move before client POST | Update the server-observed destination for followed Sessions before queueing the move |
| Server restart | Lose ephemeral registry state, disconnect SSE, and restore full desired interest on reconnect |
| Cloned event payload | Use Bus-provided immutable audience, never an exported identity-sensitive route lookup |

Location equality must remain the Bus's exact directory and workspace equality
([`bus.ts`](/packages/core/src/bus.ts#L733-L739)). The control plane must not add
realpath or Location service loading semantics.

## Carry comparison

| Variant | Existing GET signature | New lifecycle state | Ordering and move safety | Downstream carry |
| --- | --- | --- | --- | --- |
| Attached SSE plus control POST | Unchanged | Live registry, revision, token | Strong with marker and followed Sessions | Lowest real fix |
| Prepared subscription | Header-compatible; typed clients need support | Ticket, expiry, attach, live registry | Strong after attachment | Medium-high |
| WebSocket | Parallel transport | Ticket, socket, input and output loops | Strong same-channel protocol, same move follow | Highest |

A typed control endpoint and explicit marker change Protocol and generated
clients, but they do not change the existing subscribe argument positions. This
avoids the broad call-site churn identified in the downstream review. A private
raw route and metadata marker can reduce short-term generated conflicts, but
that is a carrying adaptation rather than the durable upstream interface.

## Recommendation

Implement attached SSE plus a revisioned control POST. Add a Bus routed-audience
observer, keep filtering and mutable subscriber state in EventFeed, represent
interest as full replacements, mark every accepted cut in-band, and pin active
or open-tab Sessions so moves cannot outrun the client control request. Preserve
the legacy unscoped feed for consumers that never negotiate control.

Keep the tracked-Session projection guard as defense in depth. It reduces harm
from legacy or temporarily broad feeds, while controlled SSE removes network,
parse, queue, and projection work at the source.

## Cross-references

- [Initial bus-smart design](/.design/bus-smart/bus-smart.glm53.md) establishes
  the global-firehose diagnosis and Bus-owned routing requirement.
- [Downstream-patch assessment](/.design/bus-smart/review0.gpt56s.md) establishes
  the full TUI's multi-Location behavior and generated-client carry constraint.
- [Location streams and controlled subscriptions](/.design/bus-smart/location-streams0.gpt56s.md)
  compares this control plane with per-Location streams and barriered stream
  replacement; it reaches the same preference for one controlled queue.
- [Bus Session routing tests](/packages/core/test/bus-session-routing.test.ts)
  are the behavioral oracle for forks, moves, batches, replay, and slow
  subscribers.
- [EventFeed tests](/packages/server/test/event-feed.test.ts) define the
  encode-once, bounded-queue, overflow-isolation, and public-event properties
  that controlled subscriptions must retain.
