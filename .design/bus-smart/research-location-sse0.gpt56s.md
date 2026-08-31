---
type: Research
title: Per-Location SSE streams with a dedicated global stream
description: Independent design research for merging one event stream per interested Location with one true-global stream while preserving V2 TUI behavior.
resource: /design/bus-smart/research-location-sse0
tags: [server, events, tui, sse, location, downstream-patch]
status: draft
generated: { by: "agent:gpt-5.6-sol#xhigh", at: 2026-08-31 }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: bus-routing
    resource: /packages/core/src/bus.ts
    title: Bus publication, route snapshots, and Location filtering
    author: project:opencode
    last_modified: 2026-08-31
  - id: event-feed
    resource: /packages/server/src/event-feed.ts
    title: Server event feed fan-out and overflow behavior
    author: project:opencode
    last_modified: 2026-08-31
  - id: event-handler
    resource: /packages/server/src/handlers/event.ts
    title: SSE handler and connected sentinel
    author: project:opencode
    last_modified: 2026-08-31
  - id: client-connection
    resource: /packages/client/src/solid/connection.ts
    title: Solid event connection and reconnect loop
    author: project:opencode
    last_modified: 2026-08-31
  - id: client-projection
    resource: /packages/client/src/solid/data.ts
    title: Solid event projection and hydration behavior
    author: project:opencode
    last_modified: 2026-08-31
  - id: session-events
    resource: /packages/schema/src/session-event.ts
    title: Durable and ephemeral Session event contracts
    author: project:opencode
    last_modified: 2026-08-31
---

# Per-Location SSE streams with a dedicated global stream

## Conclusion

The viable multi-Location shape is one SSE for each distinct Location represented
by the visible route or an open tab, plus one SSE carrying only events whose Bus
delivery is genuinely global. It must not be implemented by opening several
ordinary `Bus.subscribe()` streams: a Location subscription currently includes
global events, so that approach duplicates every global event once per Location.

The smallest durable downstream patch uses a private request header rather than a
new Protocol endpoint input. Existing unscoped requests remain the all-events
firehose, generated client signatures do not change, and a scoped
`server.connected` sentinel negotiates support with older servers. The required
code surface is Core routing, Server feed and handler, Client connection, and TUI
interest management. Protocol, generated clients, CLI, ACP, and other unscoped
consumers remain unchanged.

## Existing constraints

