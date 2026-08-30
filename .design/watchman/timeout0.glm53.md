---
type: Design
title: Watchman timeout and failure-isolation resilience
description: Inventory of every deadline in the watchman path, the observed failure mechanics, and non-authoritative paths to make the backend resilient under slow or policy-rejecting daemons.
resource: /.design/watchman/timeout0.glm53.md
tags: [opencode, watchman, timeouts, resilience]
status: draft
generated: { by: model:glm-5.3, at: 2026-08-30T17:05:00Z }
sources:
  - id: local-log
    resource: file:///home/rektide/.local/share/opencode/log/opencode-local.log
    title: OpenCode structured log (Aug 19-30 incidents)
    author: system:opencode
  - id: daemon-log
    resource: file:///home/rektide/.local/var/lib/watchman-main/log
    title: watchman-main daemon log
    author: system:watchman
  - id: systemd-design
    resource: file:///home/rektide/src/opencode-systemd/.design/systemd/systemd.gpt56t.md
    title: Systemd-managed OpenCode service (forensic baseline)
    author: model:gpt-5.6-terra
---

# Watchman timeout and failure-isolation resilience (`timeout0`)

This is a wave document, not a ruling. It inventories every deadline in the
watchman path, re-verifies what actually happened on this host, and lays out
paths we *could* take. Nothing here is decided; each path lists what it costs
and what it leaves open. The goal statement from the incident: **make us more
resilient** — one slow root, one policy-rejected path, or one daemon hiccup
should degrade file watching, never the model catalog, the shared connection,
or the whole server.

## What was re-verified (not inherited)

I re-derived the following from source in this workspace and from the raw logs,
rather than trusting the earlier analysis's conclusions:

| Fact | Where |
| --- | --- |
| Every watchman command and the capability check share one flat `COMMAND_TIMEOUT = "10 seconds"` | [`packages/core/src/filesystem/watchman/client.ts:5`](/packages/core/src/filesystem/watchman/client.ts) |
| A command timeout calls `retire(generation, ...)`, which `client.end()`s the shared connection | [`client.ts:90-96`](/packages/core/src/filesystem/watchman/client.ts), [`client.ts:60-73`](/packages/core/src/filesystem/watchman/client.ts) |
| `end()` cancels every queued command with the error text `The client was ended` | fork `index.js` `cancelCommands`/`end` |
| The fork serializes commands: one `currentCommand` at a time per connection; queued commands wait | fork `index.js` `sendNextCommand` |
| Any `establish` error — including a per-path daemon rejection — also retires the generation | [`native.ts:129`](/packages/core/src/filesystem/watchman/native.ts) |
| First-acquisition failure falls back to parcel immediately, with no watchman retry; the unbounded retry loop only covers reconnects after a successful establish | [`native.ts:37-53`](/packages/core/src/filesystem/watchman/native.ts), [`native.ts:151-160`](/packages/core/src/filesystem/watchman/native.ts) |
| The parcel/node fallback subscribe has its own 10s timeout (`SUBSCRIBE_TIMEOUT_MS`), which produced the skill-plugin `failed to subscribe ... TimeoutError` | [`packages/core/src/filesystem/watcher.ts:14`](/packages/core/src/filesystem/watcher.ts), [`watcher.ts:276-291`](/packages/core/src/filesystem/watcher.ts) |
| `/api/model` waits only 5s on plugin readiness | upstream `packages/server/src/handlers/plugin-readiness.ts` |
| Retirement log lines mostly bypass the shared log file (3 lines in file vs 9+ journaled retirements with causes in one 30-min window) | log comparison, Aug 30 |
| 9 retirements in 30 minutes: 5× `watch-project`, 2× `subscribe`, 1× `watch`, 1× capability check — all timeouts | journal, Aug 30 01:30-02:00 |
| One ready server (no registration displacement) returned 496 `/api/model` 503s with 40 acquisition failures and 4 generations in ~8 minutes | run `84d0de5c`, Aug 30 |
| The daemon spent 9.55s watching `~/.config/opencode` (9.46s full crawl) immediately before the first model-503 burst and a `watch-project` timeout retirement | daemon log + journal, Aug 30 01:33 |
| A `RootResolveError` for `~/.config/opencode` (`enforce_root_files` policy) retired generation 1 at boot; sibling in-flight resolves then failed with `The client was ended` | run `26e38707`, Aug 19 23:55:12 |
| 669 `skills rescanned` events were triggered by daemon cookie files (`.watchman-cookie-<host>-<daemonpid>-<seq>`) landing inside watched trees, still reproducing on Aug 30 16:24 | opencode log |
| Daemon-side clock syncs run with `sync_timeout: 20000` — a 20s daemon budget against our 10s client budget | daemon log `dispatch_command:clock` |
| Generation churn discards the per-generation route cache, forcing re-`watch-project` for every path after each retirement | [`route.ts:12-16`](/packages/core/src/filesystem/watchman/route.ts) |

