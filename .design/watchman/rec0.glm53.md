---
type: Recommendation
title: Watchman design corpus — summary and recommendations
description: Distillation of the seven .design/watchman documents into per-doc summaries, the settled/contested map after the timeout review round, and a prioritized implementation plan for the resilience work.
resource: /.design/watchman/rec0.glm53.md
tags: [opencode, watchman, resilience, timeouts, observability]
status: draft
generated: { by: model:glm-5.3, at: 2026-08-30 }
sources:
  - id: readme
    resource: /.design/watchman/README.md
    title: Watchman retained backend — maintenance log
  - id: draft0
    resource: /.design/watchman/draft0.ds4p.md
    title: Watchman-backed filesystem watcher (assessment)
  - id: init0
    resource: /.design/watchman/init0.glm52.md
    title: Watchman watch registry
  - id: cleanup0
    resource: /.design/watchman/cleanup0.gpt56t.md
    title: Watchman-native ownership and cleanup
  - id: otel0
    resource: /.design/watchman/otel0.glm53.md
    title: Watchman OTEL observability
  - id: timeout-glm
    resource: /.design/watchman/timeout0.glm53.md
    title: Watchman timeout and failure-isolation resilience
    author: model:glm-5.3
  - id: timeout-sol
    resource: /.design/watchman/timeout0.gpt56s.md
    title: Watchman resilience through deadline and failure-boundary separation
    author: model:gpt-5.6-sol
---

# Watchman design corpus — summary and recommendations (rec0)

## What's up

The watchman workspace (`~/src/opencode-watchman`) holds a working, bookmarked
Watchman backend for opencode (`packages/core/src/filesystem/watchman/*`) plus
seven design documents under `.design/watchman/` — too much to read in one
sitting. The user asked for a full read-through, a summary, and a
recommendations file. The corpus splits into three layers:

1. **Landed and settled** — the backend itself, its cleanup/ownership ruling,
   and the maintenance log ([`README.md`](README.md),
   [`cleanup0.gpt56t.md`](cleanup0.gpt56t.md)).
2. **Candidate, not started** — observability
   ([`otel0.glm53.md`](otel0.glm53.md)) and the timeout/failure-boundary
   hardening, which now has two review rounds that *disagree on attribution
   and mechanism* ([`timeout0.glm53.md`](timeout0.glm53.md) vs
   [`timeout0.gpt56s.md`](timeout0.gpt56s.md)).
3. **Historical** — the original assessment and registry design
   ([`draft0.ds4p.md`](draft0.ds4p.md), [`init0.glm52.md`](init0.glm52.md)),
   partially superseded by what actually landed.

