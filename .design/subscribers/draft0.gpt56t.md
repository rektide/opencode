---
type: Design
title: Subscriber observability
description: A process-global Effect registry for understanding who is listening to which OpenCode resources, with scoped lifecycle and rich read-only plugin access.
status: draft
generated: { by: llm:gpt-5.6-terra, at: 2026-08-18 }
sources:
  - id: event-feed
    resource: /packages/server/src/event-feed.ts
  - id: bus
    resource: /packages/core/src/bus.ts
  - id: pty
    resource: /packages/core/src/pty.ts
  - id: plugin-host
    resource: /packages/core/src/plugin/host.ts
  - id: event-stream-architecture
    resource: /specs/v2/event-stream-architecture.md
---

# Subscriber observability (draft0)

## What's up

OpenCode has several rich subscriber systems, but no shared way to ask who is listening:

- the public EventFeed owns one bounded queue per SSE client;
- Bus owns wildcard/typed live streams, durable aggregate followers, inline listeners, and permanent projectors;
- PTY sessions own client output attachments and native process listeners;
- Watcher owns logical streams over shared physical filesystem watches;
- plugins install event streams, hooks, and state transforms in replaceable scopes.

Each system already has correct local lifecycle behavior. The missing capability is an **observability plane**: one Effect service that records active subscriptions as scoped leases, supplies atomic snapshots and change streams, and projects safe rich data into Effect and Promise plugins.

The motivating immediate question is coarse: *does the public EventFeed have zero subscribers?* The broader feature should also answer:

- Which plugin or core component owns an event listener?
- Which event types or aggregate logs are followed?
- Which PTY has attached clients?
- Which logical filesystem interests share a physical watch?
- Which subscribers are slow, overflowing, reconnecting, or stale?
- Which resources are retained because somebody is still listening?

This is ephemeral process state. It is not a new durable EventV2 aggregate and should not publish mutations through Bus.

Research prompt: *design a process-global, transport-neutral subscriber registry using Effect v4 scoped resources, with honest owner/resource identity, bounded atomic observation, safe plugin views, and incremental instrumentation across EventFeed, Bus, PTY, Watcher, and plugin registrations.*

## Recommendation

Add a Core-global service named `SubscriberRegistry`.

```text
Core streams/listeners ──┐
PTY attachments ─────────┤
Filesystem interests ────┼── SubscriberRegistry ── snapshots / changes / summaries
Plugin hooks/streams ─────┤             │
Server SSE/WebSockets ────┘             ├── Effect plugin domain
                                        ├── Promise plugin domain
                                        └── optional HTTP API later
```

Core owns the registry, identity model, lifecycle, safe projections, and query semantics. Server contributes transport metadata when registering SSE/WebSocket subscribers. Plugins receive a read-only domain through `PluginHost`; they never receive internal queue, callback, request, or scope objects.

Start with in-process plugin access and EventFeed instrumentation. A public HTTP API is useful but separable; adding it later requires Protocol definitions and generated clients.

## Scope: what counts as a subscriber?

Use **subscriber** as the umbrella for a live relationship where one owner receives or reacts to a resource.

| Kind | Examples | Include? |
| --- | --- | --- |
| Stream subscriber | Bus live stream, EventFeed SSE queue, durable log follower | yes |
| Callback listener | `Bus.listen`, PTY data callback | yes |
| Attachment | PTY WebSocket, filesystem Watcher stream | yes |
| Hook/transform | plugin tool hook, AISDK hook, State transform | yes, as `attachment` |
| Projector | durable Session projector | inventory separately; it is mandatory topology, not discretionary observation |
| Native implementation listener | PTY `proc.onData`, Parcel callback | optional internal diagnostic view, linked under its logical parent |

The registry models relationships, not just data structures named `subscribers`. It must preserve kind so plugins can distinguish a client listening to events from a mandatory state projector.

## Existing surfaces

### EventFeed

