---
type: Design
title: Subscriber observability implementation
description: First delivered slice of the subscriber registry design — schema contracts, Core registry, plugin domains with owner attribution, and EventFeed instrumentation.
status: stable
generated: { by: llm:gpt-5.6-terra, at: 2026-08-18 }
sources:
  - id: draft0
    resource: /packages/../.design/subscribers/draft0.gpt56t.md
  - id: patches
    resource: /opencode/patches.md
---

# Subscriber observability — implementation

## What's up

This workspace implements the first deliverable of
[`draft0.gpt56t.md`](./draft0.gpt56t.md): a process-global, transport-neutral
registry that answers *who is listening to what* in a running OpenCode server.
The scope is design steps 1–4 of the draft's incremental plan (schema, Core
registry, plugin domains, EventFeed + plugin event-stream instrumentation).
Steps 5–9 (PTY, Watcher, hooks inventory, HTTP API, metrics) are deliberately
deferred — the goal was a solid, low-friction core that is easy to maintain
against upstream, not a complete surface.

Everything here is ephemeral process state. The registry never publishes
through Bus, never writes durably, and observers of the registry are not
themselves registered (no recursive observation).

## Commits

| Commit | Scope |
| --- | --- |
| `feat(schema): subscriber observability contracts` | `packages/schema/src/subscriber.ts` — `Subscriber` namespace: `ID`/`ProcessID` (prefixed, descending-order creation), `Kind`/`State`/`Namespace`/`RemovalReason` literals, `Owner` (core/server/plugin/client), `Target` (namespace/name/instance/location), `Delivery`, `Activity`, `Info`, `Update`, `Query`, `Snapshot`, `Summary`, `Change` (snapshot-first union), `WatchOverflowError`. Exported from the schema root barrel. |
| `feat(core): subscriber registry with scoped leases and snapshot-first watch` | `packages/core/src/subscriber-registry.ts` — `SubscriberRegistry.Service` global node (`makeGlobalNode`, no deps). `register` is `Effect.acquireRelease` (scope release removes exactly once; manual `close(reason)` is idempotent). `CurrentOwner` `Context.Reference` defaults to `{type:"core",component:"unknown"}`. `snapshot`/`summary`/`watch`/`count` with structured `Query` matching and `Principal` location/plugin visibility. `watch` emits one `snapshot` change then bounded dropping-queue deltas; overflow fails only that observer. Counter updates (`delivered`/`dropped`/`lag`) never emit deltas. `track(registry, input)` stream combinator. All mutations are synchronous sections, so snapshot/observer handoff cannot interleave with a mutation. |
| `feat(plugin): read-only subscriber domain with owner attribution` | `packages/plugin/src/{effect,promise}/subscriber.ts` domains + `Context.subscriber` on both plugin shapes; `packages/core/src/plugin.ts` installs `CurrentOwner = {type:"plugin", pluginID, generation}` (generation counter increments per activation batch) around each plugin effect and adds `SubscriberRegistry.node` to deps; `packages/core/src/plugin/host.ts` exposes `ctx.subscriber.{snapshot,watch,count}` bound to a location-scoped principal (own plugin ID preserved, other plugins' cross-location records redacted) and wraps `ctx.event.subscribe()` in `SubscriberRegistry.track` (target `event/public-feed`, delivery `effect-stream`). Promise adapter encodes Snapshot/Change to wire JSON and decodes Query. |
| `feat(server): instrument EventFeed subscribers in the registry` | `packages/server/src/event-feed.ts` — EventFeed accepts an optional registry; the server layer passes one (node added to `applicationServiceNodes` in `routes.ts`). One layer-scoped `server/event-feed-bridge` listener (kind `listener`, callback delivery) plus one request-scoped SSE subscriber per queue (kind `stream`, client/unknown owner, `{type:"sse",capacity}`, `parentID` → bridge). Overflow closes the record with reason `overflow`; encoding failure closes each with `failed`. `Interface.count` exposes the authoritative live-queue count. Tests pass a registry directly since `make` keeps it optional. |

The design draft0 commit (`docs(design): subscriber observability draft0`)
sits below the feature commits, rebased directly onto the current `v2@origin`
tip per the workspace conventions in
[`patches.md`](https://github.com/rektide/archive-doc/blob/main/opencode/patches.md).

## Notable divergences from draft0

- Draft's `Registration.update` returned an Effect; the implementation is a
  synchronous void — state transitions are pure in-memory mutations and
  callers never await them.
- Draft's `watch()` exposed a semaphore-guarded acquisition; the implementation
  relies on single-threaded synchronous mutation sections for the same
  snapshot-then-delta ordering guarantee, with no semaphore.
- Draft proposed `registerManual` for legacy callback APIs; EventFeed instead
  registers inside `Effect.acquireRelease` at both its lifecycles, so manual
  registration was not needed in this slice.
- `update({state})` only transitions when the state actually changes; it is a
  no-op for same-state or activity-only updates (counters live in snapshots).

## Verification

- Schema typecheck clean.
- Core: `test/subscriber-registry.test.ts` 9 pass × 5 runs (scoped
  once-removal, queries, parent linkage, counter/state semantics, atomic
  snapshot-first handoff, per-observer overflow isolation, principal
  filtering, summary grouping, no-recursive-observation);
  `test/plugin-subscriber.test.ts` 2 pass × 3 runs (owner+generation
  attribution incl. replacement cleanup; Effect and Promise domains agree);
  `test/plugin.test.ts`, `test/plugin/*`, `test/bus.test.ts` — 317 pass total
  across the 39-file focused run; Core typecheck clean.
- Plugin package typecheck clean (new domains satisfy both Context shapes;
  test host fixture extended with a default `subscriber` domain).
- Server: `test/event-feed.test.ts` 7 pass × 3 runs (original 5 unchanged
  behavior + registry mirroring + overflow removal reason); full server suite
  24 pass; Server typecheck clean.

The motivating question — *does the public EventFeed have zero subscribers?* —
is answered by `SubscriberRegistry.count({ target: { namespace: "event",
name: "public-feed" } })` (stream kind only; the bridge listener is excluded
by `kind`), or internally by `EventFeed.Interface.count`.

## Deployment notes

- `SubscriberRegistry.node` is a global node with no dependencies, so any
  runtime that builds the server routes gets it automatically; other
  entrypoints opt in by depending on the node.
- `EventFeed.make` keeps `registry` optional, preserving the standalone
  behavior tested by the upstream suite when no registry is provided.
- Plugin generations increment once per `activate` batch (not per plugin), so
  co-activated plugins share a generation number; the owner records still
  distinguish plugin IDs.

## Open questions / next steps

1. Instrument `Bus.log({follow:true})` durable followers (design step 3's
   durable-log half) — needs `Bus` to depend on the registry.
2. PTY attachments in the Server WebSocket handler (design step 5).
3. Watcher logical/physical parent linkage (design step 6, pairs with the
   watchman/grace work).
4. Promote stable snapshot/watch schemas to a Protocol HTTP API + generated
   clients (design step 8); plugin Effect domains should then extend the
   generated client API per `packages/plugin/AGENTS.md`.
5. Client classification (`tui`/`desktop`/`web`) still reports `unknown`
   until a client identity header/handshake exists (draft0 open question 3).
6. Consider a small bounded ring of recently-removed records for flap
   diagnosis (draft0 open question 4).
