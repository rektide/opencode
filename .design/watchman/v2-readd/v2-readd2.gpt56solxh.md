---
type: Plan
title: Carry-first Watchman rebuild on upstream v2
description: A revision of the v2 Watchman re-add that retains the thin-adapter and fork-audit discipline, rejects synthetic invalidation and verbatim backend carry, and separates an upstream-shaped lifecycle shim from a freshly re-authored exact-root backend.
resource: /.design/watchman/v2-readd/v2-readd2.gpt56solxh.md
tags: [opencode, watchman, v2, backend, carrier, upstream, readiness, invalidation, rebuild, plan]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: position-2
    resource: /.design/watchman/v2-readd/v2-readd1.glm53max.md
    title: Position-2 thin-adapter re-add plan
    author: model:glm-5.3-max
    last_modified: 2026-09-05
  - id: source-grounded-plan
    resource: /.design/watchman/v2-readd/v2-reintroduction-plan0.gpt56solxh.md
    title: Source-grounded v2 reintroduction plan
    author: model:openai/gpt-5.6-sol-xhigh
    last_modified: 2026-09-05
  - id: conflict-map
    resource: /.design/watchman/v2-readd/v2-conflict0.glm53h.md
    title: Watchman branch against v2 conflict map
    author: model:glm-5.3-high
    last_modified: 2026-09-05
  - id: upstream-tip
    resource: https://github.com/anomalyco/opencode/commit/4306c07b340b9a0504e65785f366d2793cd1b169
    title: OpenCode v2 tip assessed by this revision
    author: anomalyco/opencode contributors
    last_modified: 2026-09-05
  - id: implemented-line
    resource: /.design/watchman/maintenance.glm53.md
    title: Implemented root-scoped Watchman backend record
    author: model:gpt-5.6-terra
    last_modified: 2026-09-04
  - id: failure-audit
    resource: /.design/watchman/review-failure-paths0.gpt56s.md
    title: Watchman failure-path and deterministic-test audit
    author: model:openai/gpt-5.6-sol
    last_modified: 2026-09-01
---

# Carry-first Watchman rebuild on upstream v2

## Decision

Build a **fresh carrier from the latest `v2@origin`**, but do not interpret
“thin adapter” as “copy the backend unchanged and never touch the substrate.”
The carryable shape has three deliberately separate strata:

1. **Upstream substrate, adopted whole:** `WatchInput`, `entries`, Node
   file/entry watching, attachment-safe `onReady`, `ConfigDiscovery`,
   `ConfigWatch.plan`, and owner `FiberMap`s.
2. **Two small generic upstream candidates:** an internal native invalidation
   signal that re-runs the existing `onReady`, and Config-local typed
   invalidation for its indirect source consumers.
3. **A freshly re-authored downstream backend:** Watchman transport, exact-root
   controller, fresh-clock recovery, bounded acquisition, static selection,
   tests, and minimal options.

This is the best carrier because the large code is isolated in new backend
files, while every edit to an upstream-owned file is small, generic, separately
committed, and suitable for proposing upstream. We chase upstream's API rather
than replacing it: the public call remains
`subscribe(input, onReady?)`, and upstream's plans continue to own desired
state.

The first carrier uses **one exact Watchman root per recursive target**. Project
root consolidation is valuable, but current upstream gives the native backend
no project/root hint. It becomes a measured, separately upstreamable API
proposal rather than hidden metadata in the fork.

## Which plan actually carries

“Carryable” means more than “the files do not textually conflict.” A plan is
carryable when:

- upstream-owned algorithms remain upstream's;
- downstream policy is concentrated in new modules;
- generic seam changes can be reviewed independently of Watchman;
- removing a landed upstream patch deletes a downstream commit rather than
  requiring architectural surgery;
- a fresh `v2@origin` can be adopted without replaying historical design
  transitions; and
- the feature remains correct when the adapter is unavailable or recovering.

| Plan | Mechanical carry | Semantic carry | Verdict |
| --- | --- | --- | --- |
| [`v2-readd0`](/.design/watchman/v2-readd/v2-readd0.glm53max.md): merge the old line | Poor: the merge permanently composes 94 historical commits and contested owner code | Mixed: it can be made correct, but old and new ownership models remain entangled | Do not use |
| [`v2-readd1`](/.design/watchman/v2-readd/v2-readd1.glm53max.md): verbatim backend + unmodified substrate | Looks excellent because most files are new | Fails at its bridge: no placement input, no route for its claimed terminal loudness, and pre-acquisition publications have no attached logical subscriber | Keep its discipline, not its literal architecture |
| [`v2-reintroduction-plan0`](/.design/watchman/v2-readd/v2-reintroduction-plan0.gpt56solxh.md): broad clean re-authoring | Good new-line mechanics | Strong semantics, but too many downstream-owned API changes if all land in the fork at once | Use as the correctness source; narrow its seam |
| **This revision**: upstream substrate + two proposal commits + new exact-root backend | High | High for reported loss and owner convergence; root consolidation remains explicitly deferred | Recommended |