[`packages/server/src/event-feed.ts`](/packages/server/src/event-feed.ts) already has the minimal active registry:

```ts
const subscribers = new Set<Queue.Queue<string, Error>>()
```

Each `feed.subscribe` acquisition adds one queue; release or overflow removes it. Therefore `subscribers.size === 0` is an authoritative "no public event clients attached" signal today. It is private, but readily exposable.

Known at EventFeed registration:

- queue capacity (4,096);
- subscription start/end;
- delivered offers and overflow;
- global public event-feed target.

Known only one layer earlier, in the HTTP handler:

- SSE route and request lifetime;
- authentication principal if surfaced by middleware;
- headers suitable for a bounded client classification;
- connection/request trace identity.

Not known today:

- which Session a TUI displays;
- a stable TUI/client instance ID;
- user close intent.

Subscriber observability must report unknown honestly rather than infer Session presence from a global SSE connection.

### Bus

[`packages/core/src/bus.ts`](/packages/core/src/bus.ts) has several distinct relationships:

| API | Target | Lifecycle |
| --- | --- | --- |
| `subscribe()` | all live events, Location-filtered by ambient Location | stream scope |
| `subscribe(definition)` | one event type | stream scope |
| `subscribe(definitions)` | known type set over wildcard feed | stream scope |
| `log({aggregateID, follow:true})` | durable aggregate follower | stream scope |
| `listen(callback)` | inline all-event listener | manual unsubscribe |
| `project(definition, callback)` | exact durable type/version projector | Bus layer lifetime |

Resource identity is usually strong. Owner identity is weak because callbacks/streams do not carry a component or plugin ID. Instrumentation needs explicit owner metadata or an Effect context reference.

### PTY

[`packages/core/src/pty.ts`](/packages/core/src/pty.ts) stores a `Map<object, Subscriber>` for each running PTY. Registration knows PTY ID, Location, requested output cursor, state (`pending`, `active`, `detached`), and lifecycle. The Server WebSocket handler additionally knows transport identity. This is a high-value second integration after EventFeed.

### Filesystem Watcher

Watcher distinguishes logical consumers from shared physical resources:

- logical key: file/directory path and ignore set;
- physical native subscription: one shared RcMap entry;
- consumer stream: one PubSub subscription.

The registry should model both levels with `parentID`: logical consumers point to a shared physical resource record. This directly supports the watchman work and makes sharing/grace measurable.

### Plugin registrations

Plugins run in replaceable child scopes. Effect plugin registrations naturally disappear when that scope closes; Promise registrations are adapted into the same scope. Plugin ID is known at activation, but lower-level Bus, Hook, AISDK, and State APIs do not currently receive it.

This is a natural use of an Effect `Context.Reference`: install the current subscriber owner while executing a plugin generation, and let scoped operators inherit it.

## Domain model

### Separate owner, target, and delivery

```ts
type Owner =
  | {
      readonly type: "core"
      readonly component: string
    }
  | {
      readonly type: "server"
      readonly component: string
    }
  | {
      readonly type: "plugin"
      readonly pluginID: Plugin.ID
      readonly generation: string
    }
  | {
      readonly type: "client"
      readonly client: "tui" | "desktop" | "web" | "cli" | "acp" | "unknown"
      readonly instanceID?: string
    }

type Target = {
  readonly namespace: "event" | "event-log" | "pty" | "filesystem" | "plugin-hook" | "state"
  readonly name: string
  readonly instance?: string
  readonly location?: Location.Ref
}

type Delivery =
  | { readonly type: "effect-stream" }
  | { readonly type: "callback" }
  | { readonly type: "sse"; readonly capacity: number }
  | { readonly type: "websocket" }
```

Owner is responsible code/client identity. Target is what receives attention. Delivery is how updates cross the relationship. Keeping these separate prevents ambiguous records such as "SSE subscribed to TUI".

### Public subscriber record

