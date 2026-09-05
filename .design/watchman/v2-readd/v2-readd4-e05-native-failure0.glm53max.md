---
type: Evidence
title: E05 Native failure semantics on current OpenCode v2
description: Revision-pinned factual trace of what RcMap acquisition, subscriber streams, Config, Plugin sources, and Skill observe when Native.subscribe pends, returns undefined, defects, or would return a typed failure; with a consequence matrix and unranked policy fact-sets.
resource: /.design/watchman/v2-readd/v2-readd4-e05-native-failure0.glm53max.md
tags: [opencode, watchman, v2, e05, failure, rcmap, fibermap, pubsub, evidence]
status: stable
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: opencode-v2
    resource: file:///home/rektide/a/a/opencode
    title: OpenCode v2 at 4306c07b340b9a0504e65785f366d2793cd1b169 (v2@origin, "feat(core): update GPT prompts and remove legacy Anthropic prompt (#47447)")
    author: anomalyco/opencode contributors
    last_modified: 2026-09-05
  - id: effect-rc112
    resource: file:///home/rektide/a/Effect-TS/effect
    title: effect 4.0.0-rc.112 (tag effect@4.0.0-rc.112 = 2600f62f45, "Version Packages (rc) (#7381)"), the version pinned by OpenCode's root catalog
    author: Effect-TS contributors
    last_modified: 2026-09-05
  - id: w1-committed
    resource: file:///home/rektide/src/opencode-watchman-v2-readd
    title: Committed W1 only - jj ornkqwlkpvsm / git 620fc620b67f "refactor(core): make watcher readiness generation-aware", parent qtrmrownqlvo = 4306c07b
    author: watchman v2 re-add work
    last_modified: 2026-09-05
  - id: v4-e05-context
    resource: /.design/watchman/v2-readd/v2-readd4.gpt56solxh.md
    title: Watchman v2 re-add architecture and evidence brief (E05 context)
    author: model:openai/gpt-5.6-sol-xhigh
    last_modified: 2026-09-05
---

# E05 - Native failure semantics on current OpenCode v2

## One-sentence answer

On current v2 (4306c07b + Effect rc.112), a pending `Native.subscribe` leaves the
`RcMap` lookup deferred unresolved and every subscriber stream hung with `onReady`
never run (Config never gets its readiness reload, Skill/Plugin fibers wait
silently); a returned `undefined` succeeds the lookup with an already-shutdown
PubSub so every subscriber stream **ends immediately** as `Stream.empty` with
`onReady` skipped and the entry is retried only when an owner re-subscribes; a
defect dies the lookup, kills all concurrent waiters' streams with that same
defect, and (because both Config's and Skill's watch fibers run unprotected in
FiberMaps nobody joins, and failed FiberMap entries are auto-removed) the watch
silently disappears with no log and no retry until an unrelated reload/refresh
trigger re-runs it; and a typed failure is inexpressible today
(`NativeInterface.subscribe` is `Effect<Subscription | undefined>`, the public
`Interface.subscribe` is infallible) but the rc.112 RcMap/Stream machinery fully
supports an internal error channel whose only observable difference from a
defect would be the exit shape and the ability to branch on it internally, since
no consumer of these watch streams handles typed errors either.

## Exact sources and versions

| What | Where | Version |
| --- | --- | --- |
| Carrier | `file:///home/rektide/a/a/opencode`, worktree read at detached `4306c07b` (= `v2` = `origin/v2`) | commit `4306c07b340b9a0504e65785f366d2793cd1b169` |
| Effect | `file:///home/rektide/a/Effect-TS/effect`, tag `effect@4.0.0-rc.112` | commit `2600f62f45` (matches OpenCode root `package.json` catalog pin `4.0.0-rc.112`) |
| Committed W1 | `file:///home/rektide/src/opencode-watchman-v2-readd`, jj change `ornkqwlkpvsm` (commit `620fc620b67f`) | only this commit cited; the uncommitted working copy is out of scope |
| E05 context | [`v2-readd4.gpt56solxh.md`](/v2-readd4.gpt56solxh.md) §"Lifecycle and failure semantics", §"Outstanding questions" E05 row | draft |

Key file:line references (all at the pinned revisions):

