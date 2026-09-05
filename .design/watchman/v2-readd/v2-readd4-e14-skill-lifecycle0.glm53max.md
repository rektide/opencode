---
type: Evidence
title: E14 Skill attached-latch lifecycle and race matrix
description: Executable and source-pinned verdict on whether an owner-local Skill readiness latch avoids initial loops, preserves a recovery invalidation, and settles after one authoritative refresh under exact W1 invalidation ordering.
resource: /.design/watchman/v2-readd/v2-readd4-e14-skill-lifecycle0.glm53max.md
tags: [opencode, watchman, v2, skill, fibermap, pubsub, rcmap, concurrency, evidence]
status: draft
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - { id: upstream, resource: "https://github.com/anomalyco/opencode/commit/4306c07b340b9a0504e65785f366d2793cd1b169", title: "OpenCode v2 carrier base (Skill owner, watcher, plugin runtime)" }
  - { id: effect, resource: "https://github.com/Effect-TS/effect/tree/2600f62f4532026928454dcea8d1c48557b3f942", title: "effect@4.0.0-rc.112 (FiberMap, PubSub, RcMap, Stream, TestClock)" }
  - { id: carrier-w1, resource: "file:///home/rektide/src/opencode-watchman-v2-readd", title: "Carrier commit 620fc620b67f, watcher readiness generation-aware (W1)" }
  - { id: brief, resource: "/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md", title: "v4 evidence brief with E14 ask and attached-latch proposal" }
  - { id: dirty, resource: "/.design/watchman/v2-readd/v2-readd4-dirty.gpt56solxh.md", title: "Dirty design with the first-onReady-call gate (E14 decision)" }
  - { id: harness, resource: "file:///home/rektide/tmp-opencode/v4-p5-skill-lifecycle", title: "Deterministic harness and 15-test matrix on effect@4.0.0-rc.112" }
---

# E14 Skill attached-latch lifecycle and race matrix

## One-sentence answer

Under exact W1 ordering, only the dirty design's first-`onReady`-call gate (a per-watch boolean flipped **inside** the first `onReady` invocation) avoids the initial refresh loop, preserves every recovery invalidation that lands at or after the subscriber's logical `PubSub.subscribe`, and settles after exactly one authoritative refresh per externally-triggered cycle; the v4 evidence brief's post-subscribe `attached` latch provably self-loops because its flag is already true when the initial `onReady` runs, and **no** latch of any shape can cover an invalidation published while the owner is logically detached (slow initial attach, or the `FiberMap.clear` → re-`PubSub.subscribe` window inside a refresh), because that signal is never enqueued for the subscriber at all — a subscribe-gap property that only the owner's own authoritative scan bounds.

## Exact sources and environment