## Deadline inventory

| # | Deadline | Value | Scope | On expiry |
| --- | --- | ---: | --- | --- |
| 1 | Server plugin-readiness gate | 5s | `/api/model`, `/api/vcs`, websearch handlers | 503 `ServiceUnavailableError` |
| 2 | Watcher subscribe timeout (parcel/node native) | 10s | fallback/default directory subscribe | `failed to subscribe` + `undefined` subscription |
| 3 | Watchman command timeout | 10s | **all** commands incl. capability check; includes client-side queue wait | retire generation → `end()` → all queued commands fail |
| 4 | Watchman establish tapError | immediate | any route/clock/subscribe error, including deterministic policy rejections | retire generation → same cascade |
| 5 | Reconnect backoff | 100ms→3.2s cap, unbounded attempts | post-success reconnects only | retry forever (good) |
| 6 | Watcher RcMap idle TTL | 15 min | deduped watcher entries | re-acquire on next use |
| 7 | Daemon clock `sync_timeout` | 20s (observed) | daemon-side sync writing cookie files | daemon error response |
| 8 | Disconnected-notify loop | `notifySeconds`, default 0 (off) | "still disconnected" warnings | log only; currently disabled unless env set |

The acute problem is the interaction of #3 and #4 with the fork's strict
per-connection command serialization, sitting under #1.

## Failure mechanics (as observed)

1. **Head-of-line blocking turns one slow root into a burst.** Commands queue
   behind `currentCommand`; each command's 10s budget therefore measures
   *queue wait + execution*. A single ~9.5s crawl (first watch of a root)
   pushes every queued `watch-project`/`clock`/`subscribe` over the wall, so
   many commands time out "simultaneously" although the daemon was never wedged.
2. **Timeouts are treated as connection poison.** Retiring the generation on a
   timeout ends the socket for everyone: in-flight and queued commands all fail
   with `The client was ended`, each acquisition logs a fallback warning, and
   pending subscribers drop to parcel — a blast radius of "everything" for a
   failure that was local to one command on one root.
3. **Deterministic policy rejections get the same punishment.** With
   `enforce_root_files`, paths like `~/.config/opencode` are answered with
   `RootResolveError`/`CommandValidationError` on *every* boot. That is a
   per-path answer, but `establish`'s `tapError` retires the shared generation,
   so a guaranteed-to-fail watch poisons all sibling acquisitions at startup.
4. **First failure is forever (per subscription).** `makeNativeWith` catches
   the initial acquisition error and permanently uses parcel for that watcher.
   Given (2) and (3), a single timeout or a policy rejection at boot can push a
   whole cohort of watchers onto parcel even though watchman would have served
   them 10 seconds later.
5. **Churn discards route knowledge.** The route cache lives on the
   `Generation`; every retirement forces re-resolution of every path on the
   next generation, adding another command wave to a connection that just
   failed from command pressure — a mild feedback loop.
6. **Cookie files feed the event stream.** Daemon clock syncs write
   `.watchman-cookie-*` files into watched roots. Subscribers that don't
   filter them (skill directories watch with `ignores=0`) treat the cookie as
   a content change: 669 `skills rescanned` events observed. Every rescan
   re-reads skill sources and can re-trigger plugin refresh work — load that
   then competes with the very commands causing syncs. (The daemon normally
   hides its own cookies from results; why they leak into `since`-based
   subscription flows here needs a dedicated verification — see open
   questions.)
7. **The 5s catalog gate makes watcher latency user-visible.** Plugin
   activation subscribes config/skill watchers; a cold boot with several new
   roots (crawls) blows the 5s gate and the TUI shows an empty model catalog
   (496 503s on an otherwise healthy server). Even a perfect watchman client
   cannot fix that gate; conversely, watchman's slow-path behavior makes the
   gate far more likely to trip.
