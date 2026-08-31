---
type: Research
title: Event sequencing requirements for scoped SSE feeds
description: Determine the ordering OpenCode's current client projection requires when one logical client receives events from multiple SSE streams.
resource: /design/bus-smart/research-event-sequencing0
tags: [server, client, events, sse, sequencing, tui]
status: draft
generated: { by: "agent:gpt-5.6-sol#xhigh", at: 2026-08-31 }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: event-schema
    resource: /packages/schema/src/event.ts
    title: Event identity, durability, sequence, and Location envelope
  - id: session-events
    resource: /packages/schema/src/session-event.ts
    title: Durable and ephemeral Session event definitions
  - id: bus
    resource: /packages/core/src/bus.ts
    title: Event persistence, publication, and Session routing
  - id: event-feed
    resource: /packages/server/src/event-feed.ts
    title: Public EventFeed queue fan-out
  - id: solid-connection
    resource: /packages/client/src/solid/connection.ts
    title: Solid client SSE connection
  - id: solid-data
    resource: /packages/client/src/solid/data.ts
    title: Solid client arrival-order projection
  - id: tui-tabs
    resource: /packages/tui/src/context/session-tabs.tsx
    title: TUI multi-Location Session tabs
---

# Event sequencing requirements for scoped SSE feeds

## Finding