| Material | Pin | What it established |
| --- | --- | --- |
| Skill owner | [`packages/core/src/config/plugin/skill.ts`](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/src/config/plugin/skill.ts) @ `4306c07b` | Actual owner: `FiberMap.make` L32, `PubSub.sliding<string>(1)` L33, `Semaphore.makeUnsafe(1)` L34, `watch()` L36-46 (`watcher.subscribe` without `onReady` + `FiberMap.run(..., { onlyIfMissing: true, startImmediately: true })`), `refresh()` L154-178 (`FiberMap.clear` → per-source watch **then** scan), debounce(100ms) consumer L176-181, initial `refresh()` L182, `ctx.skill.transform` seed L183-186, `config.updated` consumer L187-196. |
| Upstream watcher | [`packages/core/src/filesystem/watcher.ts`](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/src/filesystem/watcher.ts) @ `4306c07b` | `subscribe(input, onReady?)` contract L65; pipeline L129-144: `RcMap.get` → `PubSub.subscribe` L141 → `isShutdown` L142 → initial `onReady` L143 → `Stream.fromSubscription` L144; RcMap lookup L94-124 (`PubSub.unbounded` acquire-release L97, native `acquireRelease(..., { interruptible: true })` L112, `undefined` → `PubSub.shutdown` L116). |
| Carrier W1 watcher | `packages/core/src/filesystem/watcher.ts` @ `620fc620b67f` | `NativeSignal` L60-62; entry `publish`/`invalidate` closures → `PubSub.publishUnsafe` L106-108; `subscribe` L136-161: `PubSub.subscribe` L148 → `isShutdown` L149 → initial `onReady` L150 → `fromSubscription` with `Stream.mapEffect` replaying `onReady` for every invalidation L152-153 and `Stream.filter` dropping invalidations from the update stream L155. |
| Effect | `effect@4.0.0-rc.112` = `2600f62f` | `FiberMap.make` scoped with `interruptAll` finalizer (FiberMap.ts L162-190); `runImpl` forks an **independent root fiber** via `Effect.runForkWith(parent.context)` with auto-remove on completion (L789-830) — no supervision tie to the refreshing fiber; `clear` = awaited `interruptAllAs` (L706); `remove` = awaited `interruptAs` (L652). `PubSub.sliding` unscoped (PubSub.ts L427); `PubSub.subscribe` scoped, receives only messages published **after** subscription (L1082). `RcMap.get`: synchronous `refCount++` or forked lookup in the entry scope, release finalizer in the caller's scope (RcMap.ts L335-395, release L452). `Stream.debounce` reads `Clock` (Stream.ts L7654+), so TestClock drives it. |
| Plugin runtime | `packages/core/src/plugin.ts` + `plugin/supervisor.ts` @ `4306c07b` | Plugin effect is **awaited** inside `Plugin.load` with a per-activation forked scope (plugin.ts L44-86, context scope override L70); replacement/removal closes the activation scope (L135, L211); supervisor `activate` re-resolves generations (supervisor.ts L136+). Skill state `reload` → `notify` publishes `Skill.Event.Updated` on the bus (skill.ts L114, L119) with no watcher feedback path. |
| Executable harness | `/home/rektide/tmp-opencode/v4-p5-skill-lifecycle` (see its README) | npm `effect@4.0.0-rc.112` (version verified in `node_modules/effect/package.json`); line-faithful transcriptions of the W1 watcher pipeline and the Skill owner; 15 deterministic TestClock tests, all passing; one mutation sensitivity check. |

## Lifecycle model (pinned, not assumed)

Startup through steady state for one directory source:

1. Plugin activation awaits the plugin effect. The effect creates the FiberMap,
   sliding(1) `changes` PubSub, lock, then the debounce consumer
   (`Stream.fromSubscription |> debounce("100 millis") |> runForEach(refresh(file) *> ctx.skill.reload())`)
   and the `config.updated` consumer, both `forkScoped`.
2. Initial `refresh()` runs under the lock: `FiberMap.clear` (awaited
   interruption of all watch fibers → stream finalizers → RcMap release →
   native unsubscribe when refcount hits 0), then per source `watch()` **before**
   the authoritative scan. `watch()` calls `watcher.subscribe` (returns a
   `Stream.unwrap` value; **no** native contact yet), then `FiberMap.run`
   forks an independent root fiber that, on consumption: `RcMap.get` (creates
   the entry, runs the native attach) → `PubSub.subscribe` (logical queue
   attaches) → shutdown check → initial `onReady` → consume.
3. W1 ordering inside that fiber is total for the subscriber: the logical
   queue attaches **before** initial `onReady`; every signal published after
   `PubSub.subscribe` is enqueued and replayed **in order**, and each
   invalidation signal runs `onReady` again (mapEffect) before the next
   update reaches the owner's `runForEach`.
4. A delivered invalidation therefore reaches `onReady` as its **second or
   later** invocation whenever the subscriber was attached at publish time —
   which is exactly what a first-call gate needs and what a pre-set flag
   destroys.