- Watcher service, RcMap, `Stream.unwrap` subscribe:
  `packages/core/src/filesystem/watcher.ts:84-151` (layer), `:94-127` (RcMap
  lookup), `:129-147` (subscribe), `:15` (`SUBSCRIBE_TIMEOUT_MS = 10_000`),
  `:54-58` (`NativeInterface`), `:63-66` (public `Interface`), `:204-227`
  (`nativeLayer`), `:237-273` (`subscribeDirectory` with `Effect.timeout` +
  `catchCause` → `undefined`).
- Config reconcile/reload: `packages/core/src/config.ts:238-318` (reloads PubSub,
  `FiberMap.run(watched, key, { onlyIfMissing: true, startImmediately: true })`
  at `:255`, reload triggers at `:273-317`, authoritative initial load at
  `:236-237`).
- Config plan: `packages/core/src/config/watch.ts:8-39`.
- Agent/Command consumers: `packages/core/src/config/plugin/agent.ts:69-84`,
  `command.ts:55-70` (both consume `config.changes()`, i.e. Config's PubSub, not
  the watcher directly).
- Plugin source: `packages/core/src/config/plugin/source.ts:50-72`
  (`watchConfiguredSources`: `watched` Set never cleared, `Stream.runForEach`
  wrapped in `catchCause` → log, `Effect.forkScoped`).
- Skill: `packages/core/src/config/plugin/skill.ts:36-45` (`watch` in FiberMap,
  no onReady, no catchCause), `:154-172` (`refresh` starts with
  `FiberMap.clear(watches)`), `:176-196` (refresh triggers: debounced own
  changes; `config.updated` bus event only when Config's `reload` actually
  changed entries, `config.ts:265-267`).
- Focused tests: `packages/core/test/filesystem/watcher.test.ts` at 4306c07b -
  "does not signal readiness for an unavailable native watch" (`:97`),
  "interrupting a consumer interrupts a pending acquisition" (`:152`),
  "shares equivalent entry sets and releases exactly once after the final
  consumer" (`:183`), "scope shutdown releases an active subscription exactly
  once" (`:205` region); W1 adds "reruns readiness for every shared subscriber
  before delivering later updates".
- Effect rc.112: `RcMap.ts:335-383` (`get` forks lookup into `entry.scope` and
  awaits one shared `Deferred`; `:452-491` release removes entry when refCount
  hits 0 because `make` defaults `idleTimeToLive` to `Duration.zero`,
  `RcMap.ts:259`); `FiberMap.ts:354-399` (`setUnsafe` observer auto-removes
  completed fibers and writes failures only into an unobserved `deferred`),
  `:789-801` (`runImpl` uses detached `Effect.runForkWith`, not forkChild);
  `PubSub.ts:963-972` (`publishUnsafe` returns `false` after shutdown);
  `Stream.ts:1633` (`unwrap` propagates the inner effect's error channel into
  the stream); `Effect.ts:3238` + `internal/effect.ts:2468-2503` (`catchCause`
  receives failures, defects and interruptions); `internal/effect.ts:3971-3989`
  (`acquireRelease` with `{ interruptible: true }`: acquire interruptible,
  release registered only after acquire success).

## Lifecycle trace per case

### (a) `Native.subscribe` remains pending

1. `watcher.subscribe(...)` (the `Effect`) still completes immediately - it only
   returns `Stream.unwrap(...)`. Nothing at any layer construction blocks; this
   is why "startup/layer failure" is unreachable for demand-time acquisition
   today (Config's `reconcile(initial)` at `config.ts:318` also only forks).
2. When the returned stream is run (in Config's FiberMap fiber, Skill's FiberMap
   fiber, PluginSource's forked fiber, or LocationWatcher's fork), `RcMap.get`
   increments the key's refCount and awaits the entry `Deferred`, which stays
   pending because the lookup fiber is parked inside `native.subscribe`.
3. `PubSub.subscribe`, the `isShutdown` check, `onReady`, and
   `Stream.fromSubscription` are never reached: the subscriber stream emits
   nothing and never ends; Config's `requestReload` onReady (the startup
   race-window rescan, `config.ts:240-241`) never runs, though the initial
   authoritative `load(initial)` at `config.ts:237` already ran, so entries are
   served.
4. The pending lookup is interruptible: `{ interruptible: true }` on the inner
   `acquireRelease` means consumer interruption or scope shutdown closes the
   stream scope, drops refCount to 0, removes the entry (default TTL zero), and
   interrupts the in-flight acquire (its release finalizer is *not* registered,
   so late cleanup must live inside the native itself - proven by the
   "interrupting a consumer interrupts a pending acquisition" test).