This doc summarizes each, adjudicates the timeout-wave disagreements (§
[Adjudication](#adjudication-where-the-two-timeout-waves-stand)), and turns
the surviving material into an ordered implementation plan (§
[Recommendations](#recommendations)).

## The corpus at a glance

| Doc | What it is | Status |
| --- | --- | --- |
| [`README.md`](README.md) | Maintenance log: stack lineage, rebases, config knobs, settled rulings, known flakies, open follow-ups | Authoritative for state |
| [`draft0.ds4p.md`](draft0.ds4p.md) | Wave-1 assessment: measured watch churn; why parcel's watchman backend is insufficient (5 verified read-outs); chose a first-party client behind the `Watcher.Native` seam | Implemented (historical) |
| [`init0.glm52.md`](init0.glm52.md) | Wave-2 deep design: process-global root registry, deferred root resolution, context leases, activity-gated grace teardown, ignore→expression translation | Partially superseded — routing/expressions/cursors landed; leases, grace-`watch-del`, and the registry shape were replaced by cleanup0's ruling and the retained-backend model |
| [`cleanup0.gpt56t.md`](cleanup0.gpt56t.md) | Source-verified daemon ownership model; deletes the per-process ledger; **never `watch-del`**; daemon self-GC is the whole cleanup story | Settled, implemented |
| [`otel0.glm53.md`](otel0.glm53.md) | OTEL design: linked subscribe/unsubscribe/resume event spans per messaging semconv, dormant metrics, plugin-tracer gap | Candidate, not started |
| [`timeout0.glm53.md`](timeout0.glm53.md) | Forensic inventory of every deadline and the Aug 30 incident mechanics; eight candidate paths (A–H) | Superseded in part by the gpt56s review |
| [`timeout0.gpt56s.md`](timeout0.gpt56s.md) | Independent review of the glm53 wave: three attribution corrections, protocol-level rejections of two paths, and a concrete five-slice design | The strongest current design; not started |

## Per-document summaries

### README.md — the maintenance log

The backend is a real, rebased, bookmarked stack (18 bookmarked commits on
`v2@origin e70d667a`): one Watchman subscription per logical interest over a
shared daemon connection, `watch-project`/exact routing with
generation-local route caches, per-subscription cursors, micromatch ignore
filtering with literal watchman-side expression pushdown, Parcel fallback
only before the first subscribe ack, flat 15m RcMap retention. Config
surface: `OPENCODE_WATCHER_BACKEND`, `OPENCODE_WATCHMAN_NOTIFY_SECONDS`,
`WATCHMAN_SOCK`, `ServerOptions.fs.*`. Reconnection retries forever
(100ms→3.2s backoff). Settled rulings: never `watch-del` (daemon reaps idle
roots in 5 days), flat 15m retention TTL, ledger machinery removed the day
it landed. Verification commands and known flakies are listed so nobody
chases ghosts. Open follow-ups: timeout hardening (two waves, unstarted),
OTEL (unstarted), fork upstreaming (4 lifecycle guards + `index.d.ts` bump),
spec'd diagnostics, live-daemon test still gitignored scratch, packaging
checks never run.

### draft0 — the assessment (Aug 18)

Measured the pain in local logs: 83 subscribes/62 starts/61 stops per
server, skill watches with `ignores=0`, overlapping recursive watches of
`~/.config/opencode` and its subtree, all multiplied across 4 concurrent
server processes. Verified five deficiencies in `@parcel/watcher`'s watchman
backend from source (`popen` per probe, `watch` instead of `watch-project`,
never `watch-del`, opaque failures, no reconnect). Chose Option B: a
first-party `NativeInterface` in TypeScript. All of this landed essentially
as designed. Still-relevant leftovers it flagged: default ignores for skill
watches, and the RcMap idle-grace that later became the 15m TTL.

### init0 — the registry design (Aug 18, glm-5.2)

Deepest design in the corpus: process-global `WatchRoots` registry with
memoized deferred root resolution (cover-check ancestor hits never touch the
daemon), adoption policy against `$HOME`-walk-up pathologies, per-context
lease books, activity-gated 15m grace, expression translation rules
(`dirname` = immediate children only; `match` for depth), and the reconnect
model. What landed kept the substance (routing, expressions, cursors,
fallback, TTL) but dropped the registry/lease/watch-del machinery — the
daemon's own model (cleanup0) made most of it unnecessary. Its verified
protocol table and expression lessons remain the best reference for how the
implementation behaves.

### cleanup0 — ownership and cleanup (Aug 20, gpt-5.6-terra)

Read the watchman daemon source and ruled: subscriptions are
connection-scoped and die with our socket; the daemon knows client identity
via `SO_PEERCRED`; watches are global and `watch-del` is unconditional
(yanks every client's watch); the daemon self-GCs roots after 5 idle days
(`idle_reap_age`); watches survive daemon restarts via the state file.
Therefore the per-process ledger files were deleted the same day they
landed, and the ruling is **unsubscribe at the subscription level, never
`watch-del`** — in-process "we don't need it" is the RcMap TTL; root-level
"nobody needs it" is only knowable daemon-side, which is exactly what the
reaper answers. The remaining demand counter exists solely to gate the
disconnected-notify loop.

### otel0 — observability (Aug 20, glm-5.3)

Verified the host surface: logs + OTLP traces exist, metrics do not (but
Effect's `Metric` API and an `OtelMetrics` bridge are one
`metricReader` mirror away); the tracer is a scoped service that core code
inherits for free; promise/TUI plugins are the real tracer gap (workspace
`~/src/opencode-plugin-otel`). Design: short linked event spans —
`watchman.subscribe` / `watchman.unsubscribe` / `watchman.resume`, each
linking back to its subscribe span — carrying both `watchman.*` and
`messaging.*` attributes per the (Development-status) messaging semconv;
never one long lifetime span. Counters/gauges/histogram accumulate dormant
until a metrics reader exists. ~40 lines in `native.ts` to instrument.

### timeout0.glm53 — the forensic inventory (Aug 30, glm-5.3)

Inventory of every deadline in the path and the observed incident mechanics
(all re-verified from source and logs):

- One flat 10s command timeout covers **queue wait + execution** on a
  connection where the fork serializes commands — one ~9.5s cold crawl
  expires every queued sibling.
- Any timeout — and any establish error, including per-path policy
  rejections like `enforce_root_files` `RootResolveError` — retires the
  shared generation, `end()`ing the socket for everyone.
- First-acquisition failure is parcel-forever for that interest.
- Generation churn discards the route cache, forcing a re-`watch-project`
  wave (feedback loop).
- Cookie files (`.watchman-cookie-*`) triggered 669 skill rescans.
- The 5s `/api/model` readiness gate made watcher latency user-visible
  (496 503s on an otherwise healthy server).
- Retirements mostly bypass the shared log file (3 lines vs 9+ journal
  entries).

Laid out eight paths (A–H): shrink blast radius, per-stage budgets, don't
retire for policy, retry before fallback, bound concurrency, filter cookies,
coordinate with the catalog gate, make retirements observable.

### timeout0.gpt56s — the review round (Aug 30, gpt-5.6-sol)

Confirms the core mechanics (shared-generation blast radius, queue-resident
budget, blanket retire, fallback boundary, route-cache churn) and then makes
**three corrections and two rejections** — see the adjudication below. Its
constructive design: keep three deadlines separate (product readiness /
command admission / command response); filter synchronization artifacts at
the *domain* boundary (ConfigSkillPlugin), not in watchman expressions; put
an admission gate before the fork's FIFO so response budgets start at raw
submission; replace blanket retire with an explicit failure taxonomy where
only generation-level conditions retire; retry *collateral* closures while
keeping immediate fallback for path-local policy and unavailable daemons;
make every boundary observable; pin `WATCHMAN_SOCK` and log socket + daemon
version. Ends with five implementation slices, deterministic test
assertions, live checks, and a "shortcuts to avoid" list.

## Adjudication: where the two timeout waves stand

The gpt56s review is well-evidenced against source I re-checked in this
workspace (`client.ts:5,75-104`, `native.ts:37-53,63-130,171-173`), and it
wins on every disputed point:

1. **The 503 attribution is unproven.** Watcher acquisition is already
   forked (`ConfigSkillPlugin.watch` → `FiberMap.run`); plugin activation
   does not join the watchman command. Watchman churn may *contend*, but
   "slow ack held the readiness latch" is a hypothesis to measure, not a
   fact. The glm53 framing of path G overstated it.
2. **The 20s clock budget is not ours.** OpenCode sends `['clock', root]`
   with no `sync_timeout`; the observed 20s calls are the daemon's own
   once-per-minute `SanityCheck` thread. Mirroring that budget (glm53 open
   question) would create more cookies, not fewer.
3. **Cookies cross via the fallback, not watchman.** The daemon filters its
   own cookies from its view; the rescans correlate with
   `backend=inotify` watching raw filesystem activity. So the filter
   belongs at the config-skill consumer (backend-neutral), not in our
   subscription expressions (glm53 path F as written).
4. **"Fail one command, keep the generation" (A) and "retire after N
   timeouts" are unsound** given the fork's protocol: no request IDs, no
   cancellation; an expired-but-outstanding command still occupies the FIFO
   head, and N queued victims are not N independent liveness signals.
   Retirement stays correct for an *active-command response deadline* — the
   bug is starting that deadline during queue residence and making every
   collateral closure a permanent parcel fallback.
5. **Negative route caching is deferred, not built** (glm53 C's cache): the
   `.watch` marker that appeared under `~/.config/opencode` after the
   rejection shows policy/root state can change under us; the retained
   parcel entry already suppresses reacquisition for its RcMap lifetime.

What survives from the glm53 wave intact: the deadline census, the
shared-generation blast-radius mechanics, policy-rejection-as-path-local
(path C), bounded admission pressure (E, refined into the gate), retry
before first fallback (D, narrowed to collateral closure), observability
(H, retained), and the fault-injection verification sketch.

## Recommendations

Ordered for value and dependency. Slices 1–2 are cheap and unblock honest
measurement of the rest; slices 3–4 are the real hardening and should land
as one workstream; slice 5 resolves the remaining attribution question;
slice 6 is carried-over hygiene.

**1. Filter synchronization artifacts at the config-skill boundary.**
Match `.watchman-cookie-<host>-<pid>-<serial>` by full shape (terminal
numeric fields, not just the prefix) in `ConfigSkillPlugin` before events
reach the sliding `changes` PubSub. Kills the proven 669-rescan amplifier
for every backend, stops cookie events from evicting legitimate pending
skill events, and doesn't touch the generic Watcher contract. Do not
broaden it speculatively (`.watchmanconfig`, non-Markdown paths).

**2. Land the observability floor.** Retirement causes through the
server's logger context (replace the `Effect.runFork(Effect.logWarning)`
bypass in `retire`), a synthesized cause for bare `'end'`, and the otel0
signals as bounded-cardinality counters/histograms: admission wait and
response latency by stage, generation create/retire by cause, path-local
rejections, collateral closures + retries, fallbacks by reason, cookie
suppressions. Add the otel0 linked event spans (`subscribe`/`unsubscribe`/
`resume`) in the same pass (~40 lines). Pin `WATCHMAN_SOCK` in the
supervised environment and log socket + daemon version at connect. After
this slice, the next incident is readable from the log file alone.

**3. Failure taxonomy; retire only for generation-level conditions.**
Typed `WatchmanError` kinds replacing the blanket
`establish.tapError(retire)`: policy/validation responses are synchronized
and path-local (fail that interest to parcel, keep the generation); decode
failures fail visibly without reconnect churn; socket `error`/`end` and
active-command response deadlines retire once; capability failure during
create closes only the candidate. Also fix the `subscription canceled` PDU
path, which today retires the whole generation (`native.ts:171-173`) —
re-establish that subscription first and don't poison siblings.

**4. Admission gate + stage response budgets.** Per-generation gate before
the fork's FIFO: waiters race gate acquisition against `generation.closed`;
once admitted, submit exactly one raw command and start the command-class
response deadline then. Queue wait stops consuming execution budget;
admission expiry fails that interest *without* retiring (nothing was sent).
Stage budgets: capability/clock/subscribe short; route (`watch`/
`watch-project`) long enough for cold crawls — decided from daemon crawl
histograms, not from any product deadline. Land 3+4 together or in
immediately adjacent commits: classification without admission timing still
produces false generation timeouts; admission timing without classification
still lets policy rejection poison the generation. If a
dispatch-anchored deadline is wanted exactly, the smaller first change is
the adapter gate; a `sendNextCommand` hook in `fb-watchman-esm` can follow.

**5. Retry collateral closure only.** Siblings that never submitted and
only saw `GenerationClosed` retry against `manager.current()` with backoff
before considering parcel; policy rejection and daemon-unavailable keep
immediate fallback; the command that genuinely exceeded its response
deadline may fall back for that interest. No live parcel→watchman
promotion (existing parcel entries stay until their RcMap lifecycle ends).

**6. Readiness replay before any catalog-gate change.** Instrument
`Plugin.load`, config-skill scan phases, and the ready latch; boot the same
cold Location set with watchman / parcel / watching disabled; add the
never-answering-fake-client test asserting the initial skill transform and
`PluginSupervisor.flush` still complete. Only then assign causality for the
`/api/model` 503s — and treat any gate change as a separate (upstream)
workstream, per the systemd design's degraded-not-fatal boundary.

**Carry-over (from the README's open follow-ups, non-incident):** upstream
the four fork lifecycle guards + the vendored `index.d.ts` to
`~/src/watchman-esm` (then drop the `fb-watchman-esm.ts` shim); promote the
live-daemon smoke test from gitignored scratch to a gated committed suite;
run CLI packaging checks once.

**Explicitly not now:** raising the flat `COMMAND_TIMEOUT` alone (moves the
cliff), N-consecutive-timeout retirement, `sync_timeout` on our clock,
global negative policy caching, watchman as a required systemd dependency,
and readiness-latch changes without the slice-6 evidence.

## Sequencing

| # | Slice | Depends on | Size |
| --- | --- | --- | --- |
| 1 | Cookie filter (config-skill) | — | small |
| 2 | Observability floor + otel0 spans + socket pinning | — | small–medium |
| 3 | Failure taxonomy + scoped retirement | 2 (verifiability) | medium |
| 4 | Admission gate + stage budgets | 3 (same workstream) | medium |
| 5 | Collateral-aware retry | 3, 4 | small |
| 6 | Readiness replay | 2 (timing signals) | small, mostly test harness |

## Verification

Both timeout waves converge on the fault-injection harness at the existing
`Manager`/`RawClient` seam (`makeNativeWith` accepts any `Manager`), with a
fake clock: a 15s route command must not fail queued siblings; admission
expiry must not `client.end()`; a never-answering submitted command retires
exactly one generation and waiters retry on the next; a `RootResolveError`
falls back one path while a sibling succeeds on the same generation; cookie
events from a parcel test backend cause no skill refresh; retirement causes
appear in the shared log. Live: boot-comparison across backends, an
`enforce_root_files` repro, daemon stop/start with active subscriptions, and
the sanity-thread cookie check. Known flakies to ignore are listed in the
[README](README.md#known-flaky-tests-do-not-chase-ghosts).

## Open decisions (for the user)

1. **Cold-route budget value** — decide from daemon crawl histograms after
   slice 2; is there an upper bound we consider a misconfiguration?
2. **Adapter gate vs fork hook** — start adapter-side (smaller), or add the
   `sendNextCommand` dispatch hook to `fb-watchman-esm` immediately for
   exact wire-anchored deadlines?
3. **`notifySeconds` default** — now that disconnected outages are a known
   incident shape, default the warning on (e.g. 30s) instead of requiring
   the env var?
4. **Subscription-canceled scope** — retry just that subscription (my
   recommendation in slice 3) or all subscriptions on its root? Needs no
   generation-wide retirement either way.
5. **Cookie filter generality** — stay config-skill-specific for now (my
   recommendation), or audit other consumers and make it a documented
   Watcher normalization rule?

## Cross-references

- [`README.md`](README.md) — state, config, rulings, verification; this
  file's "Open follow-ups" is the pre-rec plan of record.
- [`timeout0.gpt56s.md`](timeout0.gpt56s.md) — the design slices 3–5
  implement; strongest current document.
- [`timeout0.glm53.md`](timeout0.glm53.md) — the deadline census and
  mechanics inventory; superseded on the disputed points above.
- [`otel0.glm53.md`](otel0.glm53.md) — the span/metric design slice 2
  lands.
- [`cleanup0.gpt56t.md`](cleanup0.gpt56t.md) — the ownership model slice 3
  must not regress (never `watch-del`; the daemon reaps).
- [`draft0.ds4p.md`](draft0.ds4p.md), [`init0.glm52.md`](init0.glm52.md) —
  historical assessment and registry design; protocol table and expression
  rules still useful.
- [`../watch/draft1.gpt56t.md`](../watch/draft1.gpt56t.md) — the transport
  design the implementation follows.
- [systemd design](file:///home/rektide/src/opencode-systemd/.design/systemd/systemd.gpt56t.md) —
  the readiness incident forensics and the independently-supervised,
  degraded-not-fatal watchman boundary slices operate within.
- [`patches.md`](file:///home/rektide/archive/doc/opencode/patches.md) —
  accepted-stack manifest; this wave is a candidate, not accepted work.
