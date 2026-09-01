---
type: Design
title: Root-scoped Watchman maintenance log
description: Implementation state, verification record, and operational notes for the root-scoped Watchman backend.
resource: /.design/watchman/README.md
tags: [opencode, watchman, watchwoman, filesystem, maintenance]
status: stable
generated: { by: model:gpt-5.6-terra, at: 2026-08-31T21:40:00Z }
verified: { by: model:gpt-5.6-terra, at: 2026-08-30T21:10:00Z }
stale_after: 2026-10-30
sources:
  - id: accepted-design
    resource: /.design/watchman/draft2.gpt56t.md
  - id: daemon-validation
    resource: /.design/watchman/watchwoman0.unknown.md
  - id: patch-policy
    resource: file:///home/rektide/a/doc/opencode/patches.md
---

# Root-scoped Watchman maintenance log

This workspace carries the implementation of
[`draft2.gpt56t.md`](/.design/watchman/draft2.gpt56t.md) as an independent stack over
`v2@origin` `6a2c3e91`, freshened 2026-08-30 from the previous `e70d667a` base
(see the freshen record below). The dated `watchman-20260829` bookmark remains
the audit snapshot of the deleted process-global implementation, and the
floating `watchman` bookmark now tracks this root-scoped replacement line.

## Current stack

Change IDs are the freshened (duplicated-then-rebased) line; the pre-freshen
originals remain in the repo under their old change IDs.

| Change | Scope |
| --- | --- |
| `srpksroy` | `refactor(core): reconcile source watch interests` - owner-local `ensure`/`reconcile`, stable Config and Skill subscriptions, post-ack dirty replay, missing and symlink sentinels, Skill cookie filtering |
| `znylspvo` | `feat(core): add root-scoped Watchman backend` - private placement metadata, exact-interest sharing, one admitted connection per route intent, cursor recovery, initial Parcel fallback, typed response decoding, injected and live tests |
| `wqssnrny` | `feat: expose Watchman backend selection` - optional environment and `ServerOptions` plumbing |
| `wzzxryxo` | `docs(watchman): document root-scoped backend` - this corpus and maintenance record |
| `tpnsvulo` | `fix(core): enforce root-owned watch recovery` - review fixes for submitted-command admission, one shared root reconnect sequence, owner-stream failures, and failed Skill scans |
| `qukmyzry` | `docs(watchman): trim implementation corpus` - retain only the implemented design and its direct evidence |
| `puwuuxxp` | `fix(core): recover source watch failures` - resubscribe failed owner interests and retain per-source URL snapshots |
| `pvkvkwlt` | `docs(watchman): record review fixes` - update the accepted design and verification record |
| `muomvswy` | `refactor(core): tighten watcher internals` - centralize generic watcher types and simplify established-generation access |
| `nownkqor` | `docs(watchman): finalize maintenance record` - configuration table and verification record |
| `vsnyruwx` | `feat: make watcher timeouts configurable` - 60s default command deadline plus env and `ServerOptions` tuning for all watcher deadlines and reconnect backoff |
| `wzqmrknl` | `docs(watchman): record timeout tuning` - timeout rationale in the design and maintenance record |
| `nxxrysru` | `chore(core): lower default reconnect cap to 2s` - tighten the default ceiling of the jittered root recovery loop |
| `sokysuus` | `feat: expose watchman binary override` - passthrough to the transport's existing CLI path option, plus per-root subscription counts in connection logs |
| `qpqtqors` | `feat(core): add watchman channel metrics` - wide-event counter/gauge telemetry per channel with per-window deltas, wide and line-per-channel modes, and a shutdown final dump |
| `myqxruxs` | `feat(server): expose watchman metrics options` - `metricsIntervalMs` and `metricsMode` in `ServerOptions` plus env plumbing |

The source-owner change stays in upstream's current `Config` and
`ConfigSkillPlugin` modules rather than reviving the withdrawn
`ConfigSourceWatch` and `SkillSourceObserver` branches. This keeps the patch
small while preserving the designed ownership boundary: each owner has its
own `WatchInterests` plan, and no caller chooses Watchman routing.

## Runtime shape

- `Watcher` remains a process-global exact-interest registry with no idle TTL.
- `WatchInterests` is owner-local and attaches project or exact placement from
  the current `Location` through private symbol metadata.