Put wire-safe schemas in `packages/schema/src/subscriber.ts` even if the first consumer is plugin-only. That creates one model for Core, plugins, diagnostics, and a future API.

```ts
type Info = {
  readonly id: Subscriber.ID
  readonly processID: Subscriber.ProcessID
  readonly parentID?: Subscriber.ID
  readonly kind: "stream" | "listener" | "attachment" | "hook" | "projector" | "physical"
  readonly owner: Owner
  readonly target: Target
  readonly delivery: Delivery
  readonly state: "starting" | "active" | "draining" | "failed"
  readonly startedAt: DateTime.Utc
  readonly updatedAt: DateTime.Utc
  readonly activity: {
    readonly delivered: number
    readonly dropped: number
    readonly lag?: number
    readonly highWaterMark?: number
    readonly lastAt?: DateTime.Utc
  }
}
```

Identity semantics:

- `Subscriber.ID`: one active relationship acquisition; new after reconnect.
- `ProcessID`: one registry incarnation; new after server restart.
- `parentID`: layered relationship, such as SSE queue → EventFeed's Bus listener or logical watcher → physical watch.
- `Target.name`: stable low-cardinality class (`public-feed`, `session-events`, `output`, `tree`).
- `Target.instance`: high-cardinality diagnostic identity (Session ID, PTY ID, path fingerprint), never a metric label.
- `Owner`: code/client responsible for consuming, not the authenticated user unless explicitly modeled later.

### Internal record

Internal registration may additionally hold:

- safe normalized request classification;
- raw queue/reference needed for counters;
- close reason and final error while removing;
- private annotations for traces;
- full path or resource ID before principal-specific projection.

Internal values never cross PluginHost or HTTP handlers directly.

## Effect service

### Service API

```ts
type RegisterInput = {
  readonly kind: Subscriber.Info["kind"]
  readonly owner?: Subscriber.Owner
  readonly target: Subscriber.Target
  readonly delivery: Subscriber.Delivery
  readonly parentID?: Subscriber.ID
}

type Registration = {
  readonly id: Subscriber.ID
  readonly delivered: (count?: number) => void
  readonly dropped: (count?: number) => void
  readonly lag: (value: number) => void
  readonly update: (update: Subscriber.Update) => Effect.Effect<void>
}

interface Interface {
  readonly register: (
    input: RegisterInput,
  ) => Effect.Effect<Registration, never, Scope.Scope>

  readonly snapshot: (
    principal: Subscriber.Principal,
    query?: Subscriber.Query,
  ) => Effect.Effect<Subscriber.Snapshot>

  readonly watch: (
    principal: Subscriber.Principal,
    query?: Subscriber.Query,
  ) => Stream.Stream<Subscriber.Change, Subscriber.WatchOverflowError>
}
```

`register` is `Effect.acquireRelease`: acquisition inserts the record; scope release removes it exactly once. This matches EventFeed queues, Bus streams, plugin generations, and watcher subscriptions.

Legacy callback APIs such as `Pty.attach().detach()` can temporarily use an internal `registerManual` returning an idempotent close Effect. Do not expose manual registration publicly.

### Owner context

```ts
const CurrentOwner = Context.Reference<Subscriber.Owner>(
  "@opencode/Subscriber/CurrentOwner",
  { defaultValue: () => ({ type: "core", component: "unknown" }) },
)
```

Plugin activation provides `{type:"plugin", pluginID, generation}` around the plugin effect. Child fibers inherit it. Core components should still provide explicit named owners at important subscription sites; recording thousands of `core/unknown` entries is less useful than leaving uninstrumented sites for later.

### Stream operator

```ts
const track =
  (input: Omit<RegisterInput, "owner">) =>
  <A, E, R>(stream: Stream.Stream<A, E, R>) =>
    Stream.unwrapScoped(
      Effect.gen(function* () {
        const registry = yield* SubscriberRegistry.Service
        const owner = yield* CurrentOwner
        const registration = yield* registry.register({ ...input, owner })
        return stream.pipe(
          Stream.tap(() => Effect.sync(() => registration.delivered())),
        )
      }),
    )
```