5. On current production natives this case is bounded: directory watches go
   through `Effect.timeout(10s)` and file/entries are synchronous; unbounded
   pending is only introduced by a future Watchman native that awaits daemon
   contact inside `subscribe`.
6. While pending, the FiberMap key stays occupied, so Config's
   `onlyIfMissing: true` prevents any re-fork on later reconciles for that key;
   Skill escapes only because `refresh()` clears the whole map first.

### (b) `Native.subscribe` returns `undefined`

1. The lookup *succeeds*: `PubSub.shutdown(pubsub)` then `return pubsub`
   (`watcher.ts:114-118`); the entry's Deferred is completed with the shutdown
   PubSub. No error, no retry inside RcMap.
2. Each subscriber: `PubSub.subscribe` succeeds even on a shutdown PubSub (it
   only registers finalizers, `PubSub.ts:1082-1095`), then `isShutdown` returns
   true and the code returns `Stream.empty` - `onReady` is skipped. Existing
   passing test: "does not signal readiness for an unavailable native watch".
3. `Stream.empty` drains immediately: the consuming fiber **completes
   normally**. FiberMap auto-removes the key; nothing fails, nothing logs
   (beyond native-side logging such as parcel's "watcher backend not
   supported" / "failed to subscribe" `Effect.logError`s in
   `subscribeDirectory`).
4. Stream scopes close → refCount → 0 → entry removed (TTL zero) → next
   `watcher.subscribe` for the same key calls `native.subscribe` again. Retries
   are therefore owner-driven only: Config retries on its next reconcile
   (reload triggers), Skill on its next refresh, PluginSource's configured
   targets **never** (`watched` Set is append-only), LocationWatcher on its next
   reconcile.
5. Consumers keep their own long-lived feeds: `config.changes()` is
   `Stream.fromPubSub(updates)` on Config's internal PubSub, so Agent/Command
   and Skill's `config.updated` listeners stay alive - they simply receive no
   file events. Config state goes stale-but-consistent; no synthetic events,
   no end-of-stream anywhere downstream.

### (c) `Native.subscribe` defects / dies

1. The lookup fiber dies; `Deferred.doneUnsafe` completes the shared Deferred
   with the die, so **every concurrent waiter dies with the identical cause**
   (one defect, N dead subscribers).
2. Each subscriber's `Stream.unwrap` inner effect dies → the stream itself
   defects → `Stream.runForEach` dies → the owning fiber dies.
3. Fate of the dead fiber per consumer:
   - Config (`config.ts:248-257`): FiberMap records the failure in its
     unobserved deferred (`FiberMap.ts:388-397`) and auto-removes the key;
     **no log, no join, no retry** until an unrelated reload trigger
     (credential `Switched` if wellknown-relevant, `WellKnown.Event.Updated`,
     or the 10-minute loop **only when `wellknown.snapshot()` is non-empty**
     - `config.ts:299-317` - so with zero wellknown entries a dead Config watch
     is never reconciled again in-process).
   - Skill (`skill.ts:36-45`): same silent FiberMap death; next escape hatch is
     any later `refresh()` (debounced event from a *different* still-alive
     watch, or a `config.updated` that actually changed entries), which clears
     and rebuilds all watches.
   - PluginSource (`source.ts:64-70`): `Effect.catchCause` logs
     "configured plugin watch failed" and the fiber *completes* - the one
     consumer that converts defects into logs; never retried (`watched` Set).
   - LocationWatcher (adjacent, `location-watcher.ts:67-80`):
     `catchCauseIf(!hasInterruptsOnly)` logs; reconcile can re-subscribe later.
4. RcMap side: the failed entry is removed once refCount reaches 0 (TTL zero)
   and the die is **not cached** - a fresh `RcMap.get` re-runs the lookup.
5. Real production defect source today: the Node file/entries native wraps
   `fs.watch` in `Effect.sync` (`watcher.ts:208-222`) - a synchronous throw
   (EMFILE/EPERM/ENOENT-class) defects straight through, while the Parcel
   directory path converts rejection and timeout to `undefined` via
   `catchCause` (`watcher.ts:256-272`). Interruption is the one cause
   `catchCause` receives but cannot truly convert (the interrupt signal is
   sticky in rc.112; recovery is re-interrupted at the next interruptible
   point).

### (d) Typed failure if the internal signature were widened

