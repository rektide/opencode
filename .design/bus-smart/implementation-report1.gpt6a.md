---
type: ImplementationReport
title: Bus-smart draft1 runtime implementation
description: Astra execution record, verification, patch-carry decisions, and remaining limits.
resource: /.design/bus-smart/implementation-report1.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
sources:
  - resource: /.design/bus-smart/draft1.gpt6a.md
  - resource: /.design/bus-smart/implementation1.gpt6a.md
---

# Bus-smart draft1 runtime implementation

## Baseline and scope

- Author: GPT-6 Astra, xhigh. Runtime implementation explicitly authorized.
- Workspace: `/home/rektide/src/opencode-bus-smart`; clean starting change
  `ktylozxt / f8807433`, parent `wvvklnqz / d37d1b99`.
- Local upstream archive checked first: `/home/rektide/archive/anomalyco/opencode`,
  HEAD `4306c07b340b9a0504e65785f366d2793cd1b169`; older than the supplied rebased
  base `2960c61f9c5c86f23059d9da73e632951650edc7`. Historical worktree is not a base.
- Preserve upstream SharedEvents/public legacy behavior, Core move `publishAll`,
  one feed module/two operations, existing retry owner, and notification eligibility.
- Implement exact five-type Session filtering, negotiated compatibility, lifecycle
  repairs, default-off TUI experiment and read barriers, bounded snapshot repair.
- No proxy, general filtering/replay framework, Location reverse index, derived-key
  cache, live elected service operations, history cleanup, or push.
- Independent final review is reserved for the parent session; this agent self-reviews.

## Execution and verification

### Logical increments

| Commit | Outcome |
| --- | --- |
| `9843c21f` | Execution baseline and index |
| `1f7fa772` | Optional profiles, canonical five-type classifier; generated clients and OpenAPI |
| `6f2dd72f` | Correct scan predicate, capability advertisement, broad RPC, Location-only move holds |
| `f1ffa76a` | Profile-aware cached targets, fenced attachment/fallback, generated PUT error identity, connection pause/wake |
| `be3c593a` | Explicit transcript request identity/dirty reread, pagination repair, late eviction/delete guard, absent assistant fast path |
| `c11169ce` | Cancellable adoption waiters; composed SharedEvents fallback isolation |
| `50e5ddc6` | Default-off experiment, synchronous policy binding, visible/hidden/prompt barrier, event-only retry command |
| `9974e10b` | Session follower index with atomic profile/activation/overflow cleanup |
| `eb8ed4d7` | Interim verification and many-process measurement record |
| `236f50f7` | Measured complete-arm no-recipient encoding precheck |
| `ef638fc5` | Real runner/immediate/unavailable-instance move suffix tests |
| `9aa92edd` | Pending-read resurrection repair, initial-marker correction, further failure fixtures |
| `459abb57` | Reactive pause wake ordering; toggle skips service resolution |
| `f40f4287` | Legacy cache preservation and actual TUI adoption/toggle/prompt fixtures |

The single binding facade is a small TUI-owned leaf so it can be tested without
remounting the provider tree. Snapshot repair rereads the already loaded row count
in bounded pages rather than keeping an unauthoritative older-page prefix; this
costs additional HTTP reads for deeply paginated transcripts but preserves their
loaded history. Only explicit reads create this repair state. Network failures do
not trigger an internal retry loop. No Core production change was necessary.

### Verification so far

- Baseline: Client selected suites **68 pass**, Server event suites **20 pass**.
- Protocol test-first failure on missing classifier, then **7 pass**; `bun typecheck`,
  `bun run generate`, `bun run check:generated` passed from `packages/protocol`.
- `bun run generate` passed from `packages/client`; no generated file edited by hand.
- Server tests first reproduced unwanted same-Location streaming and lost broad RPC;
  post-predicate **22 pass**; post-index targeted **16 pass**. Server typecheck passed.
- Client browser-conditioned controller/connection/transcript suites: **25 pass**,
  no skips; Client typecheck passed. Initial and midstream 400 pause, stale 404,
  preabort, capability cleanup, target equality and wake-at-classification covered.