The current client is an arrival-order projection. It reads one SSE iterator,
keeps iterator order through its 10 ms batch, and synchronously emits each event
to the Solid data layer and TUI consumers
([`connection.ts`](/packages/client/src/solid/connection.ts#L52-L103),
[`client.tsx`](/packages/tui/src/context/client.tsx#L20-L39)). The projection
has no seen-event set, sequence cursor, stale-event guard, or reorder buffer.

Calling the same `onEvent` independently from several SSE streams is therefore
unsafe. The client does not require a meaningful global order between unrelated
Sessions or Locations, but it does require:

- causal order for all events that mutate one Session;
- FIFO for edge-triggered entities within one Location or global scope;
- duplicate suppression across overlapping delivery audiences;
- one logical connection boundary rather than one hydration boundary per
  physical stream.

The smallest transport contract compatible with the existing reducers is one
logical selected-event FIFO. A server-side Location union on one EventFeed queue
satisfies that contract directly. A client-side merge of independent streams
needs explicit handoff barriers or publication watermarks that the current event
envelope does not provide.

## Event classification

Scope and durability are distinct. Every regular payload has an ID, creation
time, optional Location, and data. Only durable payloads carry an aggregate
sequence ([`event.ts`](/packages/schema/src/event.ts#L27-L28),
[`event.ts`](/packages/schema/src/event.ts#L60-L71)). Bus supplies an ambient
Location unless publication is explicitly global
([`bus.ts`](/packages/core/src/bus.ts#L507-L525)).

| Class | Routing and examples | Projection behavior |
| --- | --- | --- |
| Global | A non-Session event with neither a hidden route nor `event.location`. Bus sends it to every scoped subscriber ([`bus.ts`](/packages/core/src/bus.ts#L726-L740)). Credential events explicitly use `global: true` ([`credential.ts`](/packages/core/src/credential.ts#L127-L132)). `server.connected` is a per-SSE control frame, not a Bus publication ([`handlers/event.ts`](/packages/server/src/handlers/event.ts#L12-L24)). | Deliver an edge-triggered event once per logical client. Preserve order for events affecting the same global reducer key. Consume physical `server.connected` frames inside the merger and expose one logical marker. |
| Location-scoped | A non-Session event carrying `event.location`. Solid handles catalog, agent, command, skill, VCS, form, shell, reference, integration, config, websearch, and MCP after its Location guard ([`data.ts`](/packages/client/src/solid/data.ts#L1159-L1241)). Permission and form-attention events are Location-owned despite carrying a `sessionID`. | Distinct Locations are independent. Same-Location lifecycles such as create/exit/delete and asked/replied need FIFO and duplicate suppression. |
| Durable Session | Native Session lifecycle, inbox, execution, transcript boundary, tool, compaction, and revert events ([`session-event.ts`](/packages/schema/src/session-event.ts#L621-L675)). Bus routes these through a publication-time Session owner snapshot; a move reaches both source and destination ([`bus.ts`](/packages/core/src/bus.ts#L209-L250)). | Preserve aggregate and lifecycle causality per Session. Durable `seq` is useful evidence but is not a complete merge cursor. |
| Ephemeral Session | `session.usage.updated`, text and reasoning deltas, tool-input deltas, tool progress, and compaction deltas ([`session-event.ts`](/packages/schema/src/session-event.ts#L147-L155), [`session-event.ts`](/packages/schema/src/session-event.ts#L369-L505), [`session-event.ts`](/packages/schema/src/session-event.ts#L560-L605)). | Preserve source order and placement between durable start and terminal boundaries. No aggregate sequence exists. |

`session.status` and deprecated `session.idle` are separate transitional
ephemeral definitions
([`session-status-event.ts`](/packages/schema/src/session-status-event.ts#L35-L53)).
They are not members of `SessionEvent.All`, so Bus treats them as ordinary
Location/global events rather than applying hidden Session routing. The current
Solid projection ignores both.

## Actual ordering requirements

### Session projection

Events for unrelated Sessions need no order. The LLM event publisher explicitly
forbids relying on a cross-source order and expects consumers to fold by ID or
ordinal ([`publish-llm-event.ts`](/packages/core/src/session/runner/publish-llm-event.ts#L63-L75)).

Within one Session, the current reducers nevertheless require one causal FIFO:

- Transcript rows are appended in arrival order, not sorted by ID, time, or
  durable sequence ([`data.ts`](/packages/client/src/solid/data.ts#L390-L404)).
- `session.step.started` creates the assistant message. Text, reasoning, and
  tool handlers otherwise have no object to mutate
  ([`data.ts`](/packages/client/src/solid/data.ts#L780-L899)).
- Text deltas append while `session.text.ended` replaces the full value. A
  delayed pre-terminal delta applied afterward corrupts the terminal text
  ([`data.ts`](/packages/client/src/solid/data.ts#L851-L870)).
- Inbox enqueue must precede delivery change, delivery, or cancellation. A
  mutation applied first is a no-op, after which a delayed enqueue resurrects
  pending input ([`data.ts`](/packages/client/src/solid/data.ts#L676-L714)).
- Execution start and terminal order directly controls Session and tab busy
  state ([`data.ts`](/packages/client/src/solid/data.ts#L997-L1028),
  [`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L158-L176)).
- Agent/model switches, moves, retries, reverts, shell lifecycle, and
  compaction all derive previous state from the current projection. They are not
  commutative event folds.

A total per-Session delivery order is stronger than the minimum partial order
for independent tools, but it is the smallest simple contract that leaves the
existing projection unchanged.

### Location and global projection

No ordering is needed between unrelated Location keys. Within one Location,
shell and form lifecycles, permission attention, VCS replacement, and direct TUI
actions require FIFO per affected entity. Many catalog/config events merely
invalidate and refetch current state, so duplicate or reordered delivery is
usually a performance problem rather than a final-state error. The transport
should not depend on that implementation detail.

Global events must be emitted once per logical client. Duplicate
`tui.prompt.append` inserts text twice, while duplicate `tui.command.execute`
dispatches twice ([`prompt/index.tsx`](/packages/tui/src/component/prompt/index.tsx#L343-L355),
[`app.tsx`](/packages/tui/src/app.tsx#L1191-L1211)). Every
`server.connected` starts broad Session, Location, VCS, and project hydration
([`data.ts`](/packages/client/src/solid/data.ts#L528-L556)); physical readiness
frames therefore must not all enter the domain emitter.

Tabs make this a multi-Location requirement rather than an active-route-only
requirement. They retain and prefetch Sessions from every represented Location
([`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L276-L320)).
Their background prompt pulse is also edge-triggered and increments for every
received enqueue ([`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L334-L339)).

## Adversarial interleavings

### Move handoff leaves a tab busy

Bus publishes `session.execution.started(seq=10)` to source A,
`session.moved(seq=11)` to A and destination B, then
`session.execution.succeeded(seq=12)` to B. B's TCP stream arrives first, so the
client applies move then idle. A later delivers `execution.started`, leaving the
Session running. Current `handleEvent` never compares `seq`.

### Consecutive move duplicate regresses ownership

B quickly delivers moves A to B and B to C. A later delivers its duplicate copy
of A to B. The moved handler unconditionally sets the destination before its
transcript append deduplicates by derived message ID
([`data.ts`](/packages/client/src/solid/data.ts#L627-L650)). The Session returns
to B. The TUI open-session projection likewise reapplies every move
([`app.tsx`](/packages/tui/src/app.tsx#L1214-L1217)).

### Ephemeral replacement crosses a move

A publishes an older `session.usage.updated`; the Session moves; B publishes
newer usage. B reaches the client first, then delayed A overwrites cost and
tokens with old values ([`data.ts`](/packages/client/src/solid/data.ts#L575-L580)).
Neither event has a durable sequence.

### Late duplicate resurrects Location state

A fast overlapping stream delivers `shell.created` then `shell.exited`. A slow
stream later delivers its duplicate `shell.created`, recreating a running shell
after exit ([`data.ts`](/packages/client/src/solid/data.ts#L1197-L1211)). A late
duplicate `form.created` after `form.replied` similarly recreates a pending form.

### Late global duplicate reverses replacement

A fast stream delivers credential switches C1 then C2. A slow stream later
delivers its duplicate C1. Without event-ID deduplication, C1 is moved back to
the front of the integration's connections
([`data.ts`](/packages/client/src/solid/data.ts#L1129-L1155)).

### New stream misses a lifecycle prefix

A new Location stream may subscribe after `session.text.started` and receive
only a delta or terminal event. The endpoint is explicitly volatile, so events
before subscription are absent rather than replayed
([`event.ts`](/packages/protocol/src/groups/event.ts#L34-L42)). Ordering cannot
repair the missing boundary; interest changes require atomic handoff plus
targeted hydration or durable replay.

## Candidate ordering keys

| Candidate | Useful for | Limitation |
| --- | --- | --- |
| Event ID | Suppress exact duplicate fan-out of one payload. | It is not publication order. IDs may be caller-supplied ([`bus.ts`](/packages/core/src/bus.ts#L91-L98)); generated IDs are allocated before publication and durable lock acquisition ([`bus.ts`](/packages/core/src/bus.ts#L469-L475), [`bus.ts`](/packages/core/src/bus.ts#L516-L525)). Replay retains historical IDs. |
| `created` timestamp | Render event and message times. | Millisecond ties, clock changes, replayed history, and assignment before commit/publication make it unsafe for ordering. The client does not use it as a stale-event guard. |
| Durable aggregate `seq` | Authoritative relative order among durable events in one aggregate; detect delayed durable events. | It does not place ephemeral events or order global, Location, or other aggregates. Public Session sequences have legitimate gaps because internal `session.usage.recorded` shares the log but is excluded from the public manifest ([`session-event.ts`](/packages/schema/src/session-event.ts#L672-L679)). A public client cannot wait for contiguous values. |
| EventFeed-observed Bus publication order | Covers durable and ephemeral events and supplies one legal interleaving. EventFeed offers an observed event to subscriber queues in one fan-out ([`event-feed.ts`](/packages/server/src/event-feed.ts#L48-L79)). | The order is implicit and absent from the wire. Independent TCP streams can expose different subsequences at different speeds. A publication ordinal alone is insufficient without per-stream watermarks because filtering creates expected gaps. |

Event ID is therefore a deduplication key, durable sequence is a validation
signal, and EventFeed queue order is the only current order spanning all event
classes.

## Move initiation and sequencing

### TUI-prepared move

For a move initiated through the TUI, the destination is known before the move
request. A controlled connection can add that Location to its interest set,
wait for an in-band `interest.applied` marker, hydrate the destination if
needed, and only then admit `session.move`. Core already resolves and validates
the destination before admitting the move inbox item
([`session.ts`](/packages/core/src/session.ts#L461-L514)). This preparation
prevents an unopened-destination gap for that cooperative client, but it does
not establish a general server guarantee.

### Externally initiated move

A plugin, desktop client, another TUI, or server-side operation can initiate the
same move without this TUI's preparation. The observing TUI first learns the
destination from `session.moved`; Bus may immediately route later Session events
only to that destination. Opening a stream in reaction is too late under the
volatile feed.

The server must therefore sequence followed-Session movement at the EventFeed
publication point. Before queueing `session.moved` to a subscriber that matched
the source, EventFeed must atomically install the destination in that
subscriber's effective interest. Recipient selection, followed-location
mutation, and queue admission must share one serialization point. The move and
all destination suffix events then enter the same queue in order, with no
client round trip. A per-Location multi-stream design needs an equivalent
server-side temporary follow or a source/destination rendezvous; client-side
readiness alone cannot cover external moves.

## Minimal ordering contract

For the current projection, one logical subscription must provide:

1. Selected payloads as one FIFO subsequence of EventFeed's Bus-listener
   observation order.
2. Zero-or-one logical delivery per selected Bus event. Zero remains possible
   across disconnect because the feed is volatile; duplicate physical fan-out
   is hidden.
3. Per-Session order across Location movement for durable and ephemeral events.
4. FIFO within each affected Location or global reducer key; no semantic order
   between unrelated Sessions or disjoint Locations.
5. One logical `server.connected` before domain events. Physical stream
   readiness and interest markers are intercepted by the connection layer.
6. Atomic interest cuts. Events before an applied marker use old interest;
   events after it use new interest. Obsolete stream generations cannot publish
   after cutover.
7. A server-side move-follow guarantee for externally initiated moves of
   followed Sessions.

One controlled SSE carrying the union of interested Locations satisfies this
contract with one queue. If several physical streams are retained, ID
deduplication is necessary but insufficient: the merger also needs paired
barriers or shared publication positions with watermarks, plus server-side move
following for destinations that were not prepared by the TUI.

## Cross-references

- [Initial bus-smart design](/.design/bus-smart/bus-smart.glm53.md) establishes
  the global-firehose diagnosis and Bus ownership of Location routing.
- [Downstream-patch assessment](/.design/bus-smart/review0.gpt56s.md) identifies
  the TUI's multi-Location behavior and rejects a static launch-Location stream.
- [Location stream designs](/.design/bus-smart/location-streams0.gpt56s.md)
  compares per-Location streams, barriered union replacement, and one controlled
  SSE; this note supplies the reducer-level ordering constraints those designs
  must satisfy.
- [Bus Session routing tests](/packages/core/test/bus-session-routing.test.ts)
  are the behavioral oracle for creation, moves, forks, replay, batches, and
  slow subscribers.
- [EventFeed tests](/packages/server/test/event-feed.test.ts) define the current
  encode-once, bounded-queue, overflow-isolation, and public-event properties.