5. Disposal (project/plugin scope close) interrupts the consumers, runs the
   FiberMap finalizer (awaited `interruptAll`), releases RcMap refs, and
   unsubscribes the native; `changes` is unscoped in rc.112 and is simply
   orphaned with no publishers.

## Adversarial trace and test matrix

Fifteen deterministic tests (`skill-lifecycle.test.ts`) plus one mutation
check; transcript in `results/final-run.txt`. Loop verdicts use a growth
detector over two separated 600 ms virtual-time windows; delivery verdicts
settle on exact counts.

| # | Scenario (assignment term) | Trace under exact W1 ordering | Verdict (test) |
| --- | --- | --- | --- |
| 1 | Initial load, v3 literal (publish in every `onReady`) | initial refresh → re-watch → initial `onReady` publishes → debounced refresh → clear/rebuild → publish → … unbounded at ~1 refresh/100 ms | **Loops** (pass) |
| 2 | Immediately after attachment, v4 `attachedAfterSubscribe` (flag set after `watcher.subscribe` returns, before `FiberMap.run` starts consumption) | consumption runs the inner `Stream.unwrap` effect only inside the forked fiber, so the flag is already true at the initial `onReady`; identical loop to #1 | **Loops** (pass) |
| 3 | Owner-level single `attached` flag flipped at first-ever `onReady` | quiet through initial refresh; the first externally-triggered refresh's re-watch initial `onReady` sees `attached=true`, publishes → unbounded | **Loops after any external refresh** (pass) |
| 4 | Initial load, first-call gate | first `onReady` flips the per-watch bit and publishes nothing; nothing else publishes; counts frozen | **Settles: 1 refresh, 0 reloads, 0 publishes** (pass) |
| 5 | Stream failure/reacquisition — steady-state recovery | invalidation after settled attach → second `onReady` call → publish → exactly one debounced refresh → re-watch initial suppressed → stable; native churn exactly 2 subscribes / 1 unsubscribe when Skill is sole ref | **Preserved, settles at 2 refreshes / 1 reload** (pass) |
| 6 | Invalidation queued between `PubSub.subscribe` and initial `onReady` (harness `onAttached`, one-shot) | queue attaches first, so the signal is enqueued; initial call (suppressed) flips the latch; the queued invalidation replays as the second call → publish → one refresh | **Preserved** — the worst-case landing for the latch is covered (pass) |
| 7 | Invalidation **before** stream attachment (slow attach, no logical subscriber) | entry pubsub exists but has zero subscribers; `invalidate()` is dropped by the PubSub; after release, the new subscriber's initial `onReady` is suppressed and nothing is delivered | **Missed by every latch** (pass) — subscribe-gap, not latch, property |
| 8 | Repeated bursts inside one debounce window | sliding(1) + 100 ms debounce coalesce 3 invalidations + 1 update into one refresh | **1 refresh** (pass) |
| 9 | Reload interrupted / project disposal mid-refresh | config refresh parked at a scan barrier; scope close interrupts it under the lock; no further refresh/reload; subscribes == unsubscribes | **Clean disposal, frozen counts** (pass) |
| 10 | Invalidation after disposal | native inputs all unregistered; publish is a no-op; counts frozen | **Inert** (pass) |
| 11 | Unsupported backend (`native.subscribe` → `undefined`) | lookup shuts the entry pubsub; subscriber gets `Stream.empty`; watch fiber completes and auto-removes from the FiberMap; no `onReady` ever, no loop, **no reattachment ever** | **Silent watch death, no loop** (pass) |
| 12 | Overlapping consumer calls (config.updated + debounced refresh) | lock serializes refresh bodies; re-watch attaches before the scan parks, so an invalidation during the parked reload is delivered to the already-reattached subscriber → exactly one queued refresh after release | **2→3 refreshes, serialized, settles** (pass) |
| 13 | Repeated bursts across rounds (5 invalidations, sequentially delivered) | each delivered invalidation produces exactly one refresh; publishes == delivered invalidations | **6 refreshes / 5 reloads / 5 publishes, stable** (pass) |
| 14 | Shared physical entry (Config-like second subscriber) | Skill's clear releases only its ref; the entry and native subscription survive; invalidation replays both subscribers' `onReady`; Skill re-attach initial suppressed | **Shared entry preserved (1 subscribe, 0 unsubscribes), both owners converge** (pass) |
| 15 | Mutation sensitivity | making the v4 variant flip its flag inside the first `onReady` call breaks the loop and **fails** test #2 | Tests genuinely distinguish the two timings (checked) |