The relationship starts when the stream is acquired, not when it is constructed. Scope close removes it automatically.

## Snapshot and changes

### Atomic handoff

Consumers need a race-free answer to "what exists now, then what changes?" A separate `snapshot()` followed by `changes()` can miss a registration between calls.

`watch()` should emit:

```ts
type Change =
  | { readonly type: "snapshot"; readonly snapshot: Snapshot }
  | { readonly type: "added"; readonly revision: number; readonly subscriber: Info }
  | { readonly type: "updated"; readonly revision: number; readonly subscriber: Info }
  | { readonly type: "removed"; readonly revision: number; readonly id: ID; readonly reason: RemovalReason }
```

Acquisition algorithm under one mutation semaphore:

1. allocate a bounded queue for this registry observer;
2. add that queue to the observer set;
3. project the current map and revision;
4. emit snapshot first, then queued deltas;
5. remove/shutdown the queue on scope release.

Each mutation increments a process-local revision and offers one delta to every observer. A mutation is therefore either in the snapshot or after it, never lost between them.

### Why not only `SubscriptionRef`

Effect v4 `SubscriptionRef` is attractive because `changes` emits the current value first. Its PubSub is unbounded, and emitting a full registry snapshot on every lifecycle/counter update would create large allocations and allow slow plugin observers to accumulate unbounded state.

Use Effect primitives directly:

- `Effect.acquireRelease` and `Scope` for registrations;
- `Semaphore` for revision/snapshot ordering;
- independent bounded `Queue.dropping` instances for observers;
- `Stream.unwrapScoped` for atomic snapshot + delta streams.

On observer overflow, fail only that observer. Reacquiring produces a fresh snapshot. This mirrors EventFeed's proven independent-lag-budget law.

## Activity data

Lifecycle changes and hot-path delivery counters need different treatment.

- Add/remove/state transition increments registry revision and emits a delta.
- `delivered`, `dropped`, bytes, lag, and last-activity updates mutate counters synchronously without emitting one delta per event.
- Coalesce counter projection on a low-frequency interval or expose it only in snapshots.
- Never schema-encode or publish subscriber records on the event-delivery hot path.

This preserves EventFeed's encode-once architecture and avoids multiplying work by observer count.

## Safe views and privacy

### Views

| View | Audience | Contents |
| --- | --- | --- |
| full | registry/Server implementation only | internal records and private metadata |
| diagnostic | local plugins and authenticated diagnostics | safe per-subscriber records |
| summary | retention policy, dashboards, metrics | grouped counts only |

Redaction happens in Core before data reaches PluginHost or Server.

Never expose:

- authorization headers, cookies, passwords, tickets, or environment;
- callback, Queue, Scope, Fiber, Request, Response, or socket objects;
- raw PTY input/output or command environment;
- raw filesystem paths to a plugin outside its authorized Location view;
- raw peer IP or User-Agent by default;
- plugin-supplied arbitrary metric labels.

Normalize client identity to a bounded class (`tui`, `desktop`, `web`, `cli`, `acp`, `unknown`). A stable client instance ID requires explicit client cooperation; it cannot be inferred from current SSE requests.

### Plugin principal

Plugin queries default to:

- current `Location.Ref` records;
- process-global summary records safe for all local plugins;
- the plugin's own full owner identity;
- redacted identities for other plugins.

Do not let a location plugin's query acquire another Location graph. The registry stores plain schema values and filters an in-memory snapshot.

## Avoid recursive observation

Subscriber observability must not observe itself through the same registry.

Rules:

- Registry mutations never publish to Bus.
- `SubscriberRegistry.watch()` observers are not registered as subscribers.
- A future `/api/subscriber/watch` transport is excluded from per-subscriber records.
- Delivery of registry changes does not increment tracked delivery activity.
- Metrics export is write-only and does not subscribe back through the registry.
- If observer count matters, expose one out-of-band aggregate gauge.