- Snapshot fixtures reproduced stale-running overwrite, failure with no repair,
  older-page loss and absent-row allocation before the repair. New fixtures pass
  terminal-before-response with no later event, failed partial text, 100 deltas
  without refetch, coalesced failures, eviction/delete and loaded-page preservation.
- Existing Client data suites under ordinary conditions: **30 pass, 1 browser-only
  skip** including new tests. That browser-only test executed in the 25-pass run.
  Running the old data suite under browser conditions exposes two `toMatchObject`
  failures on Solid proxies despite matching serialized values; baseline confirmation
  remains necessary before calling those pre-existing. New browser fixtures pass.
- TUI policy/binding tests **7 pass**, TUI typecheck passed. Binding fixture observes
  acknowledged PUT before generated message GET and mode-change release of a pending
  barrier. Full renderer-driven visible/hidden fixtures remain a separate gap.

### Isolated many-process measurement (indexed, before encode precheck)

Source-direct runner: `.test-agent/bus-smart/bench/server.ts`, companion `client.ts`
and README. Real Bus and Server routes, private memory DB/Global paths, ephemeral
loopback listener, generated Promise wrappers, Solid data, **8 distinct client
processes**, 32 Sessions, one Location, one followed Session/client, 300 measured
rounds after five warmup rounds. All clients acknowledge attachment installation
before the source start marker. No live service or model execution.

Each round publishes every one of the five streaming types for each Session plus
one 1-KiB public RPC. End includes 32 full-value 4-KiB text events. Three repetitions:

| Mode | Server CPU ms | Sum client CPU ms | Aggregate CPU ms | Wall ms | Delivered SSE bytes |
| --- | --- | --- | --- | --- | --- |
| Legacy | 2457 / 2616 / 2430 | 9773 / 10245 / 9762 | 12230 / 12861 / 12191 | 1967 / 2057 / 2043 | 165,954,288 |
| Location | 2957 / 2792 / 3018 | 9057 / 8778 / 9934 | 12014 / 11570 / 12952 | 2353 / 2094 / 2314 | 165,954,288 |
| Session-streaming | 1708 / 1729 / 1842 | 988 / 996 / 1092 | 2696 / 2725 / 2934 | 1303 / 1332 / 1405 | 9,087,088 |

Every focused client received **300 events of each gated type**, versus **9600**
per type in broad modes: exactly 1/32, not a CPU estimate. Every mode received all
300 RPC and 32 terminal text events/client. Broad residual payload bytes/client:
RPC **360,600**, terminal text **142,230**; these are not removed by filtering.
One initial explicit message GET/client; no metadata or repair GETs in this fixture
because it publishes no measured create/terminal-execution/failure events. Thus
it does **not** establish real notification hydration/repair workload costs.

Physical requests: legacy 8 event GETs + 8 message GETs; both controlled modes 8
controlled GETs + 8 acknowledged PUTs + 8 message GETs, no hidden legacy GET.
Server p99 event-loop delay ranged 5.10–8.00 ms legacy, 7.62–10.37 ms Location,
3.78–5.51 ms focused; client maximum p99 ranged 3.21–28.15, 4.19–13.89 and
0.38–1.05 ms respectively. Bun `1.4.1 (4661e494f)`.

These modes all use the **current client projection**, including the missing-target
guard; “legacy” here is upstream-compatible transport, **not an unmodified upstream
revision benchmark**. The experiment remains off; no live-user CPU claim follows.
The raw chunk-aligned byte sampler may miss the chunk containing the start marker;
the table instead sums exact cohort JSON plus eight SSE framing bytes/event.

## Limits and graduation

The experiment stays default off. The bounded fixtures and synthetic workload
establish the narrower results above, not general replay or live-user performance.
Public RPC and other broad residual traffic remain eligible server-wide. No
historical live-prefix replay, exact live snapshot merge, notification replay,
clustered execution, or invisible-server-change watcher is promised.

### Additional verification and self-review corrections

- The full TUI run exposed a second transcript-resurrection path: stale **pending
  inbox** hydration can materialize a row after eviction, deletion or delivery.
  This necessary supporting repair has a request identity/dirty bit only while a
  pending read is active. It reuses `createSync`, preserves optimistic admissions,
  and does not create another persistent observation registry. New fixtures cover
  all three cases, plus stale running compaction after failure.
