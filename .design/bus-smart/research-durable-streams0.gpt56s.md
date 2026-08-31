---
type: ResearchNote
title: Durable Streams as a per-Session event transport
description: A library-of-ideas note on replacing volatile Session-event fan-out with one stable replayable stream per Session.
resource: /design/bus-smart/research-durable-streams0
tags: [bus, session, durable-streams, sse, replay, research]
status: draft
generated: { by: "agent:gpt-5.6-sol#xhigh", at: 2026-08-31 }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: durable-streams-protocol
    resource: https://github.com/durable-streams/durable-streams/blob/a172acc389351cb3db6deb5cd60e3dec11e7ff39/PROTOCOL.md
    title: Durable Streams Protocol
    author: org:ElectricSQL
  - id: durable-streams-client
    resource: https://github.com/durable-streams/durable-streams/blob/a172acc389351cb3db6deb5cd60e3dec11e7ff39/packages/client/src/stream-api.ts
    title: Durable Streams TypeScript read client
    author: org:ElectricSQL
  - id: picomq-s3stream
    resource: https://github.com/picomq/picomq/tree/a2a52d31bef38af423285c9debb266976a3ce158/s3stream
    title: PicoMQ s3stream engine
    author: org:PicoMQ
  - id: opencode-bus
    resource: /packages/core/src/bus.ts
    title: OpenCode Bus and aggregate log
  - id: opencode-session-events
    resource: /packages/schema/src/session-event.ts
    title: OpenCode Session event definitions
---

# Durable Streams as a per-Session event transport

## Proposed shape

