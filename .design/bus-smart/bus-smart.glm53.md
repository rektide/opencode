---
type: Design
title: bus-smart — location-scoped event feed
description: Scope the server→client SSE event stream by Location so TUI clients stop processing every event from every project on the shared service.
resource: /design/bus-smart
tags: [server, events, tui, performance, sse]
status: draft
generated: { by: "agent:glm-5.3#max", at: 2026-08-31 }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: event-feed
    resource: packages/server/src/event-feed.ts
    title: EventFeed broadcast implementation
  - id: bus
    resource: packages/core/src/bus.ts
    title: Bus with Location routing
  - id: connection
    resource: packages/client/src/solid/connection.ts
    title: TUI event stream connection
  - id: data-layer
    resource: packages/client/src/solid/data.ts
    title: client data layer handleEvent
---

# bus-smart — location-scoped event feed

## What's going on

The V2 TUI burns CPU whenever there is activity anywhere on the machine, not
just in the visible session. We already spent a pass tuning the render loop
(spinners, tab pulse cadence, animation scheduling) and it helped, but the
symptom persists: "cpu usage on tui just explodes whenever there's activity"
and "this is murder on my system." The remaining suspect is upstream of the
renderer: what the server actually sends to the TUI, and what the TUI does
with every frame it receives.

An investigation pass (2026-08-30, summarized below) confirmed the structural
cause: **the event feed is a global firehose with zero filtering**, and the
TUI processes every event from every project that shares the background
service. This document designs the structural fix: make `GET /api/event`
location-scoped, with the server filtering per subscriber using routing the
Bus already computes.

Research prompt for follow-up work, on the current lines of inquiry: *trace
one `session.text.delta` from `publish-llm-event.ts` through `Bus.publish`,
`EventFeed`, the SSE wire, `createClientConnection`, and
`createData.handleEvent`, and identify every place that does work for events
belonging to sessions the client cannot see.*

## Findings (why the firehose hurts)

Verified in this worktree; line numbers current as of 2026-08-31.

1. **One unfiltered stream per client.** `GET /api/event`
   (`packages/protocol/src/groups/event.ts:34`) takes no parameters. The feed
   wires itself with `make(bus.listen)` (`packages/server/src/event-feed.ts:87`)
   — `listen` is the unfiltered channel, deliberately bypassing the Location
   routing the Bus applies to `subscribe()` for in-process consumers
   (`packages/core/src/bus.ts:121-128`, `local()` at bus.ts:726-746). Every
   subscriber receives every event from every project and session on the
   server process: deltas, tool events, permissions, renames, creations.

2. **Session events carry no location on the wire.** The Bus strips location
   from public session-event payloads and routes them internally via a
   `routes` WeakMap (`packages/core/src/bus.ts:207`, asserted by
   `packages/core/test/bus-session-routing.test.ts:166-168`). A subscriber
   cannot filter them from the payload alone; the routing knowledge must come
   from the Bus.

3. **The client processes everything.** `handleEvent`
   (`packages/client/src/solid/data.ts:526`) runs its full switch for every
   event regardless of project. Foreign-session deltas are cheap after a
   one-time store write, but several cases do real work for foreign sessions:
   `session.created` → HTTP `session.sync()`, `session.renamed` → HTTP
   `session.sync()` (fires per auto-title), `session.execution.*` →
   `session.sync()` for every store-known session — and tabs prefetch makes
   many sessions store-known (below). Components filter by sessionID inside
   their handlers, after being invoked for every event.

4. **Overflow is a cliff, and reconnect is a storm.** Each subscriber queue
   is dropping with capacity 4096
   (`packages/server/src/event-feed.ts:8,64-68`); overflow fails the stream
   by design. The TUI then reconnects
   (`packages/client/src/solid/connection.ts:114-145`), which invalidates
   every cached read (`data.ts:1980-1983`) and refetches the active session
   plus every open tab (`session-tabs.tsx:307-320`), while `server.connected`
   fires `session.active()` + location/vcs/project fetches. Sustained
   multi-session activity can cycle this.

5. **Tabs multiply exposure, not streams.** Only one `SessionFrame` is
   mounted at a time (route `Switch` in `app.tsx`), and there is one SSE
   connection regardless of tab count. But tab prefetch (300 ms after
   connect) fetches messages/pending/permissions/forms for **all** open tabs
   (`packages/tui/src/context/session-tabs.tsx:307-320`), and `TabPulse`
   (`packages/tui/src/component/tab-pulse.tsx`) is a live renderable that
   animates every renderer frame while any tab is busy.