The Bus already computes the difficult routing facts. It snapshots Session
ownership separately from the public payload, including creation, forks, moves,
deletion, explicit Location overrides, and cold database lookup
([`bus.ts` lines 205-260](/packages/core/src/bus.ts#L205-L260)). Its Location
filter treats a routed event as local only when the subscriber matches one of the
snapshot refs; otherwise an explicitly located event is local to that ref and an
unlocated non-routed event is global
([`bus.ts` lines 726-762](/packages/core/src/bus.ts#L726-L762)).

The current EventFeed bypasses those semantics through the global `bus.listen`
surface, encodes once, and offers the frame to every bounded subscriber queue
([`event-feed.ts` lines 33-80](/packages/server/src/event-feed.ts#L33-L80)). The
handler acquires the feed and prepends `server.connected` before merging the
heartbeat ([`handlers/event.ts` lines 12-33](/packages/server/src/handlers/event.ts#L12-L33)).

The generated Promise client already accepts arbitrary request headers
([`generated/client.ts` lines 264-300](/packages/client/src/promise/generated/client.ts#L264-L300)),
while the no-input event method keeps the useful
`event.subscribe(requestOptions?)` shape
([`generated/client.ts` lines 1597-1602](/packages/client/src/promise/generated/client.ts#L1597-L1602)).
Adding `LocationQuery` would instead change that signature and force unrelated
call-site and generated-file churn.

## Bus interface

Server needs a behavior-oriented routed observation. It should not receive a
public predicate that reaches back into the payload-identity-sensitive route
`WeakMap`.

```ts
export type Delivery =
  | {
      readonly type: "global"
    }
  | {
      readonly type: "locations"
      readonly refs: readonly Location.Ref[]
    }

export type RoutedEvent = {
  readonly event: Event.Payload
  readonly delivery: Delivery
}

export type RoutedSubscriber = (input: RoutedEvent) => Effect.Effect<void>

export interface Interface {
  // Existing publish, subscribe, log, and listen members remain unchanged.
  readonly observeRouted: (subscriber: RoutedSubscriber) => Effect.Effect<Unsubscribe>
}
```

`observeRouted` receives an immutable publication-time delivery snapshot:

```ts
const refs = routes.get(event)

if (refs !== undefined) {
  return { type: "locations", refs: deduplicateLocations(refs) }
}
if (event.location) {
  return { type: "locations", refs: [event.location] }
}
return { type: "global" }
```

The distinction between `undefined` and `[]` matters. An unresolved Session event
with an empty route is not global merely because no Location can receive it.
Same-Location move refs should be deduplicated. The callback receives the routing
value, not a predicate with undocumented identity and timing requirements.

This can preserve current publication order because `notify` already invokes
listeners before the typed and live PubSubs
([`bus.ts` lines 494-504](/packages/core/src/bus.ts#L494-L504)).

## EventFeed interface and matching

```ts
export type FeedScope =
  | { readonly type: "all" }
  | { readonly type: "global" }
  | { readonly type: "location"; readonly ref: Location.Ref }

export interface Interface {
  readonly subscribe: (
    scope?: FeedScope,
  ) => Effect.Effect<Stream.Stream<string, Error>, never, Scope.Scope>
}
```

Omitted scope defaults to `all`. Each subscriber stores its queue and scope.
Filtering occurs before encoding and queue admission:

```ts
function accepts(scope: FeedScope, delivery: Bus.Delivery) {
  if (scope.type === "all") return true
  if (scope.type === "global") return delivery.type === "global"
  if (delivery.type !== "locations") return false
  return delivery.refs.some((ref) => sameLocation(ref, scope.ref))
}
```

This retains the useful EventFeed properties: public-event filtering before
capacity is consumed, one bounded queue per subscriber, per-subscriber overflow,
and one encoding for all matching subscribers. A busy Location can overflow and
reconnect without taking down the global stream or another Location.

## Private wire negotiation

Use explicit private request headers:

```text
x-opencode-event-scope: global
```

```text
x-opencode-event-scope: location
x-opencode-directory: <percent-encoded directory>
x-opencode-workspace: <workspace ID when present>
```

Absent `x-opencode-event-scope` means `all`. Scope must be explicit because some
clients may already carry default directory headers. A Location-scoped request
must also supply an explicit directory; it must not accidentally inherit
`requestRef`'s `process.cwd()` fallback
([`location.ts` lines 69-78](/packages/server/src/location.ts#L69-L78)).

The scoped connected sentinel acknowledges the private contract through the
already opaque event metadata field:

```json
{
  "type": "server.connected",
  "metadata": {
    "opencode.event-feed": {
      "version": 1,
      "scope": "location",
      "location": {
        "directory": "/workspace",
        "workspaceID": "wrk_example"
      }
    }
  },
  "data": {}
}
```

The public schema already permits metadata without adding a new generated field
([`groups/event.ts` lines 8-25](/packages/protocol/src/groups/event.ts#L8-L25)).
Unscoped requests retain the existing sentinel exactly.

The client opens only the requested global stream at first. An acknowledged
sentinel enables multi-stream mode. If an older server returns a sentinel without
the acknowledgment, that same connection becomes the single legacy all-events
stream and no Location streams are opened. This avoids multiplying the firehose
against an older server that silently ignores private headers.

## Client interest interface

```ts
export type LocationInterest = {
  readonly ref: LocationRef
  readonly role: "active" | "tab"
  readonly sessionIDs: readonly string[]
  readonly prepare?: (
    reason: "subscribe" | "reconnect" | "handoff" | "order-repair",
    signal: AbortSignal,
  ) => Promise<void>
}

export type ClientConnection = {
  readonly status: () => ClientConnectionStatus
  readonly attempt: () => number
  readonly error: () => string | undefined
  readonly interests: {
    replace: (locations: readonly LocationInterest[]) => void
  }
}
```

The connection owns one reader per canonical Location key and one global reader.
`replace` opens additions immediately and removes unused Locations conservatively
after a grace period. New streams subscribe before `prepare` runs, so server-side
queues capture events published during HTTP hydration. Location connected
sentinels are transport controls and never enter the application emitter; only
the global sentinel produces the existing broad `server.connected` behavior.

`SessionTabsProvider` is the natural TUI controller. It is below Client, Data, and
Location providers in the current tree
([`app.tsx` lines 376-424](/packages/tui/src/app.tsx#L376-L424)), and already knows
the route, open tabs, tab scope, loaded Session families, and resolved Locations.
Its preload resolves Session metadata and distinct tab Locations
([`session-tabs.tsx` lines 276-305](/packages/tui/src/context/session-tabs.tsx#L276-L305)),
then fetches messages, pending input, permissions, and forms
([`session-tabs.tsx` lines 307-320](/packages/tui/src/context/session-tabs.tsx#L307-L320)).
Those reads form the natural `prepare` operation.

The desired set includes the visible Home or Session Location, every open tab's
resolved Location, and every loaded family member's Location because tab status
and attention aggregate descendants. Optimistic creation must establish its
Location interest before sending the create request. Unresolved persisted tabs
bootstrap from HTTP Session reads after the global stream connects rather than
falling back to the firehose.

## Merge and deduplication

The merge should preserve current 10 ms Solid batching
([`connection.ts` lines 52-60](/packages/client/src/solid/connection.ts#L52-L60))
without claiming a total event order that the domain does not provide.

1. Complete the global capability handshake and emit its `server.connected`
   before releasing Location events.
2. Preserve FIFO order inside every source reader.
3. Keep a bounded Event-ID cache and drop exact duplicates only after choosing the
   canonical copy.
4. Track the highest projected durable `seq` per `aggregateID`.
5. Accept forward sequence gaps. Public durable sequences are not contiguous:
   internal `session.usage.recorded` participates in the aggregate sequence but
   is excluded from the public event manifest
   ([`session-event.ts` lines 672-679](/packages/schema/src/session-event.ts#L672-L679)),
   and forks may reserve inherited sequence prefixes.
6. If an unseen durable event arrives below the highest projected sequence, do
   not apply it. Trigger targeted `order-repair` hydration because applying it can
   regress title, location, execution, or transcript state.
7. Do not semantically deduplicate ephemeral events. Only an identical Event ID
   proves duplication.

No order is required across aggregates or between true-global and Location
events. Durable Session events do require monotonic per-aggregate projection.
The Bus holds the aggregate lock through durable notification
([`bus.ts` lines 469-475](/packages/core/src/bus.ts#L469-L475)) and publishes a
durable batch in committed order
([`bus.ts` lines 575-664](/packages/core/src/bus.ts#L575-L664)).

Ephemeral publication is not aggregate-locked
([`bus.ts` lines 479-482](/packages/core/src/bus.ts#L479-L482)). The LLM event
publisher explicitly rejects cross-source order requirements and expects folding
by IDs and ordinals
([`publish-llm-event.ts` lines 63-74](/packages/core/src/session/runner/publish-llm-event.ts#L63-L74)).
Text, reasoning, and tool-input deltas are live-only and end at durable full-value
boundaries ([`session-event.ts` lines 369-482](/packages/schema/src/session-event.ts#L369-L482));
tool terminal events are self-contained
([`session-event.ts` lines 497-543](/packages/schema/src/session-event.ts#L497-L543)).
Therefore ephemeral recovery across a disconnect remains best effort, as it is
today.

## Session moves

A move is the normal event intentionally routed to two Location streams. The
client maintains Session ownership seeded from hydrated interests and
`session.created`.

1. Determine the old owner and destination from ownership state and the move
   payload.
2. If both Location streams were already connected when the first copy arrives,
   hold later events for that Session until both move copies arrive.
3. Drain the old stream through its move copy, emit the move once, update
   ownership, and release destination events after its copy.
4. If the destination was not already interested, process the move after the old
   FIFO prefix, immediately open a temporary destination interest, retain the old
   stream through the handoff grace period, and run `prepare("handoff")`.
5. If only the destination is interested, hydrate before releasing subsequent
   destination events because no old prefix is available.
6. Collapse a same-Location move to one delivery.

The Bus routing tests establish dual-owner and same-Location behavior
([`bus-session-routing.test.ts` lines 70-91](/packages/core/test/bus-session-routing.test.ts#L70-L91))
and verify that slow subscribers retain the publication-time old/new snapshot
([`bus-session-routing.test.ts` lines 203-230](/packages/core/test/bus-session-routing.test.ts#L203-L230)).
Normal execution moves occur at a safe runner boundary after closing model
transport and before continuing at the destination
([`runner/llm.ts` lines 67-99](/packages/core/src/session/runner/llm.ts#L67-L99)).

An explicitly located Session event can still split one aggregate across streams
without changing ownership, as permitted by the routing branch at
[`bus.ts` lines 223-249](/packages/core/src/bus.ts#L223-L249). The durable sequence
check and order-repair path are therefore required even with a correct move
rendezvous.

## Reconnect behavior

The global stream owns server generation and endpoint election. Its failure runs
the existing managed-service reconnect once, rebuilds Location streams against
the elected API, and emits one application-level `server.connected`. Location
failures reconnect independently. A background tab's overflow must not invalidate
unrelated Sessions; an active Location failure may expose the existing
`reconnecting` status so visible UI behavior remains familiar.

After each Location reconnect, subscribe first, run targeted
`prepare("reconnect")`, then release queued frames. Preserve the current broad
cache invalidation only for a global generation loss. The current data layer
invalidates all reads whenever the single logical connection is not connected
([`data.ts` lines 1980-1988](/packages/client/src/solid/data.ts#L1980-L1988));
doing that for every background Location reconnect would recreate the refetch
storm this design is intended to remove.

This remains a volatile transport. Exact recovery after disconnection would need
a resumable cursor or HTTP snapshots carrying aggregate sequence watermarks. The
public endpoint explicitly says events during disconnection are missed
([`groups/event.ts` lines 34-42](/packages/protocol/src/groups/event.ts#L34-L42)).
The scoped design should preserve that reliability level rather than claim
exactly-once delivery.

## TUI behavior requiring special treatment

The Open dialog currently protects a global Session list read against concurrent
move and delete events
([`dialog-open.tsx` lines 47-70](/packages/tui/src/component/dialog-open.tsx#L47-L70)),
and App keeps its cached open-session list live from those events
([`app.tsx` lines 1214-1228](/packages/tui/src/app.tsx#L1214-L1228)). A true-global
feed intentionally no longer carries foreign Session lifecycle events.

To preserve the read-race behavior, open a temporary unscoped observer before
issuing the dialog's global list request, wait for its connected sentinel, retain
only move, delete, and displayed status events locally, and close it with the
dialog. It must not feed the shared Solid projection. The brief firehose is a
bounded exception for a UI operation whose interest is genuinely global; it does
not restore permanent foreign delta processing.

## Risks

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Many globally scoped tabs | Many HTTP connections and server queues | Deduplicate exact Locations, opt in only the Bun TUI, remove unused streams conservatively, and define a stream-count fallback. |
| Old server ignores private headers | Every requested stream becomes a firehose | Negotiate on the first global connected sentinel and open no Location streams without acknowledgment. |
| Independent streams race | A lower durable event could regress state | Move rendezvous, per-aggregate high-water checks, and targeted HTTP repair. |
| Ephemeral loss during handoff or reconnect | Brief partial live text or progress | Preserve source FIFO; rely on durable full-value boundaries and hydration, matching the current volatile contract. |
| New Location begins after the move commit | Events can occur before its SSE opens | Open immediately, retain old ownership through grace, and hydrate after the destination subscription is established. |
| Background Location overflow changes global status | Unrelated tabs refetch and UI shows a false outage | Keep source status separate; only global or active-source failure affects the visible logical status. |
| Open dialog expects global lifecycle visibility | Foreign list entries can race or appear stale | Use the temporary filtered all-events observer while the dialog is active and refresh on each open. |
| Unroutable Session events disappear from scoped TUI | Behavior differs from legacy all-feed accidents | Treat this as matching existing Location subscription semantics and cover it in routing tests. |

Server tests should extend the current encode-once, overflow, and public filtering
coverage in [`event-feed.test.ts` lines 47-148](/packages/server/test/event-feed.test.ts#L47-L148)
with simultaneous all, global, old-Location, and new-Location subscribers.

## Cross-references

- [Original location-scoped proposal](/.design/bus-smart/bus-smart.glm53.md) establishes the firehose diagnosis and the Bus-owned routing requirement, but assumes one TUI Location.
- [Downstream-patch assessment](/.design/bus-smart/review0.gpt56s.md) identifies multi-Location tabs, generated-client churn, and the payload-identity hazard that this interface addresses.