Without this boundary, observing subscriber addition creates another addition and an endless feedback loop.

## Core, Server, and plugin boundaries

### Core

`SubscriberRegistry` is a global node with no Bus dependency:

```ts
makeGlobalNode({
  service: SubscriberRegistry.Service,
  layer: SubscriberRegistry.layer,
  deps: [],
})
```

Core owns models, IDs, revisions, query matching, projections, bounded change observation, and instrumentation combinators. Bus may depend on the registry; the registry must not depend on Bus.

Location-scoped registrations capture `Location.Ref` values but do not keep Location services alive.

### Server

Server owns safe connection classification and transport state:

- SSE/WebSocket route;
- bounded queue capacity and overflow;
- disconnect/close reason;
- safe client class or explicit client instance ID;
- bytes written if measured.

EventFeed keeps one upstream Bus listener and one downstream record per SSE queue. Link downstream records to the shared upstream listener with `parentID`.

### Plugins

Add a read-only `subscriber` domain to Effect and Promise plugin contexts.

Effect shape:

```ts
interface SubscriberDomain {
  readonly snapshot: (query?: Query) => Effect.Effect<Snapshot>
  readonly watch: (query?: Query) => Stream.Stream<Change, WatchOverflowError>
  readonly count: (query?: Query) => Effect.Effect<number>
}
```

Promise shape:

```ts
interface SubscriberDomain {
  readonly snapshot: (query?: Query) => Promise<Snapshot>
  readonly watch: (query?: Query, options?: { signal?: AbortSignal }) => AsyncIterable<Change>
  readonly count: (query?: Query) => Promise<number>
}
```

`PluginHost.make` binds the plugin principal and calls Core directly. Promise adaptation uses the existing plugin Scope and `Stream.toAsyncIterable` pattern.

The plugin package rule says an Effect domain must extend the corresponding Effect client API when one exists. Two valid rollout orders follow:

1. Plugin-only first: define an additional plugin-specific domain because no client Subscriber API exists yet.
2. Public API first: add Protocol/Server API, regenerate clients, then have plugin domains extend those generated APIs.

Recommendation: plugin-only first to validate the model; promote stable snapshot/watch schemas to HTTP afterward.

## Detailed instrumentation plan

### 1. EventFeed first

Register:

- one `server/event-feed-bridge` listener over Bus, layer-scoped;
- one `server/event-feed` SSE subscriber per queue, request-scoped;
- parent-link every SSE queue to the bridge;
- update delivered/drop/overflow counters;
- remove on release or overflow with an explicit reason.

Immediate benefits:

- `count({target:{namespace:"event", name:"public-feed"}}) === 0` is the strong no-client signal needed by watch retention;
- plugins can observe client attach/detach without changing EventV2;
- slow/overflowing clients become visible.

### 2. Plugin event streams

Wrap `ctx.event.subscribe()` in the host with CurrentOwner-bound tracking. Target is the public server event stream; owner is plugin ID + generation; Location is captured. This answers which plugin generations are listening and catches cleanup leaks after plugin replacement.

### 3. Durable Session log followers

Instrument only `follow:true` as an active subscriber. Record aggregate/session ID as a diagnostic instance, cursor presence (not raw cursor in summary), and Location when known. Historical `follow:false` reads are finite operations rather than ongoing listeners and should be traced, not retained in the subscriber registry.

### 4. PTY attachments

Register in the Server WebSocket handler to retain transport metadata, linked to a Core PTY-output attachment. Ensure detach, process exit, callback failure, PTY removal, and Location teardown each remove exactly one lease.

### 5. Important Core streams

Add explicit `SubscriberRegistry.track(...)` at named long-lived sites:

- Config reload feeds;
- PluginSupervisor changes;
- MCP reconnect/config feeds;
- VCS metadata events;
- SessionProjector live usage refresh;
- provider connection-update listeners.

Do not blanket-instrument every transient Stream. Explicit owner names produce useful records and bounded cardinality.

### 6. Watcher relationships

After the watch registry design lands, expose:

- logical interest subscribers, owner + Location;
- physical Watchman/Parcel subscription as parent;
- lease count and grace deadline;
- backend/root identity in diagnostic view.

This is the bridge from subscriber observability to resource-retention policy.

### 7. Hooks and transforms

Instrument plugin hook and State transform registration after event/PTY coverage. Mark these as `hook`/`attachment`, not stream subscribers. Parent them to plugin generation when possible.

Projectors should be a static topology inventory, not part of active-client counts.

## Query model

Queries use stable structured selectors:

```ts
type Query = {
  readonly owner?: {
    readonly type?: Owner["type"]
    readonly pluginID?: Plugin.ID
    readonly component?: string
  }
  readonly target?: {
    readonly namespace?: Target["namespace"]
    readonly name?: string
    readonly instance?: string
  }
  readonly location?: Location.Ref
  readonly kind?: Info["kind"]
  readonly state?: Info["state"]
  readonly view?: "summary" | "diagnostic"
}
```

No arbitrary predicate crosses a package/API boundary. Internal callers can use helper functions over snapshots when they need richer logic.

Useful derived questions:

```text
no public clients attached?
  count(target=event/public-feed, kind=stream) == 0

which plugins listen to events here?
  snapshot(owner.type=plugin, target.namespace=event, location=current)

is this PTY observed?
  count(target=pty/output, target.instance=<ptyID>) > 0

which physical watches have no logical subscribers but remain in grace?
  snapshot(target=filesystem/physical-watch, state=draining)
```

## Optional HTTP API

Once plugin use validates schemas, add a process-global authenticated group:

```text
GET /api/subscriber
  -> safe snapshot

GET /api/subscriber/watch
  -> snapshot-first SSE change stream
```

This endpoint should remain outside Location middleware, like `/api/event`; Location is a query filter. It must expose only safe views.

Do not register `/api/subscriber/watch` in the registry itself. Do not use EventV2 or the public event feed as its transport. After changing Protocol/`HttpApi`, run `bun run generate` in `packages/client`; never edit generated sources directly.

`server.connected` may eventually include `subscriberID`, `processID`, capacity, and heartbeat interval so a client can correlate itself with diagnostics. This is additive metadata, not SSE replay identity.

## Metrics and cardinality

Safe metrics:

```text
opencode_subscribers_active{
  owner_type,
  component,
  target_namespace,
  target_name,
  delivery_type
}

opencode_subscriber_registrations_total{target_namespace,target_name}
opencode_subscriber_removals_total{reason,target_namespace,target_name}
opencode_subscriber_overflows_total{target_namespace,target_name,delivery_type}
```

Never use Subscriber ID, plugin ID, Session ID, PTY ID, path, Location directory, peer address, or target instance as a metric label. They belong in diagnostic snapshots/traces.

Performance invariants:

- registration/removal O(1);
- delivery never awaits registry observers;
- counters update without schema encoding;
- snapshot cost proportional to active records;
- independent finite observer queues;
- bounded annotation lengths and vocabularies;
- no durable writes.

## Failure semantics

| Failure | Behavior |
| --- | --- |
| subscriber scope closes | remove once with `scope-closed` |
| EventFeed queue overflows | remove immediately with `overflow`; healthy clients continue |
| callback throws | owner removes actual subscriber and registry lease together |
| registry observer overflows | fail only observer; reconnect gets fresh snapshot |
| plugin reloads | old generation scope closes all owned leases before new generation activates |
| registry shuts down | observer streams end; records disappear with process |
| instrumentation fails | subscriber operation should continue; registry mutation is designed infallible after schema construction |