6. **Event rate context.** Deltas are batched to 100 ms server-side
   (`packages/core/src/session/runner/publish-llm-event.ts:77`), so one
   streaming session emits ≈10 text + ≈10 reasoning deltas/sec plus tool
   input deltas; deltas and `session.tool.progress` are ephemeral, boundary
   events are durable (SQLite transaction each). Heartbeats are 15 s. The
   problem is not per-event size; it is fan-out × subscriber count ×
   irrelevant events.

## Goals

- A TUI subscribed at a Location receives only: global events, events for
  sessions owned by that Location, and `session.moved` for sessions leaving
  or arriving at that Location (Bus semantics, unchanged).
- Wire compatibility: existing SDK/desktop/old-TUI clients that subscribe
  without a location keep today's behavior, byte-for-byte.
- The Bus stays the single owner of routing semantics; the server does not
  re-derive location matching.
- Measurable drop in TUI CPU and event-loop delay during multi-session
  activity, verifiable with the existing devtools bar.

## Non-goals

- Clustering/multi-server routing, per-session subscriptions, or
  client-selected event-type filtering. All possible later; none needed to
  fix the pain.
- Changing the volatile-feed contract (overflow fails the stream) or the
  4096 capacity. Scoping shrinks volume; backpressure semantics stay.
- Adding location to event payloads on the wire (explicitly rejected: the
  Bus test suite asserts session events are location-free).
- Reducing same-location event volume (delta batching is already 100 ms).
- Tab prefetch laziness, TabPulse cadence, markdown re-parse costs — render
  side, out of scope here, tracked as follow-ups.

## Design

### Wire contract

Add the existing `LocationQuery` to the event endpoint
(`packages/protocol/src/groups/location.ts:6-12` — optional
`location[directory]` / `location[workspace]`, deepObject style, exactly what
`pty.list` and `location.get` already use):

```ts
HttpApiEndpoint.get("event.subscribe", "/api/event", {
  query: LocationQuery,
  success: HttpApiSchema.StreamSse({ data: EventSchema }),
})
```

- **Absent** location → today's global feed. Every existing client is
  unchanged.
- **Present** → scoped feed. The handler resolves the ref with the existing
  `requestRef` helper (`packages/server/src/location.ts:69-79`), which
  already parses `location[directory]`/`location[workspace]` query params
  and `x-opencode-directory`/`x-opencode-workspace` headers, defaulting to
  `process.cwd()` — the SSE request gets the same convention as every other
  location-aware read for free.

Scoping is per-subscription (per SSE connection), not per client identity.
The TUI reconnect loop naturally re-issues the same scoped GET.

### Server: per-subscriber filter in EventFeed

Subscribers become `(queue, ref?)` pairs. The publish path keeps its shape —
encode once, then offer to each subscriber whose filter accepts the event:

```ts
// packages/server/src/event-feed.ts (sketch)
const subscribers = new Set<{ queue: Queue.Queue<string, Error>; ref?: Location.Ref }>()

const publish = (event) => {
  const encoded = render(event) // unchanged, once
  for (const s of subscribers) {
    if (s.ref && !Bus.deliversTo(event, s.ref)) continue   // new
    if (!Queue.offerUnsafe(s.queue, encoded)) { /* overflow, unchanged */ }
  }
}
```

The filtering predicate must be **Bus-owned**, because session events carry
no location on the payload and correct semantics are subtle (moves reach both
owners; forks route through the parent; unlocated ephemeral events are
global). Two implementations, in preference order:

**Option B (recommended): export the predicate from the Bus.**
`packages/core/src/bus.ts` already keeps per-event routes in the `routes`
WeakMap, populated before `notify()` in every publish path
(bus.ts:212-261, 399, 479). Export one pure helper:

```ts
// bus.ts
export const deliversTo = (event: Event.Payload, ref: Location.Ref): boolean => {
  const matches = (r: Location.Ref) => r.directory === ref.directory && r.workspaceID === ref.workspaceID
  const refs = routes.get(event)               // WeakMap lookup by payload identity
  if (refs) return refs.some(matches)
  return !event.location || matches(event.location)
}
```