Give every Session ID one permanent stream URL, for example
`/api/session/{sessionID}/events`. The URL is the transport identity for the
Session's lifetime, independent of its current Location. OpenCode appends all
public Session events, or a deliberately selected subset, as framed JSON
messages. A client stores the protocol's opaque next offset, performs catch-up
reads from that offset, and then tails the same URL with SSE. The protocol
defines a stream as a URL-addressed, append-only byte sequence with opaque,
sortable offsets ([model](https://github.com/durable-streams/durable-streams/blob/a172acc389351cb3db6deb5cd60e3dec11e7ff39/PROTOCOL.md#L76-L84)); catch-up and SSE use the same offset continuation contract
([reads](https://github.com/durable-streams/durable-streams/blob/a172acc389351cb3db6deb5cd60e3dec11e7ff39/PROTOCOL.md#L574-L620),
[SSE](https://github.com/durable-streams/durable-streams/blob/a172acc389351cb3db6deb5cd60e3dec11e7ff39/PROTOCOL.md#L702-L812)). The reference client already implements catch-up before switching to live reads and reconnects SSE from the latest offset
([`stream-api.ts`](https://github.com/durable-streams/durable-streams/blob/a172acc389351cb3db6deb5cd60e3dec11e7ff39/packages/client/src/stream-api.ts#L135-L142),
[`response.ts`](https://github.com/durable-streams/durable-streams/blob/a172acc389351cb3db6deb5cd60e3dec11e7ff39/packages/client/src/response.ts#L699-L730)).

A move then becomes ordinary content in the Session stream. Today Bus resolves
Session ownership, dual-routes `session.moved` to old and new Locations, and
routes its suffix only to the destination
([`bus.ts`](/packages/core/src/bus.ts#L205-L260)). A Session-addressed URL does
not move, so an interested tab neither changes streams nor performs a
cross-stream rendezvous. This could remove Location classification and
per-subscriber EventFeed queue fan-out for Session traffic, replacing one broad
volatile SSE with independently resumable streams for the Session IDs each
client actually follows. It does not remove discovery: clients still need a
global or Location-scoped feed (or equivalent indexed polling) for Session
creation and membership, global configuration/catalog/TUI events, and
non-Session Location entities. Open tabs provide known Session IDs, but cannot
discover IDs they do not yet know
([`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L276-L320)).

## The modeling tension

OpenCode already has a durable per-aggregate Session log. Durable publication
commits a monotonically increasing `seq` in a database transaction, and
`Bus.log` replays through a captured watermark before following new durable
rows ([`bus.ts`](/packages/core/src/bus.ts#L284-L445),
[`bus.ts`](/packages/core/src/bus.ts#L828-L870)). The experimental Session API
filters that log to durable Session events
([`session.ts`](/packages/core/src/session.ts#L398-L408)). Durable Streams would
therefore add most value only if it also replaced the volatile delivery of
ephemeral events.

That is also its central risk. Text, reasoning, and tool-input deltas are
intentionally live-only because their durable end events contain the complete
value; tool progress, compaction deltas, and usage updates are likewise
ephemeral ([`session-event.ts`](/packages/schema/src/session-event.ts#L369-L505),
[`session-event.ts`](/packages/schema/src/session-event.ts#L560-L580)). Persisting
every fragment amplifies writes and stores data duplicated by canonical end
events. Replaying fragments can faithfully reconstruct animation, but may also
replay obsolete progress that a reconnecting UI should replace with projected
current state. Persisting only durable facts preserves the existing model but
does not recover the transient gap this alternative is meant to close. Bounded
retention reduces cost, yet makes old offsets expire and requires a defined
hydrate-and-resume response; the protocol explicitly permits retention and
returns `410 Gone` before the earliest retained position
([retention](https://github.com/durable-streams/durable-streams/blob/a172acc389351cb3db6deb5cd60e3dec11e7ff39/PROTOCOL.md#L117-L127),
[expired offsets](https://github.com/durable-streams/durable-streams/blob/a172acc389351cb3db6deb5cd60e3dec11e7ff39/PROTOCOL.md#L589-L620)). The event selection and retention contract must be decided before storage technology.

## Ordering and implementation evidence

For durable events, OpenCode's aggregate `seq` should remain the domain order;
the stream offset is a transport cursor, not a replacement. Durable Streams'
`Stream-Seq` can reject producer regression, while `Producer-Id`, epoch, and
per-batch sequence deduplicate retries and fence stale producers; these are
separate application- and transport-level sequences
([producer protocol](https://github.com/durable-streams/durable-streams/blob/a172acc389351cb3db6deb5cd60e3dec11e7ff39/PROTOCOL.md#L313-L474)). Internal durable events can create public `seq` gaps, and ephemeral events have no aggregate `seq`, so one serialized per-Session append path still must define their relative order. A database commit followed by a stream append also creates a dual-write crash window unless an outbox, log-driven publisher, or single authoritative store closes it. Protocol idempotency alone cannot make those two commits atomic.

PicoMQ demonstrates that the storage shape is practical, not that it is
drop-in. Its `s3stream` library owns the WAL, object layout, caches, and
compaction ([README](https://github.com/picomq/picomq/blob/a2a52d31bef38af423285c9debb266976a3ce158/s3stream/README.md#L1-L13)). `S3Storage` admits appends to a WAL, applies cache updates in ordered confirmation, uploads sealed blocks to object storage, recovers uncommitted tails, and stitches block-cache history with the WAL cache
([storage](https://github.com/picomq/picomq/blob/a2a52d31bef38af423285c9debb266976a3ce158/s3stream/s3stream-core/src/storage/s3_storage.rs#L263-L271),
[reads](https://github.com/picomq/picomq/blob/a2a52d31bef38af423285c9debb266976a3ce158/s3stream/s3stream-core/src/storage/s3_storage.rs#L393-L440),
[uploads](https://github.com/picomq/picomq/blob/a2a52d31bef38af423285c9debb266976a3ce158/s3stream/s3stream-core/src/storage/s3_storage.rs#L955-L1034)). Its compactor cleans trimmed objects and physically or logically merges small objects
([compactor](https://github.com/picomq/picomq/blob/a2a52d31bef38af423285c9debb266976a3ce158/s3stream/s3stream-core/src/compact/stream_compactor.rs#L1-L8)). PicoMQ also exposes catch-up, long-poll, producer headers, and SSE through a Durable Streams frontend
([`ds.rs`](https://github.com/picomq/picomq/blob/a2a52d31bef38af423285c9debb266976a3ce158/picomq/pico-http/src/ds.rs#L252-L307),
[`ds.rs`](https://github.com/picomq/picomq/blob/a2a52d31bef38af423285c9debb266976a3ce158/picomq/pico-http/src/ds.rs#L336-L496)). Adopting it would still require OpenCode-specific authorization, lifecycle, event framing, transaction integration, and operational ownership.

## Costs and verdict

Major costs are one live connection per followed Session (subject to browser and
proxy limits), per-client offset persistence, stream creation/deletion and auth,
retention and hydration semantics, migration or backfill, dual-write recovery,
and operating a WAL/object-store/cache/compaction stack. A discovery feed still
exists, so this narrows rather than eliminates event infrastructure.

**Verdict:** one fixed Durable Stream per Session is promising architectural
research because it aligns transport identity with stable Session identity,
makes moves unremarkable, and gives each tab independent catch-up and tailing.
Its value depends on resolving whether transient fragments deserve durable
replay and on making producer ordering atomic with OpenCode's current log. It is
not relevant to the immediate bus-smart patch, which should remain a smaller
volatile routing and fan-out correction.

## Cross-references

- [Location streams and controlled subscriptions](/.design/bus-smart/location-streams0.gpt56s.md) is the immediate-design contrast: it improves the existing volatile feed without changing Session event durability.
- [OpenCode Bus](/packages/core/src/bus.ts) already supplies the authoritative durable per-aggregate sequence and replay boundary.
- [Durable Streams Protocol](https://github.com/durable-streams/durable-streams/blob/a172acc389351cb3db6deb5cd60e3dec11e7ff39/PROTOCOL.md) defines the transport primitive considered here.
