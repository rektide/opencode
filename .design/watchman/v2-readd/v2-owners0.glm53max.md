---
type: Design
title: Watchman v2 re-add owner-convergence journal (round 0, W2 design authority)
description: W2 (fix(core): invalidate config sources after watch reacquisition) design verdict — Config-owned invalidation union, reload ordering and coalescing, exact-filter bypass, Skill reread loop hazard and its correct minimal design, direct configured-plugin readiness, public/internal type boundaries, focused deterministic test matrix, review of the in-flight mechanical diff with file:line, and required corrections.
resource: /.design/watchman/v2-readd/v2-owners0.glm53max.md
tags: [opencode, watchman, v2, w2, config, agent, command, source, skill, invalidation, design-journal]
status: stable
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: none, at: never }
stale_after: 2026-10-05
sources:
  - id: work-plan
    resource: /.design/watchman/v2-readd/v2-readd3.gpt56solxh.md
    title: Watchman v2 carry-first build work plan (W2 §323-386)
    author: model:openai/gpt-5.6-sol-xhigh
    last_modified: 2026-09-05
  - id: rebuild-workspace
    resource: file:///home/rektide/src/opencode-watchman-v2-readd
    title: Active rebuild workspace (parent 620fc620 = W1, working copy = in-flight W2)
  - id: round0-journal
    resource: /.design/watchman/v2-readd/v2-research0.glm53max.md
    title: Round-0 architecture journal (R1-R7 corrections)
    author: model:zai/glm-5.3-max
    last_modified: 2026-09-05
  - id: execution-journal
    resource: /.design/watchman/v2-readd/v2-execution0.glm53f.md
    title: Mechanical implementer journal (W0 preflight, W1 verification)
    author: model:zai/glm-5.3-flash
    last_modified: 2026-09-05
---

# Watchman v2 re-add owner-convergence journal — round 0 (W2)

W2 DESIGN authority journal, read-only over production. This round: validate the
W2 slice of [`v2-readd3`](/.design/watchman/v2-readd/v2-readd3.gpt56solxh.md)
against the post-W1 tree, review the mechanical implementer's in-flight W2
working-copy diff, and issue the design verdict + required corrections.
**Later continuations append dated addenda at the bottom; nothing above is
rewritten.**

## 0. Observed state (2026-09-05 ~04:30 EDT)

- W1 committed: `ornkqwlk` `620fc620` `refactor(core): make watcher readiness
  generation-aware` (parent of the working copy). All line cites below are
  pinned to the **working copy** (post-W1 + in-flight W2); upstream-pinned
  cites say `4306c07b` explicitly.
- The mechanical F implementer landed W2 changes into the working copy **while
  this review was running** (files written 04:27-04:29 EDT, then quiescent
  ~4 min at review close). Working-copy diff at freeze:
  `config.ts` (+41/-23 region), `config/plugin/agent.ts`, `config/plugin/command.ts`,
  `config/plugin/source.ts`, `filesystem/watcher.ts` (+9),
  `test/config/agent.test.ts` (+39), `test/config/command.test.ts` (+42),
  `test/plugin/supervisor-reload.test.ts` (+41).
- **`config/plugin/skill.ts` is untouched and `test/config/skill.test.ts` /
  `test/config/reload.test.ts` have no additions** — the W2 slice is
  incomplete; see §4 (S1, the critical one) and §7.

## 1. Design validation — Config-owned invalidation union

**Verdict: correct as implemented.**

- `Change` union at [`config.ts:39`](file:///home/rektide/src/opencode-watchman-v2-readd/packages/core/src/config.ts)
  (`Watcher.Update | { readonly type: "invalidation"; readonly path: string }`)
  matches the plan §W2 exactly. The `type` discriminant cannot collide with
  `Watcher.Update`'s `"create"|"update"|"delete"` literals (checked at
  `watcher.ts:33`, `Update = ParcelWatcher.Event`), so downstream
  `change.type === "invalidation"` narrowing is sound (agent.ts:73,
  command.ts:59, source.ts:90).
- Feed widening: `Interface.changes(): Stream<Change>` (config.ts:50),
  production PubSub widened (config.ts:245), test layer widened
  (config.ts:79-84). `TestInterface.emitChange(change: Change)` widened
  (config.ts:69) — the smallest way to let tests inject invalidations without
  a second method. Correct.
