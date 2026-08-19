---
type: Design
title: Watchman retained backend — maintenance log
description: Workspace history, rebase/repair record, verification status, and known flakies for the watchman feature stack.
status: stable
generated: { by: llm:gpt-5.6-terra, at: 2026-08-19 }
sources:
  - id: draft1
    resource: ../watch/draft1.gpt56t.md
  - id: patches
    resource: file:///home/rektide/a/doc/opencode/patches.md
---

# Watchman retained backend — maintenance log

This workspace (`~/src/opencode-watchman`) maintains the Watchman retained
backend as an independent feature stack per the conventions in
[`patches.md`](file:///home/rektide/a/doc/opencode/patches.md). The design
lives in [`../watch/draft1.gpt56t.md`](../watch/draft1.gpt56t.md) and the
earlier waves alongside it; this README records the operational history —
what happened to the workspace, what verification covers, and what is known
flaky — so that rebases and audits don't have to re-derive it.

## Current state

- Base: `v2@origin` `33567c57` (`fix(desktop): connect wildcard service
  through loopback (#43171)`), freshened 2026-08-19 across 504 upstream
  commits from the original `c29968bf` base.
- Bookmarks: `watchman` + `watchman-20260819` at `wlqzvnqm` (`298e7db1`).
- Stack shape: 8 design-doc commits (`tzvzsomw`…`ttmlyrmu` under
  `.design/watch*`) + 9 code commits:

| Commit | Scope |
| --- | --- |
| `zkotzzrk` | feat(core): add retained Watchman backend — `packages/core/src/filesystem/watchman/*` (client, schema, route, native, fb-watchman-esm typing shim), retention TTL in `watcher.ts`, deps (`@superbfowle/fb-watchman-esm`, `micromatch`, `is-glob`) |
| `llyotvxz` | feat(core): route project watcher interests — `project`/`exact` routing in Config directory watches |
| `svomsqus` | fix(core): expose Watchman client typing — typed re-export of the ESM fork client |
| `orqyrztl` | feat(cli): wire Watchman backend selection — `OPENCODE_WATCHER_BACKEND` env → `ServerOptions.fs.watcherBackend` → `Watcher.configured` |
| `wuomytpt` | fix(core): harden Watchman recovery — capability-probe failure retires generation, cursor-rejection stores replacement cursor, cancellation retires generation, stop-race interruptibility |
| `zpxxqmvn` | fix(core): finalize interrupted Watchman subscriptions — failure-scoped cleanup of subscriptions/queues/unsubscribe, route-cache invalidation on interruption, bounded generation retention |
| `qulkzzuk` | fix(core): close retired Watchman clients — late-socket guard (`connect` after retire closes), unsupported-backend terminal completion |
| `wlqzvnqm` | feat(core): port skill watch routing to config plugin — post-rebase port (below) |

## Retention decision (settled)

Flat 15m idle TTL on the Watcher `RcMap`, unchanged from `zkotzzrk`. The
60m-with-subscribers tiering was explored in the subscribers workspace and
settled as unnecessary: the location service graphs' own 60m idle retention
already hold watch references while any client/session activity exists, and
the Watcher TTL only governs Skill-invalidation churn gaps (seconds to
minutes) and the post-graph tail. Full reasoning in the subscribers
workspace's `.design/subscribers/draft2.gpt56t.md`; the subscribers feature
branch was dropped and is not needed by watchman.

## History

### Original build (2026-08-18/19)

Implemented `../watch/draft1.gpt56t.md`: one Watchman subscription per
logical interest over a shared daemon root, `watch-project`/exact routing
with generation-local Deferred route caches, per-subscription cursors with
conservative invalidation on fresh-instance/route-change/cancellation,
authoritative local ignore filtering (micromatch + exact paths) with literal
Watchman-side expression pushdown, Parcel fallback only before first
subscribe acknowledgement, 15m RcMap retention. Verified with a live
Watchman daemon smoke test (`packages/core/.test-agent/watchman/live.ts`,
gitignored scratch).

### Rider cleanup (2026-08-19)

The workspace had grown on a 503-commit-stale base carrying six unrelated
riders: `uozwnowuspz` (build fix), `vwmqxlxyxqmx` (subagent continuation),
and four pre-refresh reap commits (`nqlqurznppxp`, `nlxpsylpkltt`,
`twrxpunsrmwo`, `qlumuuxmrtrz`). All six were abandoned with `jj abandon`
(zero file overlap with watchman; the descendants rebased cleanly onto
`c29968bf`). The abandoned riders had also been the cause of a misleading
`packages/cli/test/server-connection.test.ts` failure ("expected undefined,
received 100" from reap default `evictionStrikes: 100`) — that suite passes
after the cleanup.

### Freshen onto `33567c57` (2026-08-19)

504 upstream commits. Conflicts resolved per commit with jj's canonical
`jj new <conflicted>` → resolve → `jj squash` loop (change-ids preserved;
resolutions only, no history fusion):

- Upstream migrated local imports to explicit `.js` suffixes; all watchman
  files followed (including `import("./watchman/native.js")`).
- Upstream rewrote `skill.ts` into a pure registry (deps just `[Bus.node]`)
  and moved all skill watching into `config/plugin/skill.ts`
  (ConfigSkillPlugin). Our routing hunks in `skill.ts` were resolved to the
  upstream side (dead code there) and re-landed in the plugin as `wlqzvnqm`,
  which already had `location` in scope:
  `routing: FSUtil.contains(location.project.directory, target) ? "project" : "exact"`.
- `tplvrrln` (test location binding for the old skill test) abandoned as
  obsolete; upstream's `test/skill.test.ts` and `test/plugin/skill.test.ts`
  taken wholesale.
- One bad resolution was caught and fixed: upstream's new
  `@opencode-ai/shell-scan` workspace dep had been silently dropped from
  `packages/core/package.json`; restored (typecheck failed without it).
- `bun install` on the freshened lockfile requires
  `--minimum-release-age=0`: `@superbfowle/fb-watchman-esm@3.0.0` is newer
  than the repo's 3-day `minimumReleaseAge` window in `bunfig.toml`.

Upstream's `test/config/skill.test.ts` needed two expectation updates:
`routing: "project"` on directory subscriptions under the test's project
directory, and removal of a duplicate symlink-sentinel re-acquisition entry
(the retention semantics: reacquiring the same interest inside the TTL hits
the retained entry rather than re-subscribing).

## Configuration

| Knob | Values | Effect |
| --- | --- | --- |
| `OPENCODE_WATCHER_BACKEND` | `default` / `watchman` / `parcel` | `watchman` prefers Watchman with Parcel fallback before first subscribe; `parcel` forces Parcel; unknown values fail startup |
| `OPENCODE_FILEWATCHER_DISABLE` / `OPENCODE_DISABLE_FILEWATCHER` | truthy | Disables watching entirely (takes precedence; empty streams) |
| `WATCHMAN_SOCK` | socket path | Transport-only, consumed by the fb-watchman-esm fork (`connect()` reads it before spawning `watchman get-sockname`); also removes the PATH/binary requirement |
| `ServerOptions.fs.watcherBackend` | same as env | Programmatic/embedded-server equivalent |
| `Watcher.Options { enabled, backend }` | — | In-code layer option; the seam the above feed |

Failover behavior (verified live): a dead `WATCHMAN_SOCK` or absent daemon
fails acquisition in well under a second (local-socket ECONNREFUSED) and each
affected interest falls back to Parcel with a logged warning. After the first
Watchman subscribe acknowledgement there is no silent backend switch — only
cursor-resume reconnects or a visible stream failure. Not configurable
(hardcoded so far): 15m retention TTL, 10s command timeout, reconnect retry
policy (6 × 100ms), and the fork's `watchmanBinaryPath` (unexposed; only
relevant without `WATCHMAN_SOCK`).

## Verification

Run from package directories, never repo root:

```sh
cd packages/core && bun typecheck
cd packages/core && bun test test/filesystem/watchman.test.ts test/filesystem/watcher.test.ts \
  test/skill.test.ts test/plugin/skill.test.ts test/config/config.test.ts test/config/skill.test.ts
cd packages/server && bun typecheck && bun test test/options.test.ts
cd packages/cli && bun typecheck && bun test test/server-connection.test.ts
```

Freshened-line results: core/server/cli typechecks clean; 66 pass across the
focused core suites (1 known flake, below); server options 5/5; CLI
server-connection 2/2.

## Known flaky tests (do not chase ghosts)

- **`packages/core/test/filesystem/watcher.test.ts` → `LocationWatcher >
  publishes .hg/branch events`**: intermittently times out at 5s in
  full-suite runs. Native Mercurial watcher timing sensitivity, not
  watchman — it reproduces on the Parcel path with no watchman code
  involved (`OPENCODE_WATCHER_BACKEND` unset). Re-run in isolation; it
  passes.
- `ToolOutput > removes expired managed files` — unrelated scheduling
  flake.
- Full `packages/cli` service suites can exceed a 120s shell timeout under
  subprocess churn; run with a larger timeout or per-file.

## Open follow-ups

- Fork hardening in `~/src/watchman-esm` (`watchman/node/index.js`): the
  four lifecycle items (terminal `end`, child kill, close+error teardown,
  late-socket guard) are currently compensated adapter-side in
  `packages/core/src/filesystem/watchman/client.ts`; upstreaming them to
  the fork deletes those guards. The fork now ships vendored
  DefinitelyTyped-derived `index.d.ts` (commit `pnywzysq` in that repo) —
  bump + republish is pending, after which the `fb-watchman-esm.ts` typing
  shim can be dropped.
- Spec'd diagnostics (subs-per-root, route-cache hit/miss, latency counts)
  remain unimplemented.
- Live-daemon integration test remains gitignored scratch
  (`.test-agent/watchman/live.ts`), not a committed suite.
- CLI packaging checks (bun compile / node SEA) never run.
