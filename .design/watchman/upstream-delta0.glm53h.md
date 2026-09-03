---
type: Design
title: Upstream delta check for the carrier1 rebuild baseline
description: Assessment of v2@origin movement since carrier1's frozen baseline and the adaptations the remade Watchman plan needs before construction.
resource: /.design/watchman/upstream-delta0.glm53h.md
tags: [opencode, watchman, watcher, upstream, carrier, rebase, config-watch]
status: stable
generated: { by: model:glm-5.3-high, at: 2026-09-03 }
verified: { by: none, at: never }
stale_after: 2026-09-17
sources:
  - id: assessed-carrier
    resource: /.design/watchman/carrier1.gpt56s.md
    title: Watchman remade as continuity-aware filesystem observation
    author: model:gpt-5.6-sol
    last_modified: 2026-09-03
  - id: old-baseline
    resource: https://github.com/anomalyco/opencode/commit/4772b6a3e8c2eaeb7594503c4584fb225c75bb15
    title: OpenCode v2 baseline at the carrier1 design freeze (#46876)
    author: anomalyco/opencode contributors
    last_modified: 2026-09-02
  - id: new-tip
    resource: https://github.com/anomalyco/opencode/commit/43bd2a516ba16ccea6c867cf533718bd57288ec6
    title: OpenCode v2 tip assessed here (#46963)
    author: anomalyco/opencode contributors
    last_modified: 2026-09-03
  - id: key-commit-watch-config
    resource: https://github.com/anomalyco/opencode/commit/24f6cb51c85139378f3f39688c8596c003da60d4
    title: fix(core) watch new config files and directories (#46925)
    author: anomalyco/opencode contributors
    last_modified: 2026-09-03
  - id: key-commit-watcher-policy
    resource: https://github.com/anomalyco/opencode/commit/4680a4aa6f84f4f2680b267b0607b26218fb921b
    title: refactor(core) reconcile current watcher policy (#46949)
    author: anomalyco/opencode contributors
    last_modified: 2026-09-02
  - id: ownership-review
    resource: /.design/watchman/review-ownership0.gpt56s.md
    title: Watchman downstream ownership and carryability audit
    author: model:gpt-5.6-sol
    last_modified: 2026-09-01
  - id: maintenance-log
    resource: /.design/watchman/README.md
    title: Root-scoped Watchman maintenance log
    author: model:gpt-5.6-terra
    last_modified: 2026-09-01
---

# Upstream delta check for the carrier1 rebuild baseline

## What this is checking

[`carrier1.gpt56s.md`](/.design/watchman/carrier1.gpt56s.md) froze its
architecture against `v2@origin` `4772b6a3e8c2` (#46876, "refactor: rename
State drafts to editors") and asserted that this baseline "contains no competing
Watchman backend, owned-watch module, typed watcher invalidation, or VCS-interest
owner". The carrier also mandated that execution re-resolve and re-pin the
then-current upstream commit rather than build on the recorded hash.

`v2@origin` has since moved to `43bd2a516b` (#46963, "refactor(cli): move
update checks to TUI clients"): 84 commits, 409 files, +11,446/−4,044, a linear
move with the carrier baseline still an ancestor. The historical
implementation line's last freshen (see the
[README](/.design/watchman/README.md)) was onto `43d09b9d`; upstream has landed
substantial work past even that point, in exactly the seams this carrier plans
to rebuild.

The verdict up front: **the carrier's core architecture is intact and still
holds — static selection, the Watchman root supervisor, cursorless
establishment, and the VCS stack are untouched upstream. But the generic
foundation steps (carrier construction steps 2 and 3) must be re-planned:
upstream landed a source-derived config watch plan, an entries watch kind, and a
public readiness acknowledgement in the watcher interface the same day the
carrier froze.** One of the carrier's four baseline claims is now false, two of
its motivating defect narratives are partially resolved upstream by different
mechanisms, and its migration surface grew.

## The relevant delta

Of the 84 commits, four land inside or adjacent to the watcher substrate and
its consumers. Everything else (desktop, TUI, AI providers, updates, CLI
packaging) does not intersect the carrier.

| Commit | Subject | Carrier relevance |
| --- | --- | --- |
| `24f6cb51c8` | fix(core): watch new config files and directories (#46925) | **Direct hit.** New `config/discovery.ts`, new `config/watch.ts`, rewritten `config.ts` reconcile loop, reworked `filesystem/watcher.ts`, +617/−203 across 9 files. |
| `59b29de409` | fix(core): detect new ecosystem config roots (#47026) | Follow-up to #46925: discovery now finds `.claude`/`.agents` roots during the upward walk. |
| `4680a4aa6f` | refactor(core): reconcile current watcher policy (#46949) | LocationWatcher reads `policy.current()` each reconcile and drops its request-counter dedup. |
| `36da0d5c77` | fix(core): retry failed location initialization (#46957) | `location-services.ts` evicts and retries failed Location builds; affects when watcher-bearing layers boot, not the watcher contract. |

Adjacent but non-structural: plugin-supervisor activation timing (#46922,
#46899) and a `models: { fetch: false }` addition to `server/test/vcs.test.ts`.
No commit touches `vcs.ts`, the VCS schema, or any VCS provider.

New files in the delta that the carrier must now treat as upstream-owned:

- `packages/core/src/config/discovery.ts` — `ConfigDiscovery.discover` returns a
  `Sources` shape: `global`, `explicit`, `direct`, `project` (with `present`
  flags), `claude`, `agents`.
- `packages/core/src/config/watch.ts` — `ConfigWatch.plan(sources)` produces the
  complete desired watch plan: present project directories as directory watches
  with fixed ignores, plus **parent-directory entries watches** for every
  watched file "so deletion/recreation is observable".
- `packages/core/test/config/watch.test.ts`, heavily grown
  `test/config/reload.test.ts` (+166) and `test/filesystem/watcher.test.ts`
  (+226 across #46925/#46949).
- `packages/core/script/benchmark-location-memory.ts` — a loaded-host memory
  benchmark, directly useful for the carrier's resource/isolation measurement
  posture.

## What changed in each seam

### The watcher substrate (`packages/core/src/filesystem/watcher.ts`)

At the carrier baseline, `Watcher.Interface.subscribe(input)` returned a stream
with no readiness signal, and `WatchInput` had only `file` and `directory`.
Three things are new:

1. **A third watch kind, `entries`.** `WatchInput` gained
   `{ type: "entries", names }`: a non-recursive `fs.watch` on a directory,
   filtered to specific entry names. File watching is now implemented the same
   way — `fs.watch(parentDir, { recursive: false })` filtered to the file's
   basename — so a file watch survives deletion and recreation of its target
   natively. Directory watches still route to Parcel with structural `RcMap`
   keys ("equivalent watches share one entry") and `SUBSCRIBE_TIMEOUT_MS =
   10_000` is retained.
2. **`onReady` is a public interface parameter.**
   `subscribe(input, onReady?)` now runs the caller's effect after the `RcMap`
   acquisition resolves and after `PubSub.subscribe` attaches, before the
   stream is returned. The sequencing — attach the logical subscriber, *then*
   acknowledge readiness — is upstream's fix for the scan-to-subscribe gap.
   `Config` passes `requestReload` as its `onReady`: "Readiness rescans
   recover writes made before a watch attached."
3. **Unsupported backends still end silently.** When the native subscription
   returns `undefined`, the PubSub shuts down and subscriber streams resolve as
   `Stream.empty` — healthy-looking end-of-stream. The carrier's "terminal loss
   is visible" promise remains a live, unclaimed delta.

A remaining subtlety the carrier analyzed survives: for the *first* subscriber
of a directory watch, events published while the Parcel acquisition promise is
pending land in a zero-subscriber PubSub and drop. Upstream covers that window
with the `onReady` rescan of truth; the carrier covers it with an invalidation
as the epoch's first observable fact. Same convergence guarantee, different
seam — stream-native and multi-subscriber-safe in the carrier, callback-based
and per-subscriber upstream.

### The Config owner (`packages/core/src/config.ts`)

At baseline, Config already had `changes(): Stream<Watcher.Update>` and a
`reconcileWatches` loop keyed on loaded config **entries**. #46925 replaced the
entry-derived loop with a **source-derived plan**:

- `ConfigDiscovery.discover` walks upward from the location directory, resolves
  global/direct/project/claude/agents sources including roots that do not exist
  yet.
- `ConfigWatch.plan(sources)` derives directory watches plus parent entries
  sentinels for files outside watched directories.
- `reconcileWatches` diffs that plan against a `FiberMap` of live watch fibers:
  remove keys no longer desired, subscribe new targets with
  `onReady = requestReload`, publish updates into the `changes` feed, and
  request a debounced (100 ms) reload per event.

This is, in Config-specific form, the carrier's step-3 deliverable: an
owner-local desired-plan reconciliation with missing-file sentinels and
deletion/recreation observability. It landed as a bug fix ("config files
created after startup were never watched") rather than as architecture, but the
mechanism is the same shape as the carrier's `WatchSet`.

### The other owners

- **Skill** (`config/plugin/skill.ts`): signature narrowing only. The
  `firstMissing` ancestor sentinel, symlink double-watch, and debounced rescan
  are unchanged.
- **Plugin Source** (`config/plugin/source.ts`): configured entrypoints outside
  config roots are now watched as `directory` or `file` depending on `isDir`,
  entrypoints come from `Host.resolve`, and staleness is `max(mtime)` across
  entrypoints plus `package.json`. Still "watch on first sighting, never
  individually torn down", as the carrier described.
- **LocationWatcher** (`filesystem/location-watcher.ts`): each reconcile reads
  `policy.current()` for ignores and the request-counter dedup is gone; it
  still observes exact VCS metadata through the Node path and publishes exact
  `FileSystem.Event.Changed` events.
- **Instruction** (`config/plugin/instruction.ts`): unchanged direct
  `watcher.subscribe({ path, type: "file" })` consumer — it belongs on the
  carrier's migration list.

### Server/CLI assembly

Unchanged in shape: `server/src/options.ts` still exposes
`fs.filewatcher: boolean` and `routes.ts` still composes
`Watcher.node.replace(Watcher.configured({ enabled: options.fs?.filewatcher }))`.
The carrier's discriminated selection surface composes with the same seam.

### What did not move

Re-verified at `43bd2a516b`:

- **No Watchman backend**: the only "watchman" matches upstream are UI
  file-icon assets. No competing backend exists.
- **No typed watcher invalidation**: `Watcher.Update` is still
  `ParcelWatcher.Event`; there is no invalidation member, no failure channel on
  the stream, and unsupported backends end silently.
- **No VCS-interest owner**: `vcs.ts` is untouched. `location.vcs.store`
  (worktree/common-directory split), `VcsEvent.BranchUpdated`, and `Vcs.Info`
  all exist exactly as the carrier's VCS section assumes.
- The compatibility bus (`FileSystem.Event.Changed`) and `Event.Updated`
  aliasing are intact.

So three of the carrier's four baseline claims still hold. The fourth — "no
owned-watch module" — is now false: `config/watch.ts` and the source-derived
reconcile loop are an owned-watch module for Config.

## Section-by-section impact on carrier1

| carrier1 section | Status | Adaptation needed |
| --- | --- | --- |
| Big picture, three roles, promises | Intact | None. Upstream movement converges toward the same owner/substrate split. |
| Design axes — truth, information, backend selection, placement | Intact | None. Static selection has no upstream competition. |
| Design axis — initial ordering | **Shifted** | Upstream fixed attach-then-ready ordering via public `onReady`. Reframe from "fix the ordering defect" to "generalize the fix stream-natively": invalidation as first observable fact, one per subscriber, no callback parameter. |
| Design axis — plan ownership | **Partially landed upstream** | `WatchSet` is no longer the first plan reconciliation in the codebase; it must justify itself as the *generic* extraction of what Config now does inline. |
| Interfaces and module depth | Intact in intent | `WatchIntent` sketch must model the `entries` kind (or define `file` as sugar over `entries`). `onReady` removal is now a one-call-site migration (`config.ts`), with contract tests attached. |
| Typed continuity — acquisition ordering | **Shifted** | The "private `ready` side channel" narrative is stale: the callback is public and correctly sequenced after attachment. The remaining first-subscriber pre-attach drop window is still real and is the honest motivation, plus Watchman replay/recovery invalidations which `onReady` cannot express. |
| Typed continuity — idempotence, backpressure, bus honesty | Intact | Unbounded PubSubs upstream confirm the backpressure delta is still unclaimed. |
| Static adapter selection and placement | Intact | `fs.filewatcher` seam unchanged; discriminated selection composes as planned. |
| Process-global sharing | Intact, extended | `RcMap` structural keys already implement in-process sharing; the key now also includes entries `names`. The carrier normalizes across owners as designed. |
| Watchman root module, cursorless establishment | **Untouched upstream** | None. Build as written. |
| Failure model | Intact | Silent `Stream.empty` on unsupported backends keeps "terminal loss is visible" a live delta. |
| VCS metadata section | **Untouched upstream** | None. All file/symbol claims verified at the new tip. |
| Observation posture | Intact, reinforced | Upstream added `watcher started/stopped/subscribe` log spans at the native seam — aligned with the carrier's narrow-tracing choice. |
| Verification | **Grew** | Import upstream's new scenarios (below); fold new test files into the keep-green baseline. |
| Construction outline steps 1, 4–8 | Intact | Re-pin (`43bd2a516b` or later at execution); steps 4–8 unchanged mechanically. |
| Construction outline steps 2–3 | **Re-plan** | See adaptations. |

## Required adaptations

1. **Re-pin the base.** Already mandated by the carrier; concretely, execution
   resolves the then-current `v2@origin` (at least `43bd2a516b` today) and
   records it. The old line's `watchman@upstream` bookmark and freshen history
   in the [README](/.design/watchman/README.md) show this workflow is routine
   here.

2. **Decide the `WatchSet` strategy against `ConfigWatch`.** Recommended:
   generalize upstream's landed mechanism rather than bypass it. Introduce the
   watch-set module as the generic form of `ConfigDiscovery.Sources →
   ConfigWatch.plan → FiberMap reconcile`, migrate Config onto it, and delete
   the Config-specific plan only when the generic one covers the sentinel and
   parent-watch cases upstream's tests now pin. This is a stronger upstreamable
   story than introducing reconciliation cold, and it matches the carrier's
   "generic changes proposed upstream before the full downstream backend"
   freedom.

3. **Replace `onReady` with the typed invalidation contract, deliberately.**
   The migration surface is small — `config.ts` is the only call site — but
   `test/config/reload.test.ts` and `watcher.test.ts` now pin readiness-rescan
   behavior. The carrier's replacement must preserve the observable outcome
   (a write made before attachment is recovered) through the stream-native
   mechanism (initial invalidation per logical subscriber), and those tests
   become convergence-scenario seeds rather than blockers.

4. **Model `entries` in `WatchIntent`.** Either add the kind or define file
   intents as entries-on-parent internally. Note the simplification: upstream's
   parent-entries implementation already gives file watches
   deletion/recreation survivability, so the carrier's file-sentinel
   reconciliation work shrinks to missing *ancestor directories* (Skill's
   `firstMissing` remains the example).

5. **Refresh the collision and carry inventory.**
   [`review-ownership0.gpt56s.md`](/.design/watchman/review-ownership0.gpt56s.md)
   predates these commits; its upstream-owned hotspot list must add
   `config/discovery.ts`, `config/watch.ts`, the `config.ts` reconcile loop,
   `config/plugin/instruction.ts` (as a migration consumer),
   `test/config/watch.test.ts`, the grown `reload.test.ts`/`watcher.test.ts`,
   and `location-services.ts` build-retry behavior.

6. **Import upstream convergence scenarios into the proof obligations.** Three
   carrier obligations now have upstream test analogues to track and extend:
   "mutation before first acknowledgement is recovered" (readiness rescan),
   "new config files and directories become watched" (#46925), and "new
   ecosystem config roots are detected" (#47026). The carrier's harness should
   express these through the invalidation contract, not the rescan callback.

7. **Treat live-collision risk as real.** Two of the four intersecting commits
   landed the same day the carrier froze. The carrier's step-8 "fetch upstream
   once more; freshen if moved" is likely to trigger, and its generic-foundation
   slices should be shaped for early upstream proposal (adaptation 2) so the
   seam stops moving underneath the rebuild.

8. **Amend carrier1 before construction.** When the plan is next revised, at
   minimum: correct the "no owned-watch module" baseline claim and its
   provenance note; reframe the acquisition-ordering section around the
   remaining first-subscriber window and the replay/recovery invalidations
   `onReady` cannot express; add the `entries` kind to the interface sketch;
   note `instruction.ts` in the consumer migration list. The B3 promotion
   argument is unaffected — upstream's landing of plan reconciliation
   strengthens the "preparation for an upstreamable watcher change" trigger —
   but its premises need the new citations.

## What got easier

- Config plan reconciliation, file-watch sentinels, and deletion/recreation
  observability no longer have to be introduced: they exist upstream in
  Config-specific form, tested. The carrier generalizes instead of inventing.
- `Config.changes` already carries the watcher-level union to domain owners, as
  the carrier's design anticipated.
- The new `benchmark-location-memory.ts` script gives the loaded-host
  measurement posture an upstream-maintained instrument.
- The shared `RcMap` substrate and structural keys mean the carrier's
  process-global watcher is an extension of an upstream-adopted pattern, not a
  parallel one.

## What got harder

- The rebuild now displaces a working, freshly tested upstream mechanism
  (`onReady` + source-derived reconcile) rather than filling a vacuum. The
  carrier's replacements must demonstrably preserve upstream's pinned
  behaviors, which raises the evidence bar for steps 2–3.
- The keep-green baseline grew by three test files' worth of watcher/config
  contract coverage.
- Upstream is actively investing in this seam; each construction pause invites
  another freshen cycle. Early upstreaming of the generic foundation (the
  carrier's stated freedom) is now the risk-management move, not just
  politeness.

## Verdict

The plan holds. No adaptation touches the Watchman backend itself, the root
supervisor, establishment clocking, failure scoping, static selection, or the
VCS stack — the parts that make this project what it is. The adaptations are
concentrated where the carrier always said the risk lived: the generic
foundation that touches upstream-owned modules. Upstream has since built part of
that foundation itself, in a different idiom. The rebuild should converge with
it — generalizing `ConfigWatch` into `WatchSet`, replacing `onReady` with typed
invalidation while preserving its pinned outcomes, and modeling `entries` —
rather than routing around it.

## Cross-references

- [`carrier1.gpt56s.md`](/.design/watchman/carrier1.gpt56s.md) is the assessed
  architecture. Its baseline-freeze section, acquisition-ordering narrative,
  interface sketch, and step 2–3 outline are the specific passages this check
  flags for revision.
- [`carrier1-review0.gpt56s.md`](/.design/watchman/carrier1-review0.gpt56s.md)
  is the sibling lifecycle-consistency review; its findings compose with this
  one at the next carrier revision.
- [`review-ownership0.gpt56s.md`](/.design/watchman/review-ownership0.gpt56s.md)
  is the ownership audit whose hotspot inventory adaptation 5 refreshes.
- [`typed-watcher0.glm53.md`](/.design/watchman/typed-watcher0.glm53.md) argued
  the ordering prerequisite from the old defect shape; upstream's `onReady`
  landing is the strongest evidence yet that the seam matters, and the
  invalidation union remains the carrier's stream-native answer.
- [`README.md`](/.design/watchman/README.md) holds the historical line's
  freshen records; its `watchman@upstream` bookmarking and collision-check
  discipline are the template for the re-pin adaptation.