8. **Silent retirements and invisible logs.** The `'end'` transport event
   retires with no cause, and `Effect.runFork(Effect.logWarning(...))` in
   `retire` mostly bypasses the shared log file (3 file lines vs 9+ journal
   entries). From the file alone, generations appear to vanish.

## Paths to consider

None of these are recommendations. They are directions with tradeoffs; several
compose.

### A. Shrink the blast radius of a timeout

Fail only the timed-out command; keep the generation. Retire on transport
events (`error`/`end`) and on *repeated* timeouts (e.g. N consecutive), not on
the first one.

- *For:* removes the cascade mechanics (2) entirely; one slow root then costs
  one fallback, not forty.
- *Against:* a genuinely wedged daemon now needs N×10s before the connection is
  recycled; the "daemon alive but stuck" case (the thing the timeout was
  presumably guarding) needs the consecutive-count to be small or needs a
  liveness probe of its own.
- *Open:* what N; whether `clock`-style liveness should retire faster than
  bulk commands.

### B. Separate timeouts by command class

`watch-project`/`watch` are crawl-bound (first watch of a root can take tens of
seconds on big trees; we measured 9.5s on a *small* one under load, and 20s+
crawls appear in the daemon log). `subscribe`/`unsubscribe` after the root
exists are fast. `clock` is sync-bound and daemon-budgeted at 20s.

Budgets could become per-stage: route establish long (aligned with the daemon's
own `sync_timeout`, or issued with an explicit `no-sync`/`sync_timeout: 0`),
subscribe short, and the capability check short.

- *For:* stops punishing legitimate crawls; aligns client and daemon budgets so
  we stop abandoning work the daemon completes 400ms later (observed: client
  retires at 10s, daemon finishes at 10.46s).
- *Against:* long establish timeouts keep acquisition latency high; the server
  5s gate (see G) still fires long before a 30s establish budget.
- *Open:* whether to pass `sync_timeout` explicitly on our `clock` calls so the
  daemon budget is ours to choose rather than implied.

### C. Don't retire for policy rejections

`RootResolveError`/`CommandValidationError` are per-path answers. They should
fail that route (and probably cache the rejection per path for some TTL so we
stop re-asking every boot), never touch the generation.

- *For:* removes the boot-time poison (3) outright; cheap and local.
- *Against:* none apparent; the risk is misclassifying a transient error as
  policy. Needs the error taxonomy from the daemon (`watchman::RootResolveError`,
  `watchman::CommandValidationError` prefixes are distinguishable).
- *Open:* TTL for negative route cache; where it lives (generation survives, so
  maybe manager-level).

### D. Retry watchman before falling back to parcel

Make first acquisition retry with the existing backoff (currently reserved for
reconnects) for a bounded window (say 30-60s), and treat parcel as a
*degradation* — possibly with periodic re-promotion attempts while the
subscription lives.

- *For:* survives transient boot-time pressure (the exact Aug 30 shape);
  keeps watchman's dedup benefits for the common case.
- *Against:* delayed first events for legitimately-broken setups; re-promotion
  adds a second subscription lifecycle to reason about; parcel fallback is
  currently *correct* and simple.
- *Open:* whether re-promotion is worth it vs. fallback-at-acquisition-only
  (new subscriptions get watchman again; existing parcel ones stay).

### E. Bound acquisition concurrency

A location boot subscribes many directories at once; four service processes
multiply that (noted in `init0.gpt56t.md`). A small bounded queue for
route-establish work (with subscribe/unsubscribe jumping the queue) would
cap queue-wait amplification regardless of timeout choices.

- *For:* directly attacks mechanic (1); composes with any timeout policy.
- *Against:* serializing establishments makes cold boot slower in the happy
  path; needs priority classes to avoid unsubscribe starvation during churn.
- *Open:* per-connection vs. per-process scope (per-process is where the fork's
  serialization already forces it, just implicitly and unboundedly).

### F. Filter cookie files client-side

Add `.watchman-cookie-*` (and probably `.watchmanconfig`) to the subscription
expression or the publish filter regardless of caller `ignore` lists.

- *For:* one line of expression; kills the 669-rescan feedback (6) for all
  backends, including node/parcel watchers that merely share the tree.
