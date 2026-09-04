---
type: Design
title: Typed watcher updates — the watcher-level invalidation contract
description: Future design for widening Watcher.Update itself to an exact-event / subtree-invalidation union, superseding the Config-boundary typing chosen for the near term; written up now so the end-state contract is not lost.
resource: /.design/watchman/typed-watcher0.glm53.md
tags: [opencode, watchman, watcher, invalidation, contract, future-design]
status: draft # deliberately deferred; B2 is the near-term encoding
generated: { by: model:glm-5.3, at: 2026-09-03T00:00:00-04:00 }
verified: { by: none, at: never }
stale_after: 2026-12-01
sources:
  - id: consolidation-vision
    resource: /.design/watchman/vision0.gpt56s.md
    title: Watchman consolidation vision and direction decision
  - id: architecture-review
    resource: /.design/watchman/review-architecture0.gpt56s.md
    title: Adversarial analysis of cursorless invalidation and update contracts
  - id: failure-path-review
    resource: /.design/watchman/review-failure-paths0.gpt56s.md
    title: Pre-ack publication loss and delivery-timing findings
  - id: ownership-review
    resource: /.design/watchman/review-ownership0.gpt56s.md
    title: Watcher seam carry-risk map
  - id: vcs-watching
    resource: /.design/watchman/watches.glm53.md
    title: VCS-internal watch targets as invalidation-native consumers
  - id: watcher-source
    resource: /packages/core/src/filesystem/watcher.ts
    title: Current Update type and registry
---

# Typed watcher updates — the watcher-level invalidation contract

## Status