1. rc.112 machinery composes: `RcMap<K, A, E>` carries the lookup error channel
   through `get` (`RcMap.ts:335-337`), and `Stream.unwrap` folds the inner
   effect's `E` into the stream's `E` (`Stream.ts:1633`). A widened
   `NativeInterface.subscribe: Effect<Subscription | undefined, E>` would make
   the watcher's RcMap `RcMap<Target, PubSub<NativeSignal>, E>` and the
   subscriber stream `Stream<Update, E>` *unless* converted at the boundary.
2. Because no consumer of these watch fibers handles typed errors either
   (Config/Skill: no catch; PluginSource's `catchCause` already catches typed
   failures too), the observable behavior of a typed failure flowing through
   unchanged consumers is identical to a defect: fiber fails, FiberMap
   auto-removes, deferred records a typed (not Die) exit, silence. The
   difference is representational: branchable at the Watcher boundary, logged
   distinctly, and not a "bug class" signal.
3. What blocks it today: `NativeInterface.subscribe` is declared infallible
   (`watcher.ts:54-58`), the public `Interface.subscribe` is infallible
   (`watcher.ts:63-66`), and committed W1 (`620fc620b67f`) keeps both
   infallible while adding only the optional `invalidate` callback and the
   `NativeSignal` PubSub (invalidation replays `onReady` before later updates
   - W1 test "reruns readiness for every shared subscriber"). v4 fixed decision
   5 preserves the public `subscribe(input, onReady?)` shape, so a typed error
   cannot cross the Watcher service boundary without either conversion
   (E → `undefined`, i.e. the existing "unsupported" end-stream semantic; E →
   log + `Stream.empty`; E → die) or a public-surface change.
4. Demand-time layer failure remains unwireable regardless: lookup runs lazily
   inside forked stream fibers, never during any layer's construction.

## Consumer consequence matrix

Legend: "entry" = RcMap key entry lifecycle; "fiber" = the owner's per-watch
stream fiber. All statements are Known unless marked.