- Avoided redundant initial message reads: the first connected marker does not
  invalidate newly read transcripts, and intentional legacy/fallback adoption
  does not force a cache miss. Focused adoption and reconnect still reconcile.
- A synchronous reactive observer of `paused` could wake before the parked
  resolver existed. Registering the resolver before publishing paused state closes
  that concrete lost-wake window; an executed browser fixture pins it.
- Experiment toggles explicitly skip service resolution (`resolve: false`), not
  merely service restart. Explicit **Reconnect event stream** may re-resolve.
- TUI test fixtures now supply the production ConfigProvider prerequisite and
  advertised profiles. Their injected fetch streams honor abort, as native fetch
  does. Opt-in tests explicitly enable the experiment instead of assuming the old
  unconditional controlled default. Retry fixture HTTP state now reflects its
  terminal event rather than returning an obsolete retry forever.
- Real renderer fixtures exercise `createSessionRows` and hidden-tab prefetch,
  asserting zero message GETs before held activation acknowledgment. Toggle tests
  observe legacy → controlled → legacy physical GETs without replacing data/API.
  The existing optimistic-first-prompt test now runs with the negotiated profile.
- Real Bus + ControlledEventFeed + Session/SessionExecution tests pass actual
  healthy runner completion, missing-source immediate recovery, and an existing
  source with unavailable instance configuration. Both profiles receive move then
  destination permission/form and unlocated Session suffix without another PUT.
  This does not add a guarantee for an already-busy model execution or restart
  recovery from an unavailable source.
- `bun --conditions=browser ../../.test-agent/bus-smart/bench/snapshot.ts` from
  `packages/server` passes with an isolated real HTTP listener, production Server
  routes, Bus, Core durable projector, generated controlled wrapper and Client
  data. It captures a running GET, receives a non-durable suffix and `step.failed`,
  releases the stale response, and compares the repaired row against actual
  `Session.messages` projection with **no later event**. Exactly **three** transcript
  reads (initial, stale, repair); both canonical and client text are empty, finish
  is error. Dropping the non-durable suffix—not recovering an invented prefix—is
  the correct result. Startup event receipt is explicitly gated before the first
  GET so fixture initialization cannot accidentally trigger the held second GET.
  The first in-process fetch version passed its assertion but could not close a
  pending SSE read because that injected fetch did not implement native abort;
  its owned scratch process was terminated. The actual HTTP version exits cleanly.

### Index and encoding evidence

`admission.ts` compares the correct scan saved from `6f2dd72f` with the production
index: 512 disjoint followers, 32768 streaming publications, all encoded in both
cases. Warm repetitions (excluding first/cold) used **435 / 378 / 444 ms CPU** for
scan versus **135 / 96 / 90 ms** for index; wall **372 / 350 / 398 ms** versus
**85 / 80 / 80 ms**. This is an admission microbenchmark, not HTTP or whole-workload
CPU. It does not equate disjoint follows with encoding skips.

The complete-arm precheck was added separately after a failing encode-count test.
`precheck.ts` compares `9974e10b` against it: one active focused client, empty union
of follows, 100000 streaming publications. Encodes fall **100000 → 0**. Warm CPU
**375 / 223 / 204 ms → 64 / 45 / 40 ms**, wall **282 / 210 / 196 ms → 52 / 41 / 37 ms**.
The mixed-profile test explicitly prevents skipping an active matching Location
subscriber. The observation/return is synchronous; non-skipped events retain
encode-before-admission and existing encoding-failure behavior.

Additional single-run HTTP checks with the final precheck:

| Workload | Server CPU ms | Client CPU sum ms | Delivered bytes | Per-client arrivals of each gated type |
| --- | --- | --- | --- | --- |
| 8 clients / 32 Sessions / 4 Locations / 1 follow | 1556 | 974 | 9,087,088 | 300 |
| 8 clients / 32 Sessions / 1 Location / **32 follows** | 2718 | 9302 | 165,954,288 | 9600 |
| 8 clients / 32 Sessions / 1 Location / 1 follow | 1478 | 961 | 9,087,088 | 300 |