The “big nice rebuild” is therefore viable. Its size belongs **behind** the
native boundary—in state machines, protocol typing, deterministic tests, and
recovery—not in a forked Config planner or replacement Watcher API.

## What `v2-readd1` contributes

[`v2-readd1`](/.design/watchman/v2-readd/v2-readd1.glm53max.md) has several ideas worth
retaining.

### Keep outright

1. **Position 2:** start from `v2@origin`, not from a merge of the historical
   feature line.
2. **Become a backend:** upstream owns desired-state planning; Watchman owns
   physical recursive observation.
3. **A spike before a large carry:** test the smallest disputed seam against
   upstream's real lifecycle before building the controller.
4. **Unmodified upstream tests as the floor:** watcher, Config, reload, Skill,
   and location suites must remain green.
5. **Fork-surface audit as acceptance:** inspect `jj diff v2@origin..@`, not
   only test results.
6. **A full behavior carry table:** no proven requirement disappears merely
   because its old module is retired.
7. **Post-carrier upstream proposals:** generic lifecycle, reconciliation, and
   root/ignore plumbing should shrink the fork rather than accrete in it.

### Keep, but change materially

| `v2-readd1` idea | Revision |
| --- | --- |
| Thin adapter | Keep one small adapter, but re-author the controller and protocol modules around current input/readiness semantics. |
| Backend owns failure | Yes for transport recovery. Owner convergence still needs an explicit lifecycle signal; ownership does not mean concealing continuity loss. |
| Persistent streams | Keep them for recoverable backend loss. Initial acquisition remains pending; established subscriptions survive recovery. |
| `onReady` | Keep the public API exactly, but permit it to run once per attached delivery generation, not only once per logical subscription. |
| Carry every option | Carry only backend selection, binary, command timeout, and acquisition limit. Add knobs only when evidence requires them. |
| Carry metrics | Carry the transition vocabulary and test observations, not the custom 550-line renderer. |
| Carry ignores | Pass upstream owner ignores through; suppress Watchman's own cookie artifacts inside the adapter. |
| Root registry | Start with exact recursive targets. Add project consolidation only through an explicit root-hint API. |

### Reject

1. **Synthetic invalidation as an ordinary path update.** Recovery is not a
   filesystem update at the root path. This recreates the fabricated-event
   problem the prior review already identified.
2. **“Carry the backend verbatim.”** `root.ts` embeds cursor continuation,
   hidden placement, a `fail` callback, `Scope`, and fabricated update behavior
   that do not exist in the upstream contract.
3. **“Placement becomes adapter-internal.”** The adapter receives only
   `type`, `target`, `ignore`, `names`, and `publish`; it cannot infer the
   current `Location` project root without duplicating owner discovery or using
   daemon-side `watch-project`.
4. **Cursor recovery as the final state.** The accepted correction is fresh
   clock plus owner reread. Copying the cursor state would preserve the known
   subscribe-response-loss problem.
5. **Whole-corpus ignore override.** Patching `ConfigWatch.plan`'s hardcoded
   policy makes every upstream change to the plan our conflict. Backend cookie
   artifacts belong in the backend.
6. **Verbatim console metrics.** New-file status makes them mechanically easy
   to copy, not cheap to own.
7. **The original loudness spike's initial-failure assertion.** It cannot work
   through the current API as stated.

## Why the original loudness bridge cannot work