- *Against:* papers over a daemon behavior we don't fully understand — the
  daemon is *supposed* to hide its cookies; if they leak via `since`-clocks,
  other clients on this box (not just us) see them, and filtering only our
  subscriptions leaves the fs noise in place.
- *Open:* verify against the daemon version why cookies surface in
  subscription results at all (suspect: `since`-queries that span cookie
  creation); consider a daemon-config-level fix (`cookie_dir`) in the
  watchwoman work instead.

### G. Coordinate with the server's 5s catalog gate

This is cross-feature (server package, not this workspace): either watcher
acquisition stops blocking plugin flush (lazy subscribe — deliver an initial
"everything changed" and refine), or the gate distinguishes "initializing" from
"failed" for the TUI. From watchman's side, the ask is just honesty: slow
acquisition should be *visible as slow*, not as an empty catalog.

- *For:* removes the user-visible symptom that made this incident feel like
  "no models/providers".
- *Against:* lazy subscribe risks missed early events (needs a conservative
  initial update); the gate change is upstream's call.
- *Open:* tracked in the systemd design's readiness section; nothing to decide
  here beyond agreeing the boundary.

### H. Make retirements observable

Always attach a cause (synthesize one for bare `'end'`), route retirement logs
through the standard logger context, and add counters: generations created,
retirements by cause, timeouts by command, fallbacks, queue depth at
retirement. The OTEL wave (`otel0.glm53.md`) already wants backend metrics;
this is its cheapest entry point.

- *For:* the next incident becomes readable from the log file alone.
- *Against:* none; purely additive.
- *Open:* counter naming/labels to keep cardinality bounded (per the otel0
  guidance).

## Verification sketch

The `Manager`/`RawClient` seam ([`client.ts:7-15`](/packages/core/src/filesystem/watchman/client.ts))
already allows a scripted fake daemon, and `makeNativeWith` accepts any
`Manager`. A fault-injection harness could assert the regressions we care
about, whatever paths are chosen:

- a `watch-project` that takes 15s must not fail sibling commands
  (today: they all die);
- a `RootResolveError` response must not retire the generation
  (today: it does);
- queue depth N behind one slow command must not multiply timeouts
  (today: it does, by construction of the fork);
- a first-acquisition timeout recovers to watchman within the retry window
  (today: parcel forever);
- cookie-named files in subscription results are not published
  (today: 669 rescans);
- retirement cause appears in the shared log file (today: journal only).

A live repro also exists for free: `watchman watch` a fresh multi-GB tree while
the server boots, or simply boot against `~/.config/opencode` under
`enforce_root_files` — both reproduced the cascades on this host.

## Open questions

1. Is per-command failure isolation (A) compatible with the fork's serialized
   connection, or do we need a second connection for control commands
   (subscribe/unsubscribe) so bulk work can't starve them?
2. Should route establish run with `sync_timeout: 0` (no crawl wait) and let
   `since`-subscription semantics absorb initial state, making `clock` rare?
3. What is the daemon's actual contract for hiding cookie files from
   subscription results on this version — bug, config, or expected under
   `since`-clocks?
4. Do we want negative route caching for policy-rejected paths, and at what
   TTL, given `enforce_root_files` makes some paths permanently unwatchable?
5. Should `notifySeconds` default on (say 30s) now that disconnected outages
   are a known incident shape, instead of requiring the env var?
6. Does the 15-minute RcMap idle TTL interact with daemon root reaping such
   that re-acquired watchers re-crawl (re-poisoning latency) after idle
   periods? The daemon log's `aged` lines suggest roots do get dropped.

## Cross-references

- [`README.md`](/README.md) in this directory — feature shape, lineage, known
  flaky tests.
- [`otel0.glm53.md`](/otel0.glm53.md) — observability wave this doc's metrics
  path (H) would land in.
- [`cleanup0.gpt56t.md`](/cleanup0.gpt56t.md) — crash-residue cleanup; retire
  semantics interact with what gets left behind.
- [systemd design](file:///home/rektide/src/opencode-systemd/.design/systemd/systemd.gpt56t.md) —
  the incident forensics that motivated this wave, and the Watchman boundary
  (independently supervised, degraded-not-fatal) this doc operates within.
- [`patches.md`](file:///home/rektide/archive/doc/opencode/patches.md) —
  accepted-stack manifest; this wave is a candidate, not accepted work.