## Results

1. **Which latch is sound.** Only the first-`onReady`-call gate (dirty design,
   [`v2-readd4-dirty`](v2-readd4-dirty.gpt56solxh.md) "Skill first-readiness
   gate") is sound. The v4 evidence brief's bullet 3 ("mark attached before
   starting stream consumption") is the precise defect: under W1, "starting
   stream consumption" *is* what runs the initial `onReady`, so any flag set
   between `watcher.subscribe` returning and the first pull is observed as
   already attached. The dirty design's rejection of the owner-journal latch
   is confirmed executable, and the mutation check shows the tests are
   sensitive to exactly this timing.
2. **Recovery invalidation is preserved iff the subscriber is logically
   attached at publish time.** W1's ordering — `PubSub.subscribe` before
   initial `onReady`, sequential in-order replay, invalidation replayed as a
   later `onReady` call before later updates — guarantees that every enqueued
   invalidation reaches a post-latch call. Tests 5, 6, 12, 13, 14 prove
   delivery and one-refresh settlement in every attached configuration,
   including during a parked reload and on a shared entry.
3. **The uncovered races are subscribe gaps, not latch races.** An
   invalidation published while the owner has no logical subscription (slow
   initial attach — test 7; the microscopic `FiberMap.clear` →
   `PubSub.subscribe` window inside a refresh — source-argued below; after
   unsupported-backend stream death — test 11) is never enqueued and cannot be
   recovered by any owner-side latch. The owner's authoritative scan bounds
   the exposure: state as of scan time is captured regardless of watcher
   state; only changes occurring after the scan of a directory and before its
   re-subscription wait for the next event. This window exists upstream with
   Parcel today and widens with slow Watchman attaches; it is not introduced
   by the latch.
4. **Settlement without self-triggered loops is proven for the gate.** After
   any cycle, the only future publishes come from externally-published
   invalidations or updates; a fresh initial attach never publishes (test 4,
   13, 15 contrast). Recorded side-fact: when Skill is the sole subscriber,
   every refresh tears down and re-attaches the native watch (subscribes grow
   1:1 with refreshes — test 5); with a shared entry, refreshes cause no
   native churn (test 14). Bounded churn, not a loop.
5. **Disposal is clean.** The plugin-effect scope model (awaited load;
   activation-scope close on replacement) plus the FiberMap finalizer and
   awaited `interruptAllAs` leave no survivors (tests 9, 10); late
   invalidations are inert because the native inputs are unregistered.

## Known / unknown / confidence

- **Known (source).** Skill owner structure, W1 pipeline ordering, FiberMap /
  PubSub / RcMap / debounce semantics, plugin scope lifecycle — all cited to
  exact revisions and lines above. Watch fibers are independent roots
  (`runForkWith(parent.context)`), so they survive the refreshing fiber and
  die only with the map/scope.
- **Known (executable).** 15/15 deterministic tests pass on npm
  `effect@4.0.0-rc.112`; the mutation check proves loop-sensitivity. Re-run:
  `cd /home/rektide/tmp-opencode/v4-p5-skill-lifecycle && bun test`.
- **Unknown / residual (labeled abstraction gaps).**
  1. The clear→re-subscribe window inside a refresh is real (yields between
     `FiberMap.clear` L156 and the forked fiber's `PubSub.subscribe`) but too
     small to schedule deterministically without more harness hooks; its
     behavior is source-argued (missed by Skill, delivered to any other
     attached owner, bounded by the refresh scan).
  2. The harness fake Native never models "native.subscribe resolves after
     its caller was interrupted" — that is E04's pre-return-cleanup gap and
     out of E14 scope; likewise daemon-side fresh-instance, pending-stream,
     and release-latency behavior (E03/E05/E12/E16) only change *when*
     `invalidate()` fires, not what a delivered signal does to this owner.
  3. URL sources, the symlink file-watch branch (E10), and SkillFile parsing
     are stubbed; the symlink branch adds `file`-type watches that Node
     serves and that never receive invalidation under W1, so it cannot change
     these verdicts.
  4. Production observability of the scan-before-attach miss window needs
     live-daemon evidence (E16/E20 domain), which this research did not run.
- **Confidence.** High on loop/settle verdicts (executable, mutation-checked,
  source-cited); high on preservation for attached subscribers; medium-high
  on the miss windows (schedulable one proven, microscopic one
  source-argued).

## Factual constraints for any design that consumes this

1. The Skill latch must flip its per-watch state **inside** the first
   `onReady` invocation of that watch; any flag set before stream consumption
   starts is observable as already-attached and self-loops.
2. The gate is correct only because W1 attaches the logical subscription
   before the initial `onReady` and replays invalidations in order as later
   `onReady` calls; weakening either ordering voids the proof.
3. No owner-side latch can recover an invalidation published while detached;
   if that window must be closed, the fix is a readiness barrier before the
   authoritative scan (scan after `onReady`), not a different latch.
4. Every Skill refresh pays one native unsubscribe/subscribe cycle when Skill
   is the last subscriber of a physical key; a shared key amortizes this.
5. Unsupported-backend watches die silently under W1 (`Stream.empty`, no
   `onReady`, no reattachment); a selected Watchman backend must therefore
   never return `undefined` for demanded directories (per the pending-stream
   decision in E05).
6. Disposal correctness depends on the FiberMap being created in the plugin
   activation scope; moving watch fibers to detached scopes would reintroduce
   leak paths outside this matrix.
7. These results are pinned to `4306c07b`, carrier W1 `620fc620b67f`, and
   `effect@4.0.0-rc.112` (`2600f62f`); re-verify the FiberMap root-fork and
   PubSub delivery semantics on any Effect upgrade.

## Cross-references

- [`v2-readd4.gpt56solxh.md`](v2-readd4.gpt56solxh.md) — E14 ask and the
  attached-latch proposal (lines 596-616) whose post-subscribe reading is
  disproven here; invariant 20 (Skill converges, non-looping) is proven only
  for the first-call gate.
- [`v2-readd4-dirty.gpt56solxh.md`](v2-readd4-dirty.gpt56solxh.md) — the
  first-`onReady`-call gate adopted here as the only sound variant; its
  "Skill first-readiness gate" section is confirmed executable and its
  rejection of the post-subscribe flag is proven by tests 2 and 15.
- [`v2-owners0.glm53max.md`](v2-owners0.glm53max.md) — discovered the Skill
  readiness livelock this matrix reproduces as strategy `none`.
- [`v2-readd4-e04-interleavings0.gpt56solmax.md`](v2-readd4-e04-interleavings0.gpt56solmax.md) — Effect rc.112
  cancellation/RcMap/scope semantics this report reuses; its pre-return
  native-interruption gap remains open and explicitly out of E14 scope.
- [`v2-readd4-validation1.gpt56solxh.md`](v2-readd4-validation1.gpt56solxh.md) —
  wave-three assignment P5/E14 that this document answers; its "Owner
  convergence: Insufficient → E14 Skill behavior open" row can now move to
  strong-with-residuals.
- Harness and transcript:
  [`/home/rektide/tmp-opencode/v4-p5-skill-lifecycle`](file:///home/rektide/tmp-opencode/v4-p5-skill-lifecycle)
  (`README.md`, `harness/`, `results/final-run.txt`).