- Files continue to use `node:fs.watch`; Parcel remains the default directory
  adapter.
- Opted-in directory interests use one `RootConnection` per explicit project
  root or exact external target.
- Every connection has its own raw client, command semaphore, response
  deadline, route, subscription map, and reconnect lifecycle.
- All location graphs in a process share one hoisted Watcher build (pinned in
  `test/location-layer.test.ts`): sessions, subagents, and additional watch
  owners never multiply registries or connections — only distinct live root
  intents and separate processes do.
- Project routing always sends `watch <explicit project root>`. It never sends
  `watch-project` and no code sends `watch-del`.
- Initial Watchman acquisition failures fall back to Parcel. After Watchman
  acknowledges, recovery is unbounded with capped, approximately 30 percent
  jittered backoff and cursor resume.
- A submitted command timeout closes only its root generation. A command that
  loses its generation before admission retries through subscription recovery.
- Explicit unsubscribe removes client ownership immediately. Daemon
  `unsubscribe` is best-effort and does not control client-side resurrection.

## Configuration

| Environment | `ServerOptions` | Effect | Default |
| --- | --- | --- | --- |
| `OPENCODE_WATCHER_BACKEND` | `fs.watcherBackend` | `watchman` or `parcel` directory backend | absent, which selects Parcel |
| `OPENCODE_WATCHMAN_COMMAND_TIMEOUT_MS` | `fs.watchman.commandTimeoutMs` | millis before an admitted command retires its root generation | 60000 |
| `OPENCODE_WATCHMAN_RETRY_BASE_MS` / `OPENCODE_WATCHMAN_RETRY_CAP_MS` | `fs.watchman.retryBaseMs` / `fs.watchman.retryCapMs` | millis reconnect backoff growth and cap, about 30 percent jitter | 100 / 2000 |
| `OPENCODE_WATCHER_SUBSCRIBE_TIMEOUT_MS` | `fs.subscribeTimeoutMs` | millis Parcel acquisition deadline | 10000 |
| `OPENCODE_WATCHMAN_BINARY` | `fs.watchman.binary` | Watchman CLI path for socket discovery when `WATCHMAN_SOCK` is unset | `watchman` on `PATH` |
| `OPENCODE_WATCHMAN_METRICS_INTERVAL_MS` | `fs.watchman.metricsIntervalMs` | millis between watchman metrics dumps; `0` disables | 900000 (15 min) when the watchman backend is active |
| `OPENCODE_WATCHMAN_METRICS_MODE` | `fs.watchman.metricsMode` | `wide` logs one JSON line per dump, `lines` logs a header plus one line per channel | `wide` |
| `OPENCODE_FILEWATCHER_DISABLE` / `OPENCODE_DISABLE_FILEWATCHER` | `fs.filewatcher` | truthy disables all watching (`fs.filewatcher: false` is the options form) | enabled |
| `WATCHMAN_SOCK` | - | Watchman transport socket override | transport discovery |

Unknown backend values fail CLI startup validation, as do non-positive
timeout values. There is no `default` enum value, notification interval, or
root TTL. Deadline and backoff tuning exists specifically for heavily loaded
hosts where a short deadline converts a slow command into generation churn.

## Metrics

While the Watchman backend is selected it emits `watchman_metrics` wide
events to the server console, one dump per interval (default 15 minutes)
plus one final dump when the registry scope closes, so short-lived
processes still surface counters. A channel is one root intent's
connection; every dump reports cumulative totals and a delta for the
window just ended, both per channel and summed.

Per channel: commands out by label (`watch`, `clock`, `subscribe`,
`unsubscribe`, `capabilityCheck`) with round-trip millis (total, avg,
window max), command errors and timeouts, generations, reconnect attempts,
connections, establishments and resubscribes, unsubscribes, acquisition
failures, PDUs in (with canceled and fresh-instance counts), files in, and
updates published out after ignore filtering — the `files_in` vs
`updates_out` gap is the ignore-filter drop rate. Live subscriptions
appear per channel with their target (project-relative when possible),
counters, and current Watchman cursor. Gauges: `open`, `generation`,
`recovering`, `fatal`. Registry-wide: `acquires`, parcel `fallbacks`,
and open channel count.