This is a **future design, deliberately deferred**. The decided near-term
encoding (2026-09-03, see the vision's direction-decision addendum) is **B2**:
Config classifies its own watched-root paths and emits a tagged invalidation
on `Config.changes`. This document writes up the deeper variant — widening
`Watcher.Update` itself — at the user's request, so the end-state contract
survives as a designed target rather than folklore. Nothing here is
scheduled.

## The problem it solves

`Watcher.Update` is today an alias of `ParcelWatcher.Event`:

```ts
export type Update = ParcelWatcher.Event   // { path, type: "create" | "update" | "delete" }
```

Every value on a watch stream is therefore an **exact filesystem event at a
specific path**. But the system increasingly needs to say something the type
cannot express:

> *Continuity was lost; the current state of everything under `path` is
> unknown; rescan.*

Today that message can only be smuggled:

- **B1 (rejected):** as a fake ordinary `{path: watchedRoot, type: "update"}`,
  indistinguishable from a genuine event at that directory — each consumer
  must know the convention.
- **B2 (decided):** by mediation — Config, which knows its watched roots,
  re-classifies and re-tags at its own boundary. Honest for Config's three
  domain consumers, but every other owner (Skill, the future VCS owner, any
  future watcher consumer) must reinvent the convention or be mediated.

The system-wide truth the reviews established is that **watching is an
invalidation signal for refresh-on-signal owners**; the type should be able
to say so.

## Proposed shape

```ts
export type Update =
  | { readonly path: string; readonly type: "create" | "update" | "delete" } // exact event
  | { readonly type: "invalidation"; readonly path: string }                 // subtree unknown; rescan
```

Notes on the shape:

- The exact-event member is structurally `ParcelWatcher.Event`, so Parcel and
  Node adapters keep producing it with no producer-side change; only
  consumers that exhaustively handle `Update` must grow a case.
- The member name and field (`type: "invalidation"`, `path`) are chosen to
  match B2's tag vocabulary exactly, per the direction decision — the
  eventual migration is moving the tag down a layer, not renaming it.
- `path` on the invalidation member is the highest watched subtree whose
  continuity was lost (the subscription target), never a guess about which
  descendant changed.

## Who produces invalidations

| Producer | Transition | Today's workaround |
| --- | --- | --- |
| Watchman backend | re-establishment after generation loss, fresh-instance PDU, canceled PDU, route change | fake root-path update, or `ready` metadata |
| Watchman backend | initial acknowledgement | the private `ready` callback |
| Generic watcher | re-acquisition of a failed/reacquired Parcel or Node physical watch | none — silent EOF today (see the failure-path review's inactive-acquisition finding) |
| Parcel / Node adapters | never spontaneously | — |

The generic-watcher row is the quiet payoff: once physical-watch recovery
exists (the same slice that must make inactive acquisition visible), *every*
backend can promise "you will be told when continuity breaks," uniformly.

## The hard prerequisite: delivery ordering

The failure-path review proved that publications made while
`native.subscribe()` is still inside `RcMap.lookup` are dropped —
`Stream.fromPubSub` is attached only after lookup returns. That is why the
`ready` callback exists as a side channel, and why **initial-ack
invalidation cannot simply ride the stream today**, at any typing.

So this design is inseparable from one generic-watcher fix, in either form:

1. buffer publications until the first logical subscriber attaches; or
2. attach the hub eagerly per key and replay buffered updates to late
   subscribers within an acquisition epoch.

Until one of those lands, `ready` remains the initial-acknowledgement path
even under the typed union; the typed design then covers the *later*
continuity-loss transitions and lets `ready` retire when ordering is fixed.

## Migration path from B2 (why B2 is not throwaway work)

1. **B2 (now):** `Config.changes` emits
   `Watcher.Update | { type: "invalidation"; path }`. Agent, Command, and
   Plugin Source switch on the tag.
2. **Watcher-level union (later):** the same tag becomes a `Watcher.Update`
   member. Config's classification site is deleted;
   `Config.changes` becomes a pass-through of the watcher-level union; the
   three consumers' switches survive **unchanged** because the vocabulary
   matches.
3. Owners consuming `interests.changes` directly (Skill, VCS) stop needing
   their own coarse-by-convention interpretation and switch on the member.

Net cost of deferral: one classification site to delete later. Net benefit of
deferral: the `watcher.ts` public type and every structural `Native`
implementation — the ownership review's highest-risk seam — stay frozen while
the backend policy settles.

## Blast radius when it lands

- [`watcher.ts`](/packages/core/src/filesystem/watcher.ts): the `Update`
  alias becomes a union; `Interface.subscribe` stream type; `Test.emit`.
- Consumers that must handle the member: `interests.ts`, `config.ts` +
  agent/command/source, `skill.ts`, the VCS owner, `location-watcher.ts`
  (exact-only: file watches can ignore invalidation or treat it as a rescan
  trigger), `instruction.ts` and `source.ts` entrypoint file watches
  (exact-only).
- The `FileSystem.Event.Changed` **bus** schema is unchanged —
  `location-watcher` maps exact events to add/change/unlink today and would
  map invalidation to a change event on the subtree path (or a bus extension,
  decided then); in-process watch streams are the only widening surface.
- Test doubles everywhere `Watcher.Test.emit` or hand-built updates exist.
- Carry: this is exactly the "structural implementations and upstream tests"
  fallout the ownership review flagged for `Watcher.Native`/public-type
  changes — it belongs in the era of the upstream PR, not the era of the
  backend rewrite.

## What it unlocks beyond B2

- **Every owner gets invalidation natively** — VCS watching
  ([`watches.glm53.md`](/.design/watchman/watches.glm53.md)) is
  invalidation-native and would consume the member directly instead of
  treating all events as coarse by convention.
- **A uniform continuity promise across backends**, including Parcel/Node
  once generic reacquisition exists.
- **An upstreamable contract**: "directory watching is exact events plus
  explicit invalidation on continuity loss" is a proposal; a path-shape
  convention is not.
- Retirement of the `ready` metadata side channel once delivery ordering is
  fixed.

## Revisit triggers

Recorded so the deferral is a decision, not neglect:

1. Generic physical-watch recovery lands (inactive-acquisition visibility +
   reacquisition) — the natural moment, since it adds the third producer.
2. A second non-Config owner needs native invalidation (the VCS owner is
   close; it can live on `interests.changes` conventions until then).
3. Preparation of the upstream Watcher/Watchman PR begins.

## Cross-references

- [`vision0.gpt56s.md`](/.design/watchman/vision0.gpt56s.md) — the
  direction-decision addendum records B2 as the near-term encoding and this
  document as the deferred end state; the event-contract fork analysis is the
  context.
- [`review-architecture0.gpt56s.md`](/.design/watchman/review-architecture0.gpt56s.md)
  — the adversarial analysis of path-coalescing vs typed invalidation
  ("an ancestor target path is not safely distinguishable from an ordinary
  update"), which this design resolves at the type level.
- [`review-failure-paths0.gpt56s.md`](/.design/watchman/review-failure-paths0.gpt56s.md)
  — the pre-ack publication drop that makes delivery ordering the hard
  prerequisite.
- [`review-ownership0.gpt56s.md`](/.design/watchman/review-ownership0.gpt56s.md)
  — why widening the public watcher type is deferred to the upstream-PR era.
- [`watches.glm53.md`](/.design/watchman/watches.glm53.md) — the
  invalidation-native VCS consumer that most benefits once this lands.
- [`files-too0.glm53.md`](/.design/watchman/files-too0.glm53.md) — the
  exact-only file-watch consumers that would simply ignore the member.