The all-followed control correctly loses the reduction. Broad RPC/terminal counts
remain unchanged across Locations. These single checks are not independent
repeatability evidence for a new percentage beyond the earlier three-run table.

### Package-wide verification

All commands ran from their package directories, never repository root:

| Package/command | Result |
| --- | --- |
| Client `bun run test` | **178 pass, 7 skip, 0 fail**, 16 files; all seven browser-only tests execute in the next row |
| Client `bun test --conditions=browser test/solid-transcript.test.ts test/solid-controlled-event-feed.test.ts test/solid-connection.test.ts` | **31 pass, 0 skip, 0 fail**, including the final reactive wake/no-resolution test |
| Server `bun run test` | **77 pass, 3 skip, 0 fail**, 27 files |
| TUI `bun run test` | **1308 pass, 4 skip, 0 fail**, 143 files, 2 snapshots |
| TUI actual reader/lifecycle/data/event targeted suites | **144 pass, 0 fail**, 5 files |
| Protocol `bun test` | **13 pass, 0 fail**, 3 files |
| Core `bun test test/bus.test.ts test/session-move.test.ts` | **74 pass, 0 fail**; Core production unchanged |

Client, Server, Protocol, TUI and Core package `bun typecheck` have passed. Final
post-format Client/Server/Protocol/TUI typechecks passed, as did Prettier checks on
the affected runtime modules and the Protocol generated mirror check.
The older browser-conditioned Client data suite's two Solid-proxy `toMatchObject`
failures were **confirmed against baseline `9843c21f`** using a scratch Bun onLoad
preload, without reverting production. The ordinary package suite passes, and all
new browser-conditioned fixtures execute. Initial TUI suite failures were resolved
through the production/fixture corrections above; the final whole suite is green.

### Remaining release gates / deliberately incomplete matrix

- No live elected service was modified or restarted, and no real-user foreground
  latency/CPU trial was performed. The experiment is not promoted.
- No 32-client stress run, sustained unbounded plugin-RPC overload, simultaneous
  mixed-profile multi-process CPU matrix, or representative notification-metadata
  plus repair-request workload has been measured. Module overflow/mixed routing
  and upstream SharedEvents tests pass; they are not substitutes for those runs.
- Publication-cohort IDs and exact five-type counts are covered after activation
  and direct acknowledged removal. Grace timing and serial acknowledged replacement
  are controller-tested, but a cross-process grace-removal cohort remains absent.
- Partial text/compaction failure, pagination, pending/outbox and eviction/delete
  are exercised. A complete tool/reasoning/reconnect/retention race matrix and a
  truly active-model move followed through completion remain follow-up acceptance
  work, not implied by the simpler fixtures.
- Full Core suite was not run: no Core production edits; Bus and movement regression
  suites plus Core typecheck were the relevant regression boundary.
- Scratch benchmark/diagnostic sources and raw results remain ignored under
  `.test-agent/bus-smart/bench`; the execution report preserves their commands,
  workload, source revisions, measurements and limitations. They are not package
  distribution artifacts. Independent review remains the parent's next wave.

## Closeout

Runtime candidate implemented and saved in explicit-path logical commits on the
original workspace. No history rewritten, user work discarded, remote pushed, or
live elected service changed. Final package-wide results are green with the listed
skips; the separately confirmed old browser proxy assertions are not counted as
passing. Self-review covered routing/index cleanup, generation/error ownership,
reactive pause wake ordering, provider lifetime, real read sites, and transcript
repair. Remaining acceptance coverage is explicit above: this is a reviewable,
default-off candidate, not a graduated performance/notification guarantee.

## Cross-references

- [Implementation plan](/.design/bus-smart/implementation1.gpt6a.md): scope and proof boundaries.
- [Client assessment](/.design/bus-smart/implementation-research1-client.gpt6a.md):
  corrected snapshot, retention and actual transcript-read seams.
- [Server assessment](/.design/bus-smart/implementation-research1-server.glm53.md):
  index lifecycle; use synthesis corrections for duplicated state/encoding estimates.