Upstream's watcher lifecycle is ordered as follows
([`watcher.ts`, lines 94-145](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/src/filesystem/watcher.ts#L94-L145)):

```text
RcMap.get
→ await native.subscribe
→ subscribe the logical consumer to the physical PubSub
→ run onReady
→ return the update stream
```

During initial acquisition, `native.subscribe` has a `publish` callback but the
logical `PubSub` subscriber does not yet exist. Therefore an invalidation
published while initial acquisition is pending or terminally failing is
dropped. The exact Gate-0 success condition in `v2-readd1`—an owner observing a
synthetic invalidation from terminal initial acquisition while the stream stays
alive—cannot be met without changing the seam.

After an established subscription, synthetic publication would be delivered,
but it would still lie about an exact path update and would not distinguish
continuity recovery from real file activity.

The correction is a small ordered **internal control signal**, not a fabricated
public update.

## The carrier seam

### Public API: keep upstream's

Do not replace the positional API with an options object in the initial carrier.
Do not widen `Watcher.Update`. Keep:

```ts
subscribe(input: WatchInput, onReady?: Effect.Effect<void>): Effect.Effect<Stream.Stream<Update>>
```

The sole semantic extension is:

> `onReady` runs after the logical subscriber is attached to the initial
> physical generation and again after any replacement generation is attached.

This is a natural generalization of “ready,” preserves every existing caller,
and lets current upstream owners use the same reread effect for both the
scan-to-subscribe gap and a later continuity gap.

### Internal native signal: upstream candidate U1

Add one callback to the internal native input:

```ts
type NativeInput = Target & {
  readonly publish: (update: Update) => void
  readonly invalidate: () => void
}
```

The Watcher service uses one ordered internal `PubSub` with two private members:

```ts
type NativeSignal =
  | { readonly type: "update"; readonly update: Update }
  | { readonly type: "invalidation" }
```

- `publish` enqueues `update`.
- `invalidate` enqueues `invalidation`.
- Each logical subscriber maps `invalidation` to its own `onReady` effect and
  filters it out of the returned exact-update stream.
- Initial readiness remains the existing direct call after `PubSub.subscribe`.
- Default Node and Parcel natives never call `invalidate`, so their behavior is
  unchanged.

This modifies one upstream implementation file and its test. It does not expose
Watchman types, does not change `WatchInput`, and is useful for any native
backend capable of replacing a delivery generation. Keep it as a standalone
commit suitable for upstream submission.

### Config invalidation: upstream candidate U2

Recurring `onReady` causes Config to reread its documents, but that alone is not
enough. Agent, Command, and Plugin Source parse files beneath Config roots that
are not represented by Config document equality. If those files changed during
an outage, `reload()` can find equal Config documents and emit no
`config.updated` event.

Config therefore owns a small typed union:

```ts
export type Change =
  | Watcher.Update
  | { readonly type: "invalidation"; readonly path: string }
```

Its `onReady` effect publishes this control fact and requests the existing
debounced reload. Agent, Command, and Plugin Source handle `invalidation`
before exact-path filtering. Skill supplies an `onReady` effect that triggers
its existing authoritative rescan queue.

This is historical B2, not watcher-level B3: `Watcher.Update` remains exact.
Keep the change as a second standalone upstream candidate. It is independently
useful once any backend can reacquire.

## Downstream backend: rebuild, do not transplant

### Exact-root first

For each upstream `directory` target:

1. preserve its logical path as the event namespace;
2. resolve its current canonical directory;
3. send plain `watch <canonical-target>`;
4. subscribe at that root with no project discovery; and
5. map daemon file names back beneath the logical target path.

Equivalent logical directory inputs are already shared by upstream's `RcMap`.
The initial carrier therefore needs one controller per distinct recursive
target, not the donor's second nested-interest registry.

This gives up cross-target project-root consolidation temporarily. In return it
requires no `Location` dependency, hidden placement, owner modification, or
`watch-project`. It is the maximum-carry baseline and a useful measurement
point: the live gate records root count, overlapping roots, cold acquisition,
and daemon resource cost.

### Symlink topology stays inside the backend

Plain `watch` canonicalizes a symlink target. If the logical directory itself
is a symlink, the controller also retains a Node parent-entry sentinel for that
one logical basename. A changed canonical destination retires the old delivery
generation, watches the new exact root, and emits internal invalidation after
attachment.

This preserves upstream's logical plan key and avoids teaching Config about
Watchman physical routing. Skill's existing canonical-target and symlink-file
watches continue unchanged. Tests must pin event-path mapping and symlink
retargeting before this mechanism is accepted; if the backend sentinel cannot
be made race-safe, root preparation becomes an explicit upstream proposal
rather than a hidden Config patch.

### Project consolidation: upstream candidate U3, only if measured

If exact-root evidence shows unacceptable overlap, propose a generic root hint
without changing logical `WatchInput`:

```ts
subscribe(
  input: WatchInput,
  onReady?: Effect.Effect<void>,
  root?: string,
): Effect.Effect<Stream.Stream<Update>>
```

The exact syntax is **not decided here**; upstream API taste should choose an
options object, a prepared target, or another shape. The semantic proposal is:

- an owner may provide a known recursive root;
- the native validates that the target is contained by it;
- the physical key includes the root;
- backends that cannot share relative subscriptions ignore the hint without
  changing logical events; and
- no backend performs marker-based project discovery.

Only after that seam exists should the donor's one-controller-per-project and
multiple-relative-subscription behavior return. Do not smuggle placement
through symbols while waiting.

## Root controller contract

The freshly authored exact-root controller retains these donor invariants:

- one active raw client and serialized command path per target;
- deadlines begin after command submission;
- one close transition per generation;
- initial and replacement acquisition share one function;
- selected Watchman never calls Parcel;
- retained demand survives recoverable loss;
- release interrupts pending acquisition and prevents resurrection;
- one global coordinator bounds simultaneous cold roots; and
- one daemon-outage circuit admits a single half-open probe.

It deliberately changes recovery:

```text
initial:
  connect → capability → watch exact target → clock → subscribe → return Subscription
  → upstream attaches logical subscriber → upstream runs onReady

replacement:
  close old generation → bounded reacquire → watch exact target
  → fresh clock → subscribe → invalidate internal signal
  → every attached owner runs onReady → exact delivery resumes
```

No cursor survives generation loss. No `SubscriptionState.clock`, compatible
route branch, cursor rejection fallback, response-row replay policy, or
fabricated target update survives.

Initial daemon unavailability keeps `native.subscribe` pending under bounded
retry. This does not block Config construction because upstream starts watch
effects in `FiberMap`; Config has already loaded an initial snapshot. `onReady`
runs only when attachment is real.

After establishment, connection loss, command timeout, malformed protocol
input, and cancellation all enter bounded recovery. With no stable structured
daemon error vocabulary, the carrier does not guess permanent policy from
prose. Persistent incompatibility is an observable capped retry state, not a
fallback or hot loop. Invalid local containment is a programmer defect and may
fail directly.

Transport module construction failure while Watchman is explicitly selected
fails Watcher-layer construction visibly. This is distinct from a missing or
temporarily unavailable daemon socket, which remains an availability state.

## Carry disposition

### Keep behavior and likely code

| Artifact | Disposition |
| --- | --- |
| `schema.ts` | Reuse protocol shapes after auditing optional stock-Watchman and Watchwoman fields. |
| `client.ts` | Reuse raw factory validation and admitted-command mechanics; preserve raw diagnostics and remove cursor assumptions. |
| `acquisition.ts` | Reuse the coordinator after its cancellation/half-open tests pass independently. |
| backend selection | Keep static `parcel | watchman`, with Node hard-routed for `file` and `entries`. |
| deterministic raw-client tests | Reuse scenario vocabulary and controls; rewrite around the new state machine. |
| live test launcher | Reuse the opt-in pattern; expand provenance and negative-window recording. |

### Keep behavior, rewrite code

| Artifact | Disposition |
| --- | --- |
| `root.ts` | Rebuild as one exact-target controller; fresh clocks and internal invalidation replace cursor/placement machinery. |
| `backend.ts` | Rebuild as a small composite: delegate `file`/`entries` to upstream Native, route only `directory` to Watchman. |
| root sharing | Upstream `RcMap` shares equivalent targets now; project sharing waits for U3. |
| failure propagation | Supervisor retries and internal invalidation replace stream errors and owner resubscribe loops. |
| readiness | Upstream public `onReady` replaces hidden metadata and becomes generation-aware through U1. |
| Config convergence | Upstream plan/reconcile remains; U2 adds owner-local invalidation without replacing it. |

### Throw out

- `WatcherInternal` and symbol-attached placement/readiness.
- `WatchInterests` and the donor Config/Skill desired-state implementation.
- The donor `Stream<Update, Error>`/`fail`/`Scope` substrate fork.
- Every Watchman-to-Parcel fallback.
- Cursor continuation and compatibility branches.
- Synthetic root-path updates for readiness, cancellation, or recovery.
- `watch-project` and routine `watch-del`.
- The custom metrics renderer and metrics mode/interval API.
- Public retry-base/retry-cap and Parcel subscribe-timeout knobs in the first
  carrier.
- Broad replacement of upstream's Config ignore list.
- `AGENTS.md` deletion as feature work; repository policy files follow upstream
  and workspace governance independently of Watchman.

## Fork budget

The final diff is grouped by ownership rather than merely counted.

### Upstream-owned and unchanged

- `packages/core/src/config/discovery.ts`
- `packages/core/src/config/watch.ts`
- `WatchInput` and exact `Watcher.Update` definitions
- Node `file`/`entries` implementation
- Parcel directory implementation
- Config and Skill `FiberMap` ownership

### Upstream candidates, isolated commits

1. `packages/core/src/filesystem/watcher.ts` plus its tests: internal
   invalidation re-runs existing `onReady`.
2. `packages/core/src/config.ts`, Agent, Command, Plugin Source, Skill, and
   focused tests: Config-local invalidation and Skill ready-rescan.
3. Optional and evidence-gated: a generic known-root hint.

### Downstream-only perimeter

- `packages/core/src/filesystem/watcher/watchman/**`
- Watchman fixtures/tests
- transport dependency and lockfile
- additive backend selection/options
- server and CLI wiring
- Watchman setup/operations documentation

No downstream commit may replace upstream planning, generic reconciliation, or
the public exact-update union. If implementation appears to require that, stop
and formulate an upstream proposal before expanding the fork.

## Corrected spike

The spike tests the real seam question, not synthetic-event loudness.

In a scratch line directly from current `v2@origin`:

1. Add the internal `invalidate()` callback and private ordered signal in
   `watcher.ts`.
2. Use a fake Native that acquires once, publishes an exact update, calls
   `invalidate`, and publishes another exact update.
3. Attach two logical subscribers with distinct `onReady` effects.
4. Prove:
   - each initial `onReady` runs after its subscriber attaches;
   - `invalidate` reaches both attached subscribers exactly once;
   - each readiness effect completes before its subscriber observes the later
     exact update;
   - no invalidation appears in either exact update stream;
   - adding/removing one logical subscriber does not reacquire/release the
     shared native prematurely; and
   - upstream's existing watcher suite remains otherwise unchanged and green.

Then add a minimal fake Watchman exact-root controller and prove:

- initial socket absence leaves readiness pending while another root can
  acquire;
- initial success triggers upstream's ordinary initial readiness;
- established loss reattaches from a fresh clock and calls native
  `invalidate`;
- Parcel is never invoked under selected Watchman; and
- release during recovery leaves no retry fiber.

If this spike fails, do **not** fall back to the merge plan. Record why the
small generic seam is insufficient and revise the upstream proposal. The old
line remains evidence, not the emergency architecture.

## Implementation and upstreaming stack

Keep upstream candidates at the bottom of the change stack and Watchman code
above them. When upstream lands an equivalent capability, the corresponding
candidate commit can disappear cleanly.

1. **`refactor(core): make watcher readiness generation-aware`**
   - U1 only: private native invalidation signal, recurring existing `onReady`,
     fake-Native ordering tests.
   - No Watchman import or option.
2. **`fix(core): invalidate config sources after watch reacquisition`**
   - U2 only: Config change union, three indirect consumers, Skill rescan, tests.
   - No Watchman import or daemon terminology.
3. **`test(core): add scripted Watchman protocol actor`**
   - Named barriers and fake generations; no fixed sleeps.
4. **`feat(core): add exact-root Watchman directory backend`**
   - Transport, audited schemas, exact-root happy path, event mapping, cookie
     suppression, static Node/entries split.
5. **`fix(core): supervise Watchman delivery generations`**
   - Shared initial/replacement function, fresh clocks, cancellation, timeout,
     malformed PDU recovery, release fencing, internal invalidation.
6. **`fix(core): bound Watchman root acquisition`**
   - Global admission and outage circuit, independently tested.
7. **`fix(core): follow Watchman symlink root changes`**
   - Backend-owned logical-root sentinel and canonical retarget tests, only if
     the spike validates this ownership.
8. **`feat(server): expose the Watchman directory backend`**
   - `watcherBackend`, binary, command timeout, acquisition limit; CLI/env and
     server validation.
9. **`test(core): validate Watchman-compatible daemons`**
   - Stock Watchman where available, intended Watchwoman revision, provenance,
     root/resource measurements, and bounded negative windows.
10. **`docs(watchman): record the upstream-shaped carrier`**
    - User setup, exact-root cost, failure semantics, fork audit, and upstream
      proposal status.

Submit or track U1 and U2 independently as soon as their focused tests are
green; they need not wait for the whole backend. U3 waits for exact-root live
measurements. A generic `WatchSet` and public watcher-level invalidation remain
later proposals, not carrier prerequisites.

## Verification and carry gates

### Behavioral floor

- Upstream watcher/config/reload/Skill/location tests remain green.
- Node exclusively owns `file` and `entries` under both backend selections.
- Parcel remains byte-for-behavior unchanged and the default.
- Selected Watchman never invokes Parcel.
- Initial readiness and replacement readiness both occur after attachment.
- Config indirect consumers and Skill converge after a forced outage.
- Every replacement uses a fresh clock; no cursor field exists.
- Distinct exact roots acquire and recover independently.
- Acquisition is bounded during daemon absence and drains through one probe.
- Release during pending acquisition/recovery cannot resurrect demand.
- Cookie events are excluded server-side and client-side.
- Symlink root retargeting either passes the backend-owned sentinel suite or is
  explicitly blocked on U3/root-preparation design.

### Carry audit

At each refresh, classify every changed path in `jj diff v2@origin..@` as:

1. upstream candidate U1/U2/U3;
2. downstream backend/perimeter;
3. generated lockfile; or
4. unexplained drift, which blocks completion.

The audit fails if it finds:

- modifications to `config/discovery.ts` or `config/watch.ts`;
- hidden metadata attached to `WatchInput`;
- a public synthetic path convention;
- a Watchman-to-Parcel edge;
- cursor recovery;
- daemon root discovery;
- generic owner reconciliation copied downstream; or
- Watchman-specific types in U1/U2.

### Refresh protocol

1. Refresh `v2@origin` and record the exact upstream commit.
2. Rerun the U1/U2 focused suites against that API before touching backend
   code.
3. Re-author small conflicts to the new upstream idiom; do not preserve our
   spelling merely to reduce diff.
4. Re-run the fork audit after each upstream-owned commit.
5. Keep backend changes above the candidate commits so landed upstream work is
   removable.
6. Preserve the historical feature branch and this design corpus as evidence;
   do not merge their ancestry into the carrier.

## What “big” means here

The carrier is intentionally ambitious in the places we can own durably:

- a typed protocol boundary;
- a small, explicit generation state machine;
- deterministic scheduling controls instead of sleeps;
- root-local failure and fleet-wide acquisition control;
- fresh-clock convergence;
- exact separation of data events from lifecycle control;
- symlink/topology tests;
- compatibility evidence against both daemon lineages; and
- an audited, removable upstream patch stack.

It is intentionally conservative in upstream-owned architecture. A big forked
API is not a big nice rebuild; it is a future merge obligation. The desirable
expansions—root hints, generic watch-set execution, richer typed lifecycle, and
host telemetry—advance as upstream proposals or not at all.

## Cross-references

- [`v2-readd1.glm53max.md`](/.design/watchman/v2-readd/v2-readd1.glm53max.md) contributes
  Position 2, the thin-adapter objective, spike gate, carry table, unchanged
  upstream floor, and fork-surface audit. This revision supersedes its verbatim
  carry, synthetic invalidation, cursor, metrics, ignore, and placement claims.
- [`v2-reintroduction-plan0.gpt56solxh.md`](/.design/watchman/v2-readd/v2-reintroduction-plan0.gpt56solxh.md)
  supplies the fresh-clock controller, explicit donor disposition, Config
  indirect-consumer analysis, and deterministic scenario set. This revision
  narrows its public subscription-options/error-channel changes to U1/U2.
- [`v2-conflict0.glm53h.md`](/.design/watchman/v2-readd/v2-conflict0.glm53h.md) remains
  the measured collision map. Starting clean from upstream makes its textual
  merge rules historical while retaining its semantic warnings.
- [`review-failure-paths0.gpt56s.md`](/.design/watchman/review-failure-paths0.gpt56s.md)
  is the evidence behind attachment ordering, response loss, visible
  continuity recovery, and deterministic failure tests.
- [`review-simplification0.gpt56s.md`](/.design/watchman/review-simplification0.gpt56s.md)
  supplies static selection, retry-owned availability, and no-fallback policy.
- [`vision0.gpt56s.md`, lines 883-929](/.design/watchman/vision0.gpt56s.md#L883-L929)
  records Config-local B2, fresh clocks, cursor deletion, and the trigger for
  reconsidering richer watcher lifecycle. This carrier implements B2 through
  U2 while leaving public B3 separate.
- [`maintenance.glm53.md`](/.design/watchman/maintenance.glm53.md) remains the
  donor behavior and operations record; its implementation layout is not the
  carrier template.
