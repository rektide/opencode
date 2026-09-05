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

The experiment stays default off. No CPU improvement or canonical convergence is
claimed before fixtures and measurements establish it. Public RPC and other broad
residual traffic remain eligible server-wide. No historical live-prefix replay.

## Cross-references

- [Implementation plan](/.design/bus-smart/implementation1.gpt6a.md): scope and proof boundaries.
- [Client assessment](/.design/bus-smart/implementation-research1-client.gpt6a.md):
  corrected snapshot, retention and actual transcript-read seams.
- [Server assessment](/.design/bus-smart/implementation-research1-server.glm53.md):
  index lifecycle; use synthesis corrections for duplicated state/encoding estimates.