Observability must not become a correctness dependency for event delivery.

## Testing

### Registry

- scoped register/remove and idempotent manual close;
- monotonic process-local revisions;
- atomic snapshot + delta handoff under concurrent mutation;
- per-observer overflow isolation;
- query matching and principal redaction;
- counters do not emit per-delivery lifecycle deltas;
- shutdown finalizes all observers;
- observing the registry does not recursively register.

### EventFeed

- bridge and per-SSE parent linkage;
- count tracks acquisition/release;
- overflow removes exactly one record with reason;
- encoding failure removes/fails every queue consistently;
- subscriber count zero matches the actual queue set at every step.

### Plugins

- plugin ID/generation owner inherited by child stream fibers;
- replacement closes old generation records;
- Effect snapshot/watch and Promise AsyncIterable agree;
- plugin principal cannot access private metadata or unauthorized Location details.

### PTY and Watcher

- every detach/end/error path removes once;
- shared physical parent remains while logical subscribers change;
- Location scope teardown removes logical records without retaining Location services.

## Incremental delivery

1. Add Schema models and Core `SubscriberRegistry`, with scoped registration, snapshots, bounded snapshot-first watch, queries, views, and tests.
2. Instrument EventFeed bridge and per-SSE queues. Expose internal `count` to retention consumers.
3. Add read-only Effect and Promise plugin domains; bind plugin owner/generation.
4. Track plugin event subscriptions and important named Core streams.
5. Instrument PTY WebSocket/Core attachments.
6. Integrate logical/physical filesystem watch records.
7. Add hooks/transforms and static projector inventory.
8. Stabilize schemas, then optionally add Protocol/HTTP endpoints and regenerate clients.
9. Add low-cardinality metrics after lifecycle/cardinality measurements.

## Decisions

- One Core-global, in-memory registry; no Bus dependency and no durable events.
- Scoped leases are the default lifecycle.
- Owner, target, and delivery are separate dimensions.
- Snapshot-first bounded change streams, not unbounded full-state SubscriptionRef updates.
- Read-only rich plugin access is a first-class goal.
- EventFeed subscriber count zero is authoritative and the first instrumentation target.
- Unknown client/Session identity stays unknown until clients explicitly publish it.
- Registry observers are excluded to prevent recursive observation.
- Projectors/hooks remain distinguishable from discretionary stream subscribers.
- Plugin-only exposure precedes a public HTTP API unless external tooling requires it sooner.

## Open questions

1. Should the public name be `SubscriberRegistry`, `SubscriberObservability`, or `Subscriptions`? `SubscriberRegistry` best describes ownership; `Subscriptions` may read better in plugin APIs.
2. Should plugins see cross-Location diagnostic records by default, or only current Location plus server summaries?
3. Which explicit client header/handshake should classify TUI/desktop/web and carry a stable instance ID?
4. Should recently removed records be retained in a small bounded ring for flap diagnosis, or should traces/logs own history?
5. Does the first HTTP API need only summary/snapshot, or a streaming diagnostic endpoint immediately?

## Cross-references

- [`specs/v2/event-stream-architecture.md`](/specs/v2/event-stream-architecture.md) — EventFeed's global scope, independent queue law, and Core/Server ownership boundary.
- [`packages/server/src/event-feed.ts`](/packages/server/src/event-feed.ts) — authoritative current SSE subscriber set.
- [`packages/core/src/bus.ts`](/packages/core/src/bus.ts) — live, typed, durable, callback, and projector relationships.
- [`packages/core/src/pty.ts`](/packages/core/src/pty.ts) — explicit attachment lifecycle and useful resource identity.
- [`packages/core/src/plugin/host.ts`](/packages/core/src/plugin/host.ts) — insertion point for read-only plugin access and owner-bound event tracking.
- [`packages/plugin/AGENTS.md`](/packages/plugin/AGENTS.md) — Effect/Promise domain and generated client API constraints.