`wide` mode is a single JSON line per dump (a two-channel sample with
subscriptions runs about 3.3 KB); `lines` mode logs a header line with
totals plus one `watchman_metrics_channel` line per channel. Emission is
plain `console.log` until OTEL export exists (see the
`opencode-otel` follow-up); the sink is injectable for tests, and direct
`makeRegistry` callers get no emission unless they pass
`metricsIntervalMs`.

Two sample renders live in
`.test-agent/watchman-metrics/` (fake-daemon `smoke.ts` and live-daemon
`live-smoke.ts`); the live run shows daemon coalescing (three writes and
a delete surfacing as two updates) and the shutdown race where a daemon
`unsubscribe` errors after its generation closes, both visible in the
counters.

## Verification

Run tests from package directories, never the repository root.

```sh
cd packages/core
bun typecheck
bun test test/filesystem/watchman-root.test.ts \
  test/filesystem/watcher-interests.test.ts \
  test/config/skill.test.ts \
  test/config/config.test.ts
OPENCODE_WATCHMAN_LIVE=1 bun test test/filesystem/watchman-live.test.ts

cd ../server
bun typecheck
bun test test/options.test.ts

cd ../cli
bun typecheck
```

Results on 2026-08-30, re-run after the freshen onto `6a2c3e91`:

- Core typecheck: clean.
- Focused Watchman, interest-owner, Config, Skill, and watcher tests
  (5 files incl. `watcher.test.ts`): 69 passed, 1 failed — the known
  `.hg/branch` flake timed out in the combined run and passed twice in
  isolation (~0.9s), matching its documented behavior.
- Opt-in live watchwoman suite: 1 passed, 0 failed against watchwoman 0.7.0.
- Server typecheck: clean; options tests 7 passed, 0 failed (the timeouts
  commit added a 7th case after the previous record of 6).
- CLI typecheck: clean.
- Full Server suite as a bonus check: 53 tests, 0 failed, 3 skipped (up from
  46+3 because upstream added RPC tests).
- Pre-freshen full-suite runs from the implementation review (identical line
  content): full Core 3,998 passed / 31 skipped with only the same `.hg/branch`
  flake (passing in isolation); full CLI 232 passed; targeted Oxlint reported
  no new errors. Full Core/CLI were not repeated after this mechanical,
  zero-conflict freshen.

Results on 2026-08-31, after the metrics commits:

- Core typecheck: clean; the new `watchman-metrics.test.ts` passes 6/6, and
  `test/filesystem/` as a whole passes 65 with 1 skipped (live) and no
  failures — the `.hg/branch` flake did not recur.
- Live watchwoman suite against watchwoman 0.7.0: 1 passed, 0 failed.
- Server typecheck: clean; options tests 9 passed, 0 failed (the metrics
  commit added cases 8 and 9).
- CLI typecheck: clean.
- Targeted Oxlint on all touched files: no new warnings beyond the four
  pre-existing ones in `watcher.ts` and `server-process.ts`.
- Fake-daemon and live-daemon smoke renders in `.test-agent/watchman-metrics/`
  confirm wide-line size (~3.3 KB for two channels), per-window deltas, ignore
  filtering counts, and the shutdown final dump.

## Freshen onto `6a2c3e91` (2026-08-30)

Upstream tip `6a2c3e91` (`feat(plugin): add typed rpc and custom events
(#46105)`), 18 upstream commits past the previous `e70d667a` base.
Duplicate-then-rebase: the 13-commit line `srpksroy..nxxrysru` was duplicated
and the duplicate bottom rebased onto the upstream tip by explicit commit ID,
so the pre-freshen originals and `watchman-20260829` remain untouched.

- **Conflicts: zero.** The upstream delta (typed plugin RPC, AI provider
  fixes, plugin supervisor changes) intersects the feature's files only in
  `bun.lock`, and there the two sides edited disjoint regions: upstream
  bumped unrelated dependencies while the feature inserts
  `@superbfowle/fb-watchman-esm@3.0.0`, `@superbfowle/bser-esm@3.0.0`,
  `is-glob`, `micromatch`, `@types/is-glob`, and `@types/micromatch`. The
  merged lockfile keeps both sides; `bun install --minimum-release-age=0`
  reported no changes, confirming lockfile consistency.