- `onReady` construction at config.ts:257-261: publishes
  `{ type: "invalidation", path: target.path }` then `requestReload`, per plan
  key, inside the plan loop (correct per-iteration capture). Ordering
  (invalidation before reload request) mirrors the update path
  (config.ts:263-265, publish-then-requestReload). Correct.
- **Initial-attach invalidations are dropped, and that is correct by design.**
  Config's layer construction (incl. `reconcile(initial)` at config.ts:322)
  completes before any plugin consumer layer is built; `PubSub` is not replay
  storage, so the invalidation items published at first attach reach nobody.
  Consumers build initial state from their own authoritative loads
  (agent.ts:90, command.ts:76, skill.ts:182), so nothing is lost. The
  initial `requestReload` (the pre-existing "readiness rescans recover writes
  made before a watch attached" behavior, config.ts:248) is retained and the
  pinned write-during-startup tests stay green (verified, §6).
- **No reload loop in Config**: an invalidation-triggered reload re-runs
  `reconcile`, which is idempotent per key (`FiberMap.run` with
  `onlyIfMissing: true`, config.ts:266); an unchanged plan creates no new
  subscription, hence no new onReady. A *changed* plan (new root) gets one
  new onReady whose invalidation is genuinely wanted (previously-uncovered
  files). Bounded and correct.
- **Blast radius verified zero outside core**: the only `config.changes()`
  consumers in the repo are agent/command/source plugins (grep over
  `packages/`, 2026-09-05; `plugin/supervisor.ts:205,209` consumes
  `PluginSource.Service.changes` which is `Stream<void>` — unaffected).
  No SDK/server/CLI surface exposes `Config.Interface.changes` (only a
  prose mention in `packages/plugin/src/effect/PLAN.md:359`), so **no client
  regeneration is required** (AGENTS.md rule targets Protocol/Server HttpApi).

## 2. Exact-filter bypass for indirect consumers

**Verdict: correct as implemented** in all three consumers:

- agent.ts:70-77 — `Stream.filterEffect` branches on
  `change.type === "invalidation" ? Effect.succeed(true) : <existing predicate>`.
- command.ts:56-63 — identical shape.
- source.ts:87-94 — identical shape in the merged `changes()` leg.

The bypass is the minimal correct semantics: invalidation carries the watched
root, which by construction fails the exact source predicates
(`isAgentSource`/`isCommandSource`/`isPluginSource` match `<root>/{agent,agents,...}`
subpaths), so without the branch the convergence signal would be discarded by
every indirect consumer. Consumer-side coalescing is pre-existing
(`PubSub.sliding<void>(1)` + `Stream.debounce("100 millis")`, agent.ts:67/79-84)
and is now pinned by the new tests (§6).

## 3. Direct configured-plugin readiness

**Verdict: correct and loop-safe as implemented** (source.ts:60-65): the direct
watch passes `PubSub.publish(configuredChanges, undefined)` as `onReady`.

Loop-safety argument (verified against `plugin/supervisor.ts:193-231`):
`configuredChanges` → supervisor `notify` → sliding trigger queue → debounced
`activate()` → `operations()` → `watchConfiguredSources`, whose `watched` Set
(source.ts:57-59) prevents any re-subscribe of an already-watched target
("Watches start on first sighting and are never torn down individually",
source.ts:47-49). So readiness can never re-trigger itself. The initial-attach
publication causes at most one extra debounced, deduped activation — harmless.
Contrast with Skill, which is NOT safe under the same recipe (§4).

## 4. Skill reread — **S1: plan recipe creates an infinite refresh loop; do not implement as written**

**This is the critical design correction of W2.** The plan says "Skill passes
its existing refresh-queue publication as `onReady`" (v2-readd3, W2 Work).
Following it verbatim loops forever:

1. `refresh()` (`skill.ts:154-172`) **unconditionally clears all watches**
   (`FiberMap.clear(watches)`, skill.ts:156) and rebuilds them from
   `load()` → `watchDirectory()` → `watch()` → `watcher.subscribe(...)`.
2. W1 runs `onReady` once at every logical attach (`watcher.ts:150`),
   synchronously inside `subscribe` before it returns.
3. Naive `onReady = PubSub.publish(changes, target)` therefore publishes on
   **every refresh's re-attach**; the eagerly-subscribed debounced consumer
   (skill.ts:176-181) runs `refresh()` again 100 ms later → re-attach →
   publish → … a permanent one-rescan-per-100 ms livelock (each cycle: full
   `FiberMap` teardown, N `fs.scan`s, N re-subscribes, an INFO
   "skills rescanned" log).
4. Existing skill tests would NOT catch it: they use condition-based waits
   (`emitAndWait`, `waitUntil`) that a background loop does not perturb.

Skill cannot ride Config's invalidation feed instead: skill watch targets are
frequently outside config roots (user-configured absolute skill dirs, canonical
dirs behind symlinks, nested files outside roots, skill.ts:130), Config's bus
`config.updated` only fires when config *content* changed, and only Skill's own
physical watches know they were reacquired. Skill must converge on its own
invalidations.

### Required design (smallest correct)

Suppress the initial-attach publication; publish only post-attach readiness.
W1's contract makes the two distinguishable: the initial `onReady` runs before
`subscribe`'s Effect resolves; invalidation-triggered ones run during stream
consumption, which cannot start before the caller holds the stream.

```ts
// skill.ts watch() — replace the bare subscribe (current skill.ts:36-45)
const watch = Effect.fn("ConfigSkillPlugin.watch")(function* (directory: string, type: "file" | "directory") {
  const target = path.resolve(directory)
  // Initial readiness needs no notification: the scan that opened this watch
  // is reading authoritative state. Only later readiness (the watch was
  // reacquired and may have missed events) triggers a rescan.
  let attached = false
  const updates = yield* watcher
    .subscribe(
      { path: target, type },
      Effect.suspend(() => (attached ? PubSub.publish(changes, target).pipe(Effect.asVoid) : Effect.void)),
    )
    .pipe(Effect.tap(Effect.sync(() => (attached = true))))
  yield* FiberMap.run(
    watches,
    `${type}:${target}`,
    updates.pipe(Stream.runForEach((update) => PubSub.publish(changes, update.path).pipe(Effect.asVoid))),
    { onlyIfMissing: true, startImmediately: true },
  )
})
```

- Race-freedom: `attached = true` completes in the same Effect chain before
  `FiberMap.run` can fork consumption of the returned stream, and buffered
  invalidation signals are only processed by `Stream.mapEffect` during
  consumption (W1 watcher.ts:152-158). An invalidation racing the initial
  attach is coalesced into the already-running scan — the owner reread that
  opened the watch covers it.
- The publication reuses the existing debounce pipeline
  (skill.ts:176-181) → `refresh(file)` → `ctx.skill.reload()`, so convergence
  lands through the same authoritative rescan as path events.
- Uniform for `file`/`directory` watch types (only `directory` can be a
  Watchman watch under the W4 matrix, but uniformity costs nothing and matches
  the interface, not the backend).
- Composes with W7: the backend sentinel retarget invalidates the *directory*
  watch's subscribers, whose post-attach onReady then fires → rescan follows
  the new canonical target. Skill's own `file` watch on the symlink spelling
  stays a separate Node physical watch, as upstream intends.
- Rejected alternatives: (a) naive onReady — livelock, above; (b) refresh from
  Config's feed/bus only — misses non-root watches and no-op reloads; (c)
  preserving watches across refresh (no clear+rebuild) — replaces upstream
  topology logic, explicitly out of scope; (d) a second Watcher callback
  distinguishing attach from invalidation — widens the upstream-candidate
  interface for one caller.

**Mandatory accompanying test** (anti-loop pin, else the hazard is invisible):
in `test/config/skill.test.ts`, following the existing harness
(`start`/`emitAndWait`, `Watcher.Test`): load one skill; write a second
`SKILL.md` **without** any `watcher.emit`; `yield* watcher.invalidate()`;
assert the second skill appears (readiness converged with no path event);
then settle/drain and assert the reload count (wrap `ctx.skill.reload` with a
counter, agent-test style) **stays constant** — the naive implementation
fails exactly this assertion. `watcher.invalidate()` (watcher.ts:218-221) is
the intended driver.

## 5. Public/internal type boundaries

- `Config.Change` is a new public core type (config.ts:35-39 with doc); the
  invalidation control item stays **out of** `Watcher.Update` — verified: the
  union exists only in config.ts; watcher.ts still exports `Update` exact
  (watcher.ts:33) and `NativeSignal` stays private (watcher.ts:60-62). This
  implements the B2 boundary without promoting the control item. ✓
- `Watcher.TestInterface.invalidate()` (watcher.ts:81-83) + testLayer
  registration (watcher.ts:175, 198-202, 218-221) — a generic test-infra
  addition landing in the W2 commit. **Plan file-list deviation** (plan W2
  lists no watcher.ts edit): justified — it is the only way to drive readiness
  through the real `Watcher` service in the supervisor/skill tests without
  duplicating a fake Native per suite; contains no Watchman terminology; and
  the W10 audit can class it as U2 test infrastructure. Mitigate the U1/U2
  isolation concern with one commit-body line noting the testLayer addition.
  Alternative (rejected): per-test fake Natives capturing `input.invalidate`
  (reload.test.ts `liveConfig` style) — heavier, and impossible where suites
  already compose `Watcher.testLayer` (supervisor-reload, skill).
- `config/discovery.ts` and `config/watch.ts` are untouched in the diff. ✓
  (plan W2 acceptance: byte-identical to upstream).
- `instruction.ts:52` and `location-watcher.ts:69` use `file` watches only →
  Node backend never invalidates → correctly need no W2 edit (verified the
  complete `Watcher.Service` consumer list: config, source, skill,
  instruction, location-watcher, plugin/internal wiring only).

## 6. Focused deterministic tests — matrix and verdict

Run from `packages/core` (AGENTS.md guard), 2026-09-05:

| Check | Result |
| --- | --- |
| `bun typecheck` (tsgo -b) | **clean** (production + tests) |
| `test/config/agent.test.ts` + `test/config/command.test.ts` | **28 pass / 0 fail**, incl. both new "rebuilds on reacquisition readiness even when no path matches a source" tests (bypass + consumer-side coalescing, Deferred-free `advance()` idiom, no sleeps) |
| watcher / skill / reload / watch-plan / location-layer suites | **64 pass / 0 fail** — post-W1 baseline preserved; the union widening breaks nothing |
| `test/plugin/supervisor-reload.test.ts` new "reloads a configured plugin directory on reacquisition readiness" | **FAIL — hangs, 15 s timeout** (§7 B1) |

New-test assessment:

- agent.test.ts:562-599 and command.test.ts:326-367 — exactly the plan's
  "invalidation at a path that fails the exact predicate still reloads once"
  plus "repeated readiness coalesces" points. Good deterministic design
  (Config.testLayer emitChange + `advance`).
- supervisor-reload.test.ts:168-207 — the right scenario (direct configured
  directory, real `Watcher.Test`, mtime-bumped plugin v2, no path event) but
  broken in two ways (§7 B1/B2).
- **Missing**: Skill reread + anti-loop test (§4); Config-side readiness
  coalescing test (plan W2 Tests bullet 2). Suggested shape for the latter,
  `test/config/reload.test.ts`, following its `liveConfig(directory, native)`
  idiom: inject a Native that captures `input.invalidate` for the `.opencode`
  directory watch; subscribe `config.changes()` (count `invalidation` items)
  and `bus.subscribe(Event.Updated)` (count reload effects); write a config
  change; fire the captured invalidate **3×**; assert exactly **one**
  additional `Event.Updated` (sliding(1)+debounce coalescing) while ≥3
  invalidation items were delivered. This also end-to-end proves
  onReady→invalidation publication through the real Watcher service rather
  than the test layer.

## 7. Bugs / corrections required in the current working copy

Priority order; file:line pinned to the working copy at review freeze.

- **S1 (blocker, missing work)** — `skill.ts` untouched: implement the §4
  design (attach-gated onReady publication) + the anti-loop skill test. The
  naive plan recipe must not land. Plan correction to record: W2's "Skill
  passes its existing refresh-queue publication as `onReady`" is wrong as
  written for a watch topology that clears-and-rebuilds every refresh.
- **B1 (blocker, broken test)** — `test/plugin/supervisor-reload.test.ts:194-200`:
  the retry chain `Effect.retry({ times: 200, schedule: Schedule.spaced("10 millis") })`
  runs under `it.effect` (TestClock, `test/lib/effect.ts` testEnv) and nothing
  advances the clock, so both the supervisor's 100 ms trigger debounce and the
  retry schedule sleeps never fire. Empirically verified: the test times out
  at 15 s. Fix with the file's own idiom (neighbor test at :127-163): fork
  `plugins.awaitActivation`, `yield* advance(() => ready.pollUnsafe() !== undefined)`,
  `Fiber.join(ready)`.
- **B2 (blocker, inverted assertion)** — `test/plugin/supervisor-reload.test.ts:201`:
  `expect(yield* commands.get("greet-v1")).toBeDefined()` after v2 activation
  contradicts the replace semantics pinned by the neighbor test (:163 asserts
  `toBeUndefined()` after a v1→v2 swap through the same `activate()` path).
  Should be `expect(...greet-v2...).toBeDefined()` (already implied by the
  retry) **and** `expect(...greet-v1...).toBeUndefined()`. Never executed so
  far because B1 hangs first.
- **C1 (recommended)** — add the Config-side readiness-coalescing test (§6).
- **C2 (nit)** — `watcher.ts:218-221` `invalidate()` runs readiness of *every*
  active watch (all targets), which is fine for current tests; if a future
  test needs per-target readiness, extend then, not now.
- **C3 (process)** — the W2 commit should note the `Watcher.Test.invalidate`
  testLayer addition in its body (U1/U2 audit clarity, §5).

## 8. File-necessity validation (is every changed file actually needed?)

| File in diff / plan | Needed? | Note |
| --- | --- | --- |
| `src/config.ts` | **yes** | union, feed widening, onReady publication, test-layer widening |
| `src/config/plugin/agent.ts` | **yes** | predicate bypass |
| `src/config/plugin/command.ts` | **yes** | predicate bypass |
| `src/config/plugin/source.ts` | **yes** | predicate bypass + direct-watch onReady |
| `src/config/plugin/skill.ts` | **yes — missing** | §4 design |
| `src/filesystem/watcher.ts` | **yes (deviation, justified)** | `Watcher.Test.invalidate` test infra only; no production-path change |
| `test/config/agent.test.ts`, `test/config/command.test.ts` | **yes** | landed, green |
| `test/plugin/supervisor-reload.test.ts` | **yes** | landed, broken (B1/B2) |
| `test/config/skill.test.ts` | **yes — missing** | §4 test |
| `test/config/reload.test.ts` | recommended (C1) | Config-side coalescing pin |
| `config/discovery.ts`, `config/watch.ts` | **no — and correctly untouched** | plan acceptance |
| `instruction.ts`, `location-watcher.ts` | **no** | file watches; Node never invalidates |

No file in the current diff is unnecessary; the diff is missing exactly the
Skill pair.

## 9. Design verdict

**Conditional GO.** The landed 80% of W2 — Config union, onReady publication,
three-consumer bypass, direct-plugin readiness, agent/command tests, testLayer
invalidate driver — is the smallest correct shape, matches the plan and the B2
boundary, typechecks clean, and preserves the full post-W1 baseline. W2 must
not be committed until: S1 (Skill design + test), B1/B2 (supervisor test)
land; C1 is strongly recommended in the same commit. Commit message per plan:
`fix(core): invalidate config sources after watch reacquisition`.

## Cross-references

- [`v2-readd3.gpt56solxh.md`](/.design/watchman/v2-readd/v2-readd3.gpt56solxh.md) —
  W2 work spec (§"W2 — make owners converge after reacquisition"); its Skill
  sentence is corrected by S1 here.
- [`research0.glm53max.md`](v2-research0.glm53max.md) — round-0 architecture and
  R1-R7; R6 (readiness re-run safety) anticipated the idempotency question S1
  resolves concretely.
- [`execution0.glm53f.md`](v2-execution0.glm53f.md) — implementer journal; W1
  fix history; baseline numbers this round reproduced (64/0).
- Rebuild workspace files cited: `packages/core/src/config.ts`,
  `src/config/plugin/{agent,command,source,skill}.ts`,
  `src/filesystem/watcher.ts`, `src/plugin/supervisor.ts`,
  `test/config/{agent,command,skill,reload}.test.ts`,
  `test/plugin/supervisor-reload.test.ts`, `test/lib/{effect,clock}.ts`.