| Dimension | (a) pending | (b) `undefined` | (c) defect | (d) typed failure (widened, unconverted) |
| --- | --- | --- | --- | --- |
| RcMap entry | stays, Deferred pending, refCount ≥ 1 | succeeds with shutdown PubSub; removed at refCount 0 | dies into shared Deferred; removed at refCount 0; not cached | fails into shared Deferred; removed at refCount 0; not cached |
| Subscriber stream | hangs, no end, no `onReady` | `Stream.empty`: ends immediately, `onReady` skipped | defects with the lookup cause | fails with the typed error |
| Concurrent same-key waiters | all hang together | all get `Stream.empty` | all die with the same cause | all fail with the same error |
| Config | entries still served (authoritative initial load); readiness reload never runs; key blocks reconcile's `onlyIfMissing` re-fork | watch fiber completes; no events; retry only on next reload trigger | watch fiber dies silently (no log anywhere); retry only on unrelated reload triggers; none if wellknown snapshot empty | same as defect but typed exit recorded in the unjoined FiberMap deferred |
| Agent/Command (via `config.changes()`) | no impact (feed alive, no events) | no impact (no events) | no impact (their own fibers unaffected) | no impact |
| PluginSource configured targets | fiber waits forever; `watched` Set entry exists | fiber completes; never retried (`watched` append-only) | logged "configured plugin watch failed"; never retried | logged via existing `catchCause`; never retried |
| Skill | watch fiber hangs; cleared on next `refresh()` | watch fiber completes; skills stale until next refresh trigger | watch fiber dies silently; rebuilt on next `refresh()` | same as defect, typed |
| Logs | none at Watcher level (native's own logs only) | native-side only (parcel logs unsupported/failed) | none for Config/Skill; PluginSource/LocationWatcher log | whichever conversion the boundary chooses |
| Interruption | acquire interruptible; late cleanup is native's own `onInterrupt` duty | n/a | release skipped (acquire failed) | release skipped |
| Production reachability today | directory path bounded at 10 s then → (b); file/entries synchronous; unbounded only for a future Watchman native | parcel unsupported/timeout/rejection | Node `fs.watch` sync throw (file/entries watches) | none - inexpressible |

## What current types can express

- `NativeInterface.subscribe`: `Effect<Subscription | undefined>` - pending,
  `undefined` ("unsupported", end streams), or defect. No error channel.
- Public `Interface.subscribe`: `Effect<Stream<Update>>` - infallible effect,
  error-free stream; unchanged by committed W1.
- rc.112 `RcMap`/`Stream`/`FiberMap` all support error channels and
  failure-recording; nothing in the composition forces infallibility - the
  constraints are the two watcher signatures above plus fixed decision 5
  (preserve public surface) in v2-readd4.
- Subscription release: `unsubscribe` promise failures are swallowed
  (`Effect.ignoreCause`, `watcher.ts:104-108`).

## Facts each candidate policy would entail (unranked)

**Retry forever (keep streams pending, retry inside a backend)**

- Requires the retry loop to live inside the future Watchman native: today's
  carrier has no retry primitive at the Watcher/owner layer (failed/undefined
  entries are removed, re-subscription is owner-driven).
- Per-key FiberMap occupation (`onlyIfMissing`) means a hung-or-retrying key
  never re-forks from Config reconcile; Skill recovers only via full refresh.
- Permanent invalid roots yield unbounded retries, bounded logs, and permanent
  silence toward owners; no typed signal ever exists.
- Interruption/scoped-shutdown behavior is already correct and tested for
  pending acquires.

**Startup / layer failure**

- Not wireable for demand-time failures on current code: no layer construction
  awaits `native.subscribe` (Config's `reconcile` only forks). Forcing
  acquisition into Config's (or any owner's) layer build would be a new seam
  and would convert daemon absence into total app-startup failure - a product
  decision outside the fixed decisions list (Config stays byte-identical to
  upstream per v2-readd4's exclusions audit).
- Would give the strongest observability (process exit / layer error) at the
  cost of coupling availability of everything to one backend.

**Minimal internal failure path (widen internal signatures only)**

- rc.112 supports it end-to-end without public changes if converted at the
  Watcher boundary; observable consequences then equal whichever existing
  semantic the conversion picks (`undefined`→end streams, log→die,
  log→`Stream.empty`).
- Unconverted, it changes exit shape (typed vs Die) for exactly the fibers that
  already die silently; no current consumer would notice without new handling.
- Keeps the door open for bounded-retry vs give-up decisions to be made *on
  classified causes* inside the backend, which neither (a) nor (b) can express
  today.

## Unknowns

- Whether rc.112's sticky interrupt re-signal ever lets `catchCause` in
  `subscribeDirectory` return `undefined` for a genuinely interrupted acquire
  (recovery is expected to be re-interrupted; not covered by an existing
  test).
- Exact Bun `fs.watch` failure modes (sync throw vs `error` event) for
  EMFILE/EPERM-class conditions; characterized from code, not experiment.
- Non-core packages were spot-checked only (TUI/server reference neither
  `Watcher.Service` nor joins these FiberMaps; the sole `FiberMap.join` in the
  repo is the unrelated http-recorder), so an out-of-tree consumer behaving
  differently cannot be fully excluded.
- `Stream.fromSubscription` end-on-shutdown is asserted from the
  `fromQueue`/`Channel.fromSubscriptionArray` construction and type
  (`Exclude<E, Cause.Done>`), not executed in a scratch test.

## Confidence and caveats

High confidence: all RcMap/FiberMap/PubSub/Stream/Watcher/Config/Skill/
PluginSource statements above are read directly from the pinned revisions and
cross-checked against the four existing focused watcher tests (undefined,
pending-interrupt, share/release-once, scope-shutdown-once) and W1's added
readiness-replay test. Caveats: the catchCause-on-interrupt subtlety and
`Stream.fromSubscription` end semantics are reasoned from source rather than
re-executed; the 10-minute wellknown loop's no-op-with-empty-snapshot makes
"never reconciled again" conditional on a machine's wellknown state.

## v4 E05 pointers

- [`v2-readd4.gpt56solxh.md`](/v2-readd4.gpt56solxh.md) §"Lifecycle and failure
  semantics" (the E05-motivating paragraph: pending-and-retry vs `undefined`
  ends streams; "Native currently has no typed failure surface").
- Same document §"Outstanding questions and evidence asks", design-gate row
  **E05** (compare retry-forever / fail layer / minimally widen internal
  failure against current RcMap/Config/Skill lifecycle).
- Same document §"Decision record" → "Explicitly provisional" bullet
  "permanent failure behavior under a Scope-free, infallible Native", and
  §"Promotion criteria" items 1 and 6 (explicit E05 decision; human acceptance
  of the availability and permanent-failure policy).