- **Old-vs-new diffstat:** the changed-file list is byte-identical between the
  pre-freshen (`e70d667a..00d76007`) and freshened (`6a2c3e91..c4b2b22c`)
  lines — 27 files, 4066 insertions, 113 deletions on both. No file the old
  line did not touch; no diff creep.
- **Floating bookmark move:** `watchman` previously pointed at `41597e37`
  ("watchman timeout resilience wave", one superseded design-wave doc
  (`timeout0.glm53.md`) atop the old process-global 29-commit line whose tip
  is `watchman-20260829`). That line is the deleted implementation this stack
  replaces per [`draft2.gpt56t.md`](/.design/watchman/draft2.gpt56t.md), and
  its timeout-resistance conclusions were re-landed here as the admitted-
  dispatch and failure-domain design. The bookmark therefore moved to the
  freshened root-scoped tip; `watchman-20260829` (and the older
  `watchman-20260819`) are untouched.
- **Bookmarks:** `watchman` + `watchman-20260830` at the freshened tip
  (this docs commit).
- **Confidence:** high. The rebase was conflict-free, the diffstat is
  identical, and all focused verification matches the pre-freshen record.
  The only judgment call is the floating-bookmark move off the stale
  alternate tip, which the workspace lineage and design corpus both support.

## Known flaky test

`packages/core/test/filesystem/watcher.test.ts` test
`LocationWatcher > publishes .hg/branch events` intermittently reaches its
five-second timeout in combined runs. It exercises the Node/Parcel path and
already appeared in the historical maintenance record. It has also passed in
the same workspace; do not attribute it to root-scoped Watchman without a
backend-specific reproduction.

## Possible improvements

Conscious refinements deferred from the implementation review; neither is a
known defect.

- **Invert the `WatchInput` alias.** `watcher/internal.ts` re-exports
  `Watcher.WatchInput` from `../watcher.js`, so the private leaf module
  reaches back into its parent. The `import type` is erased at runtime, so
  there is no runtime cycle, but defining the input type in the leaf module
  and re-exporting it from `watcher.ts` is the cleaner dependency direction
  if bundling or `isolatedDeclarations` ever objects.
- **Split the internals grab-bag when it grows.** `watcher/internal.ts` hosts
  the metadata symbol, `Placement`, the `WatchInput` alias, and `normalize()`.
  Normalization is watcher-core logic rather than internal metadata; if the
  module keeps growing, move it beside the registry or into its own module.

## Follow-ups

- Measure many-project cold-daemon startup and reconnect spread before making
  Watchman the default; the channel metrics dumps are the intended instrument
  for this.
- Retire the console wide-event dump in favor of OTEL export once the
  `opencode-otel` plugin tooling lands; the metrics object and render modes
  are the seam to swap.
- Publish transport declarations and replace the dynamic structural transport
  check when the fork release is available. There is no local declaration
  shim in this stack.
- Consider extracting upstream's withdrawn `SkillSourceObserver` only if that
  ownership move is revived independently; the Watchman seam does not require
  it.
- A fork PR adding a `sock` constructor option to the transport would let
  `WATCHMAN_SOCK` move behind `ServerOptions`; env-only until then, since the
  constructor accepts only `watchmanBinaryPath`.

## Cross-references

- [`draft2.gpt56t.md`](/.design/watchman/draft2.gpt56t.md) is the implemented architecture and
  its watchwoman routing amendment governs conflicts with the earlier body.
- [`watchwoman0.unknown.md`](/.design/watchman/watchwoman0.unknown.md) validates daemon crawl,
  query, root persistence, routing, and unsubscribe behavior.
- [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) records the FIFO timeout incident
  that motivated admitted dispatch and failure-domain isolation.
- [`cookie-clash0.gpt56s.md`](/.design/watchman/cookie-clash0.gpt56s.md) traces cookie lifecycle,
  cross-daemon and nested-root visibility, current Skill containment, and the
  remaining application, operational, and upstream solution threads.
- [`draft1.gpt56t.md`](/.design/watch/draft1.gpt56t.md) is the retained
  one-subscription-per-interest design from the earlier wave.