…exposed on `Bus.Interface` (or as a module function taking the bus's route
table). The `listen` path delivers the same payload objects `notify()` saw,
so WeakMap identity holds. Semantics are identical to `local()` (bus.ts:726)
because it *is* the same predicate — extract it so `local()` and
`deliversTo` share one implementation.

- Pros: minimal diff; preserves the queue/overflow architecture and
  encode-once; per-subscriber cost is one predicate call; the new surface is
  a pure function unit-testable against the existing
  `bus-session-routing.test.ts` fixtures.
- Cons: one small addition to the Bus public API.

**Option A (alternative): per-subscriber bus streams.** Rework the feed so
each scoped subscriber consumes `bus.subscribe()` with
`Effect.provideService(Location.Service, location(ref))`, encoding per
subscriber.

- Pros: zero new Bus API; the filter path is exactly what in-process
  consumers run, already covered by tests.
- Cons: restructures the feed (per-subscriber fibers, per-subscriber encode,
  acquire/release per queue), larger diff to deliberately subtle
  backpressure code. Encode-per-subscriber is cheap at TUI-scale subscriber
  counts (1-3) but is still a regression from encode-once.

### Client opt-in

1. `packages/client/src/solid/connection.ts`: `createClientConnection`
   gains an optional location; the stream call becomes
   `api.event.subscribe({ location: locationQuery(ref) })` when present.
   Reconnect re-uses it.
2. `packages/tui/src/context/client.tsx`: pass the TUI's location
   (`useLocation().ref` / the resolved default). After the protocol change,
   run `bun run generate` from `packages/client` (repo rule) and thread the
   new typed input through.
3. `handleEvent` keeps its guards. With scoping, the foreign-session cases
   in findings §3 collapse to same-location-other-session events, which tabs
   and the open-dialog legitimately want. One cheap hardening regardless of
   scoping: `session.renamed`/`session.created` sync only when the store
   already owns the session or an explicit interest exists (open tab, active
   route) — this also protects unscoped legacy clients.

### Semantics and edge cases

| Case | Behavior | Why it is safe |
| --- | --- | --- |
| Global events (`server.*`, `tui.*`, catalog/credential, unlocated ephemeral) | delivered to all subscribers | `deliversTo` falls through on missing routes/location, same as `local()` |
| Global MCP form elicitation (`sessionID: "global"`) | delivered when its event location matches | form events carry location on the wire; the mini transport already filters by `sameLocation` — same outcome, now enforced server-side |
| `session.moved` | reaches both old and new location subscribers | Bus dual-owner routing (bus.ts:241-246); a TUI watching the old location sees the move, then stops hearing about the session |
| Session followed by a tab that moves away | stale after the move | known trade-off; see open questions §1 |
| `dialog-open` cross-project list | degrades to fetch-on-open | it already merges its own HTTP fetch (`dialog-open.tsx:55,85`); only live invalidation of *foreign* sessions is lost |
| SDK / desktop / old TUI (no location param) | byte-for-byte today | unscoped feed unchanged |
| Slow scoped subscriber | overflow fails that subscriber only | unchanged semantics; scoping reduces arrival rate, making overflow less likely |

### Testing

- **Bus**: unit-test `deliversTo` against the `bus-session-routing.test.ts`
  matrix (moves, forks, batched moves/deletes, replay, slow-subscriber
  snapshots) — the expected subscriber-visible sets already exist there.
- **Server**: extend the SSE handler test to connect two scoped feeds (a, b)
  plus one unscoped, publish through the Bus, and assert per-feed delivery
  sets; assert the connected frame and heartbeat are unchanged.
- **Client**: connection test with a location-query-carrying subscribe call;
  reconnect re-issues the same location.
- **TUI**: `bun run dev:live` against a shared service with a second project
  running an active session; confirm the devtools event counters / debug
  `recv.event` trace show no foreign-project events, and CPU/event-loop p99
  stay flat during the other project's streaming.

### Verification / observability

- Devtools bar (`packages/tui/src/component/devtools-bar.tsx`) already
  samples `process.cpuUsage` and event-loop p99 — the before/after signal.
- `OPENCODE_LOG_LEVEL=DEBUG` logs every durable event client-side.
- Manual: `curl -N` the scoped and unscoped endpoints side by side while
  another project streams.

## Work breakdown

Commit-sized, ordered; no time estimates.

1. `feat(core): export Bus.deliversTo location predicate` — extract the
   `local()` predicate into the shared helper, keep `local()` semantics
   identical, add bus unit tests.
2. `feat(protocol): accept LocationQuery on event.subscribe` — endpoint
   schema + OpenAPI annotation; `bun run generate` from `packages/client`.
3. `feat(server): scope EventFeed subscribers by location` — subscriber
   `{queue, ref?}` filter, handler resolves `requestRef` for the raw SSE
   request; server feed tests (scoped/unscoped/mixed).
4. `feat(client): pass location through createClientConnection` — optional
   location on the connection, threaded to the subscribe call; reconnect
   keeps scope.
5. `feat(tui): subscribe the TUI event stream scoped to its location` —
   `context/client.tsx` supplies the location; live verification pass.
6. `fix(client): stop syncing foreign sessions on rename/create` — the
   handleEvent hardening from §Client opt-in (protects legacy unscoped
   clients too).
7. Optional follow-ups (separate changes): tab prefetch laziness, TUI
   reconnect refetch narrowing, a devtools events/sec counter.

Rollout: land 1-3 (server, invisible), then 4-6 (TUI opt-in). Nothing flips
for existing clients; the scoped path becomes the TUI default in the same
release that ships 5.

## Open questions

1. **Cross-location tabs.** If a tab's session moves to another directory,
   its events stop arriving at the TUI's location. Options: (a) accept
   staleness until reconnect/refetch, (b) let the client subscribe to the
   union of open-tab locations (multi-ref feed), (c) server-side: include
   the destination in `session.moved` routing for a grace period. Default
   to (a) for v1 — moves are rare and the tab already shows the move notice.
2. **`LocationQuery` vs `x-opencode-*` headers on SSE.** `requestRef`
   accepts both; the typed query param keeps the generated client honest
   and curl-friendly. Confirm EventSource-style consumers (desktop) don't
   need header-only auth paths before locking the contract.
3. **Should the SDK default scoped?** Desktop/web render multiple projects
   in one window and may genuinely want global. Leave unscoped as the SDK
   default until a desktop-driven pass says otherwise.
4. **Multi-workspace TUI.** `tabs.scope = "global"` shares tabs across
   cwds; if a TUI instance truly spans locations, v1's single-location
   subscription needs the multi-ref feed from open question 1(b). Verify
   actual usage before building it.

## Flow

```mermaid
flowchart LR
    subgraph server["server process"]
        pub["publish-llm-event.ts<br/>(100ms delta batching)"] --> bus["Bus.publish"]
        bus --> routes["routes WeakMap<br/>(session → Location.Ref[])"]
        bus --> listen["bus.listen tap"]
        listen --> feed["EventFeed.publish<br/>encode once"]
        feed -->|deliversTo(event, ref)| subA["scoped queue<br/>(TUI, location a)"]
        feed --> subB["scoped queue<br/>(TUI, location b)"]
        feed --> subG["unscoped queue<br/>(SDK/desktop)"]
    end
    subA -->|"SSE /api/event?location[directory]=a"| tuiA["TUI a<br/>connection 10ms flush → handleEvent"]
    subB -->|"SSE /api/event?location[directory]=b"| tuiB["TUI b"]
    subG -->|"SSE /api/event"| sdk["SDK / desktop"]
```

## Cross-references

- `packages/core/src/bus.ts` — routing owner; `local()` is the predicate this
  design extracts (`deliversTo`), `routes` WeakMap is the source of truth.
- `packages/core/test/bus-session-routing.test.ts` — the delivery-matrix
  oracle; new tests mirror its fixtures.
- `packages/server/src/event-feed.ts` — the broadcast being scoped.
- `packages/server/src/location.ts` — `requestRef` parses the location query
  convention the endpoint adopts.
- `packages/protocol/src/groups/location.ts` — `LocationQuery` reused
  verbatim.
- `packages/client/src/solid/connection.ts`, `packages/client/src/solid/data.ts`
  — client opt-in points and the handleEvent hardening.
- `packages/tui/src/context/session-tabs.tsx`, `packages/tui/src/component/tab-pulse.tsx`
  — tab-side amplifiers (prefetch, live animation) deliberately out of scope,
  listed as follow-ups.
- `.design/subagent/draft0.gpt56s.md` (branch history) — prior design-wave
  precedent in this repo's `.design` conventions.
